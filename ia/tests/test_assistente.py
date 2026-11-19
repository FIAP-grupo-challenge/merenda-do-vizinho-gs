import json
import os
import subprocess
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import anthropic
import httpx2  # a camada HTTP do próprio SDK: os erros dele pedem o pedido e a resposta desta biblioteca

from ia.assistente.roteiro import DOCUMENTOS_FORNECEDOR_INDIVIDUAL
from ia.assistente.servico import AVISO, AVISO_SEM_IA, responder_assistente
from ia.extrair.regras import extrair_por_regras
from ia.extrair.texto_pdf import texto_do_pdf
from ia.privacidade import dados_pessoais_no_texto
from ia.servidor import criar_servidor
from ia.tests.test_extrair_claude import ClienteFalso, falso_que_devolve, falso_que_lanca, falso_que_recusa, mensagem

RAIZ = Path(__file__).resolve().parents[2]
PROMPT = Path(__file__).parents[1] / 'prompts' / 'assistente.md'
FIXTURE = Path(__file__).parent / 'fixtures' / 'chamada-exemplo.txt'
PDF_CATALAO = Path(__file__).parent / 'fixtures' / 'chamada-real.pdf'
# Vale Verde (SP), lida pelo modo de regras: alface 1.200 kg, prazo 20/03/2026, sem semanas e sem lista de documentos
CHAMADA_EXEMPLO = extrair_por_regras(FIXTURE.read_text(encoding='utf-8'))
PERFIL_ALFACE = {
    'municipio': 'Vale Verde', 'uf': 'SP', 'organico': False, 'prioridade_rits': False,
    'produtos': [{'produto_id': 'alface', 'quantidade_semana': 30, 'meses_safra': list(range(1, 13))}],
}
RESPOSTA_DA_IA = {'resposta': 'O prazo vai até 20/03/2026. Quanto você entrega por semana?', 'sugestao': {'itens': []}}


def agricultor(texto):
    return {'papel': 'agricultor', 'texto': texto}


def com_produtos(*ids):
    return {**PERFIL_ALFACE, 'produtos': [{'produto_id': i, 'quantidade_semana': 5, 'meses_safra': [3]} for i in ids]}


def com_item(**campos):
    """CHAMADA_EXEMPLO com o primeiro item (a alface) alterado."""
    return {**CHAMADA_EXEMPLO, 'itens': [{**CHAMADA_EXEMPLO['itens'][0], **campos}, *CHAMADA_EXEMPLO['itens'][1:]]}


class TestRoteiro(unittest.TestCase):
    def test_roteiro_primeira_resposta_cita_prazo_e_itens(self):
        r = responder_assistente(CHAMADA_EXEMPLO, PERFIL_ALFACE, [])
        self.assertEqual(r['origem'], 'regras')
        self.assertIn('20/03/2026', r['resposta'])
        self.assertIn('alface', r['resposta'].lower())
        self.assertIn('por semana', r['resposta'])  # pergunta a quantidade semanal
        self.assertEqual(r['sugestao'], {'itens': []})
        self.assertEqual(r['checklist'], DOCUMENTOS_FORNECEDOR_INDIVIDUAL)  # a chamada não trouxe a lista
        self.assertTrue(r['resposta'].endswith(AVISO))

    def test_roteiro_le_quantidade_semanal_e_sugere_total(self):
        r = responder_assistente(CHAMADA_EXEMPLO, PERFIL_ALFACE, [agricultor('consigo 30 kg por semana de alface')])
        self.assertEqual(r['sugestao']['itens'][0]['produto_id'], 'alface')
        self.assertLessEqual(r['sugestao']['itens'][0]['quantidade'], 1200)

    def test_sugestao_e_numero_vezes_semanas_sem_passar_do_pedido(self):
        casos = [  # (mensagem, semanas da chamada, quantidade sugerida)
            ('consigo 10 kg por semana', None, 400),  # 10 × 40, o padrão de compartilhado/regras-pnae.json
            ('uns 50 kg', None, 1200),  # 50 × 40 = 2.000 passa do pedido de 1.200
            ('30', 20, 600),  # a chamada diz 20 semanas
        ]
        for texto, semanas, quantidade in casos:
            with self.subTest(texto=texto):
                chamada = {**CHAMADA_EXEMPLO, 'semanas_fornecimento': semanas}
                r = responder_assistente(chamada, PERFIL_ALFACE, [agricultor(texto)])
                self.assertEqual(r['sugestao'], {'itens': [{'produto_id': 'alface', 'quantidade': quantidade}]})
                self.assertIn(f'oferecer {quantidade:,} kg'.replace(',', '.'), r['resposta'])  # o texto diz o mesmo

    def test_item_sem_quantidade_fica_de_fora(self):
        chamada = {**CHAMADA_EXEMPLO, 'itens': [{**CHAMADA_EXEMPLO['itens'][0], 'quantidade': None},
                                                *CHAMADA_EXEMPLO['itens'][1:]]}
        r = responder_assistente(chamada, com_produtos('alface', 'mandioca'), [])
        self.assertNotIn('Alface', r['resposta'])
        self.assertIn('Mandioca descascada (800 kg)', r['resposta'])

    def test_vale_o_item_citado_na_mensagem_e_sem_nome_o_primeiro(self):
        perfil = com_produtos('alface', 'mandioca')
        r = responder_assistente(CHAMADA_EXEMPLO, perfil, [agricultor('dou conta de 5 kg de mandioca')])
        self.assertEqual(r['sugestao']['itens'], [{'produto_id': 'mandioca', 'quantidade': 200}])
        r = responder_assistente(CHAMADA_EXEMPLO, perfil, [agricultor('dou conta de 5 kg')])
        self.assertEqual(r['sugestao']['itens'], [{'produto_id': 'alface', 'quantidade': 200}])

    def test_le_a_ultima_mensagem_do_agricultor(self):
        conversa = [agricultor('consigo 10 kg'), {'papel': 'assistente', 'texto': 'São 400 kg.'}, agricultor('não, 20')]
        r = responder_assistente(CHAMADA_EXEMPLO, PERFIL_ALFACE, conversa)
        self.assertEqual(r['sugestao']['itens'], [{'produto_id': 'alface', 'quantidade': 800}])

    def test_sem_numero_pergunta_de_novo_e_sem_item_compativel_avisa(self):
        for texto in ('quais documentos eu preciso?', 'por enquanto 0'):
            with self.subTest(texto=texto):
                r = responder_assistente(CHAMADA_EXEMPLO, PERFIL_ALFACE, [agricultor(texto)])
                self.assertEqual(r['sugestao'], {'itens': []})
                self.assertIn('Não achei o número', r['resposta'])
        r = responder_assistente(CHAMADA_EXEMPLO, com_produtos('tomate'), [agricultor('consigo 30 kg')])
        self.assertEqual(r['sugestao'], {'itens': []})
        self.assertIn('nenhum', r['resposta'].lower())

    def test_checklist_vem_da_chamada_quando_ela_traz_a_lista(self):
        documentos = ['Extrato do CAF', 'Projeto de venda assinado']
        r = responder_assistente({**CHAMADA_EXEMPLO, 'documentos_exigidos': documentos}, PERFIL_ALFACE, [])
        self.assertEqual(r['checklist'], documentos)

    def test_resposta_do_roteiro_volta_na_conversa_sem_ser_barrada(self):
        # o app reenvia a conversa inteira, com as respostas do assistente: nenhuma pode parecer dado pessoal
        chamada = extrair_por_regras(texto_do_pdf(PDF_CATALAO.read_bytes()))  # os 16 itens de Catalão
        perfil = com_produtos(*sorted({item['produto_id'] for item in chamada['itens']} - {None}))
        for texto in (None, 'consigo 30 kg por semana', 'uns 1.200 kg', '50', 'quanto posso oferecer?'):
            with self.subTest(texto=texto):
                r = responder_assistente(chamada, perfil, [] if texto is None else [agricultor(texto)])
                self.assertEqual(dados_pessoais_no_texto(r['resposta']), [])

    def test_item_sem_nome_ou_sem_unidade_nao_quebra_o_roteiro(self):
        sem_nome_nem_unidade = {chave: valor for chave, valor in CHAMADA_EXEMPLO['itens'][0].items()
                                if chave not in ('produto', 'unidade')}
        for nome, item in {'sem as chaves': sem_nome_nem_unidade,
                           'com nulos': {**sem_nome_nem_unidade, 'produto': None, 'unidade': None}}.items():
            for mensagens in ([], [agricultor('consigo 10')]):
                with self.subTest(nome, mensagens=len(mensagens)):
                    chamada = {**CHAMADA_EXEMPLO, 'itens': [item]}
                    r = responder_assistente(chamada, PERFIL_ALFACE, mensagens)
                    self.assertIn('alface', r['resposta'])  # sem o nome do edital, vale o id do catálogo
                    self.assertNotIn('None', r['resposta'])


class TestComClaude(unittest.TestCase):
    def test_claude_falso_devolve_origem_ia_e_erro_cai_para_regras(self):
        r = responder_assistente(CHAMADA_EXEMPLO, PERFIL_ALFACE, [], cliente=falso_que_devolve(RESPOSTA_DA_IA))
        self.assertEqual(r['origem'], 'ia')
        self.assertEqual(r['resposta'], f"{RESPOSTA_DA_IA['resposta']}\n\n{AVISO}")
        self.assertEqual(r['checklist'], DOCUMENTOS_FORNECEDOR_INDIVIDUAL)  # sai do código, não do modelo
        with self.assertLogs('ia', 'WARNING'):  # a queda vai para o log, que não suja a saída dos testes
            r = responder_assistente(CHAMADA_EXEMPLO, PERFIL_ALFACE, [], cliente=falso_que_lanca(TimeoutError()))
        self.assertEqual(r['origem'], 'regras')
        self.assertTrue(r['resposta'].startswith(AVISO_SEM_IA))
        self.assertIn('20/03/2026', r['resposta'])  # a primeira resposta do roteiro
        self.assertTrue(r['resposta'].endswith(AVISO))

    def test_recusa_do_modelo_vira_resposta_do_roteiro_com_aviso(self):
        with self.assertLogs('ia', 'WARNING') as log:
            r = responder_assistente(CHAMADA_EXEMPLO, PERFIL_ALFACE, [], cliente=falso_que_recusa())
        self.assertEqual(r['origem'], 'regras')
        self.assertTrue(r['resposta'].startswith(AVISO_SEM_IA))
        self.assertTrue(r['resposta'].endswith(AVISO))
        self.assertIn('refusal', log.output[0])

    def test_falha_da_api_ou_resposta_inutil_cai_para_o_roteiro(self):
        pedido = httpx2.Request('POST', 'https://api.anthropic.com/v1/messages')
        respostas = {
            'tempo esgotado': anthropic.APITimeoutError(request=pedido),
            'sem conexão': anthropic.APIConnectionError(request=pedido),
            'sobrecarga': anthropic.APIStatusError('x', response=httpx2.Response(529, request=pedido), body=None),
            'recusa com JSON válido': mensagem('refusal', json.dumps(RESPOSTA_DA_IA)),  # só o stop_reason pega
            'cortada no limite': mensagem('max_tokens', '{"resposta": "O pra'),
            'texto que não é JSON': mensagem('end_turn', 'não é JSON'),
            'sem sugestao': mensagem('end_turn', '{"resposta": "oi"}'),
            'resposta nula': mensagem('end_turn', json.dumps({**RESPOSTA_DA_IA, 'resposta': None})),
            'resposta vazia': mensagem('end_turn', json.dumps({**RESPOSTA_DA_IA, 'resposta': ''})),
            'resposta só com espaços': mensagem('end_turn', json.dumps({**RESPOSTA_DA_IA, 'resposta': ' \n\t '})),
            'itens fora de lista': mensagem('end_turn', json.dumps({'resposta': 'oi', 'sugestao': {'itens': {}}})),
            'quantidade em texto': mensagem('end_turn', json.dumps(
                {'resposta': 'oi', 'sugestao': {'itens': [{'produto_id': 'alface', 'quantidade': '500'}]}})),
        }
        for nome, resposta in respostas.items():
            with self.subTest(nome):
                if isinstance(resposta, Exception):
                    cliente = falso_que_lanca(resposta)
                else:
                    cliente = ClienteFalso(lambda: resposta)
                with self.assertLogs('ia', 'WARNING'):
                    r = responder_assistente(CHAMADA_EXEMPLO, PERFIL_ALFACE, [agricultor('consigo 10 kg')],
                                             cliente=cliente)
                self.assertEqual(r['origem'], 'regras')
                self.assertTrue(r['resposta'].startswith(AVISO_SEM_IA))
                self.assertEqual(r['sugestao']['itens'], [{'produto_id': 'alface', 'quantidade': 400}])

    def test_resposta_da_ia_e_limitada_ao_pedido_e_leva_o_aviso(self):
        dados = {'resposta': f'Dá para oferecer 5.000 kg de alface. {AVISO}', 'sugestao': {'itens': [
            {'produto_id': 'alface', 'quantidade': 5000},
            {'produto_id': 'tomate', 'quantidade': 300},  # a chamada não pede
            {'produto_id': 'banana', 'quantidade': 100},  # a chamada pede, mas ele não produz
            {'produto_id': 'mandioca', 'quantidade': 0},  # nada a oferecer
        ]}}
        r = responder_assistente(CHAMADA_EXEMPLO, com_produtos('alface', 'mandioca'),
                                 [agricultor('consigo 125 kg por semana')], cliente=falso_que_devolve(dados))
        self.assertEqual(r['sugestao'], {'itens': [{'produto_id': 'alface', 'quantidade': 1200}]})
        self.assertTrue(r['resposta'].endswith(AVISO))
        self.assertEqual(r['resposta'].count(AVISO), 1)  # o modelo já tinha escrito o aviso: não sai duas vezes

    def test_mesmo_produto_em_dois_itens_soma_os_pedidos(self):
        # como a abóbora de Catalão (390 un e 1.640 kg): a capacidade do produto vale para os dois itens, como na T7
        chamada = {**CHAMADA_EXEMPLO, 'itens': [*CHAMADA_EXEMPLO['itens'], {**CHAMADA_EXEMPLO['itens'][0],
                                                                            'unidade': 'pç', 'quantidade': 300}]}
        dados = {'resposta': 'ok', 'sugestao': {'itens': [{'produto_id': 'alface', 'quantidade': 5000}]}}
        r = responder_assistente(chamada, PERFIL_ALFACE, [], cliente=falso_que_devolve(dados))
        self.assertEqual(r['sugestao']['itens'], [{'produto_id': 'alface', 'quantidade': 1500}])

    def test_pedido_leva_esforco_baixo_a_conversa_e_so_o_perfil_minimo(self):
        cliente = falso_que_devolve(RESPOSTA_DA_IA)
        perfil = {**PERFIL_ALFACE, 'apelido': 'Sítio da Dona Rosa',
                  'produtos': [{**PERFIL_ALFACE['produtos'][0], 'anotacao': 'vizinha do prefeito'}]}
        conversa = [agricultor('oi'), {'papel': 'assistente', 'texto': 'Olá!'}, agricultor('consigo 30 kg')]
        responder_assistente(CHAMADA_EXEMPLO, perfil, conversa, cliente=cliente, modelo='claude-haiku-5-5')
        self.assertEqual(cliente.opcoes, {'timeout': 60, 'max_retries': 0})  # sem novas tentativas de 60 s cada
        pedido = cliente.pedido
        self.assertEqual((pedido['model'], pedido['system']), ('claude-haiku-5-5', PROMPT.read_text(encoding='utf-8')))
        self.assertEqual(pedido['output_config']['effort'], 'low')
        self.assertEqual(pedido['output_config']['format']['type'], 'json_schema')
        # o Haiku 5.5 responde 400 a parâmetros de amostragem e não tem fallback; o pensamento fica no padrão
        self.assertEqual({'temperature', 'top_p', 'top_k', 'thinking', 'fallbacks', 'betas'} & set(pedido), set())
        dados, *resto = pedido['messages']
        # termina numa mensagem do agricultor: o Haiku 5.5 não aceita prefill
        self.assertEqual([(m['role'], m['content']) for m in resto],
                         [('user', 'oi'), ('assistant', 'Olá!'), ('user', 'consigo 30 kg')])
        self.assertEqual(dados['role'], 'user')
        contexto = json.loads(dados['content'].split('\n', 1)[1])
        self.assertEqual(contexto['chamada'], CHAMADA_EXEMPLO)
        self.assertEqual(contexto['perfil'], PERFIL_ALFACE)  # o que vier além do formato do perfil fica de fora
        self.assertEqual(contexto['semanas_de_entrega'], 40)  # a chamada não diz: o padrão de regras-pnae.json
        self.assertEqual(contexto['documentos'], DOCUMENTOS_FORNECEDOR_INDIVIDUAL)
        self.assertNotIn('Rosa', json.dumps(pedido, ensure_ascii=False))
        self.assertNotIn('prefeito', json.dumps(pedido, ensure_ascii=False))


class TestServidorAssistente(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.servidor = criar_servidor(0)
        threading.Thread(target=cls.servidor.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.servidor.server_port}/assistente'
        cls.corpo = {'chamada': CHAMADA_EXEMPLO, 'perfil': PERFIL_ALFACE, 'mensagens': []}

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()
        cls.servidor.server_close()

    def pedir(self, corpo):
        try:
            with urllib.request.urlopen(urllib.request.Request(self.url, data=json.dumps(corpo).encode()),
                                        timeout=30) as resposta:
                return resposta.status, json.loads(resposta.read())
        except urllib.error.HTTPError as erro:
            with erro:
                return erro.code, json.loads(erro.read())

    def test_post_assistente_com_cpf_devolve_400(self):
        casos = [
            ({**self.corpo, 'perfil': {**PERFIL_ALFACE, 'cpf': '529.982.247-25'}}, ['cpf']),
            ({**self.corpo, 'mensagens': [agricultor('meu cpf é 529.982.247-25')]}, ['cpf']),
            ({**self.corpo, 'perfil': {**PERFIL_ALFACE, 'grupo_prioritario': ['quilombola']}}, ['grupo_prioritario']),
            # a chave proibida e o dado no texto somam, sem repetir e em ordem alfabética
            ({**self.corpo, 'perfil': {**PERFIL_ALFACE, 'cpf': '1'}, 'mensagens': [agricultor('a@b.com e a@c.com')]},
             ['cpf', 'email']),
        ]
        for corpo, campos in casos:
            with self.subTest(campos=campos):
                self.servidor.cliente = cliente = falso_que_devolve(RESPOSTA_DA_IA)
                self.assertEqual(self.pedir(corpo), (400, {'erro': 'dados pessoais não são aceitos', 'campos': campos}))
                self.assertIsNone(cliente.pedido)  # nada foi enviado ao Claude
        # controle positivo: o mesmo corpo sem o dado pessoal chega ao Claude
        self.servidor.cliente = cliente = falso_que_devolve(RESPOSTA_DA_IA)
        status, resposta = self.pedir(self.corpo)
        self.assertEqual((status, resposta['origem']), (200, 'ia'))
        self.assertIsNotNone(cliente.pedido)

    def test_post_assistente_com_dado_pessoal_no_texto_devolve_400_e_quantidade_ou_preco_passa(self):
        casos = [  # (mensagens, campos barrados); lista vazia: tem de passar e chegar ao Claude
            ([agricultor('Sou o João da Silva, meu e-mail é joao.silva@gmail.com e meu zap é (64) 99999-8888. '
                         'Consigo 30 kg por semana')], ['email', 'telefone']),
            ([agricultor('meu zap: 64 99999-8888')], ['telefone']),
            ([agricultor('meu cpf é 529 982 247 25')], ['cpf']),
            ([agricultor('agência 1234 conta 56789-0')], ['banco']),
            # a conversa inteira é lida, na ordem que vier: o app reenvia as respostas do assistente
            ([agricultor('oi'), {'papel': 'assistente', 'texto': 'meu pix 12345678000199'}, agricultor('3')],
             ['banco']),
            ([agricultor('a@b.com'), agricultor('64 99999-8888')], ['email', 'telefone']),
            *[([agricultor(texto)], []) for texto in
              ('1200', '1.200 kg', '30 kg por semana', 'R$ 5,40', '1200 3000', '2026', 'dou conta de 1200 kg')],
        ]
        for mensagens, campos in casos:
            with self.subTest(mensagens=mensagens[-1]['texto'][:40]):
                self.servidor.cliente = cliente = falso_que_devolve(RESPOSTA_DA_IA)
                status, resposta = self.pedir({**self.corpo, 'mensagens': mensagens})
                if campos:
                    erro = {'erro': 'dados pessoais não são aceitos', 'campos': campos}
                    self.assertEqual((status, resposta), (400, erro))
                    self.assertIsNone(cliente.pedido)  # nada foi enviado ao Claude
                else:
                    self.assertEqual((status, resposta['origem']), (200, 'ia'))
                    self.assertIsNotNone(cliente.pedido)

    def test_corpo_fora_do_formato_devolve_400_sem_chamar_o_claude(self):
        casos = {
            'sem chamada': {'perfil': PERFIL_ALFACE, 'mensagens': []},
            'sem mensagens': {'chamada': CHAMADA_EXEMPLO, 'perfil': PERFIL_ALFACE},
            'perfil sem produtos': {**self.corpo, 'perfil': {**PERFIL_ALFACE, 'produtos': None}},
            'mensagens em texto': {**self.corpo, 'mensagens': 'oi'},
            # o que dava 500: o dado errado ia até a conta do roteiro e do conferir
            'item nulo': {**self.corpo, 'chamada': {**CHAMADA_EXEMPLO, 'itens': [None]}},
            'item em texto': {**self.corpo, 'chamada': {**CHAMADA_EXEMPLO, 'itens': ['x']}},
            'produto do perfil nulo': {**self.corpo, 'perfil': {**PERFIL_ALFACE, 'produtos': [None]}},
            'produto do perfil em texto': {**self.corpo, 'perfil': {**PERFIL_ALFACE, 'produtos': ['alface']}},
            'quantidade em texto': {**self.corpo, 'chamada': com_item(quantidade='1200')},
            'quantidade verdadeiro': {**self.corpo, 'chamada': com_item(quantidade=True)},  # bool não é número
            'quantidade NaN': {**self.corpo, 'chamada': com_item(quantidade=float('nan'))},
            'quantidade Infinity': {**self.corpo, 'chamada': com_item(quantidade=float('inf'))},
            # o que dava 500: o inteiro não cabe em float, e a conta da validação estourava (OverflowError)
            'quantidade inteira de 309 dígitos': {**self.corpo, 'chamada': com_item(quantidade=2 * 10 ** 308)},
            'quantidade inteira gigante': {**self.corpo, 'chamada': com_item(quantidade=10 ** 400)},
            'quantidade inteira gigante e negativa': {**self.corpo, 'chamada': com_item(quantidade=-10 ** 400)},
            'semanas inteiras gigantes': {**self.corpo, 'chamada': {**CHAMADA_EXEMPLO, 'semanas_fornecimento': 10 ** 400}},
            'produto_id em lista': {**self.corpo, 'chamada': com_item(produto_id=['alface'])},
            'produto_id do perfil em lista': {**self.corpo, 'perfil': {
                **PERFIL_ALFACE, 'produtos': [{**PERFIL_ALFACE['produtos'][0], 'produto_id': ['alface']}]}},
            'unidade em número': {**self.corpo, 'chamada': com_item(unidade=5)},
            'produto em lista': {**self.corpo, 'chamada': com_item(produto=['Alface'])},
            'semanas em texto': {**self.corpo, 'chamada': {**CHAMADA_EXEMPLO, 'semanas_fornecimento': '20'}},
            'prazo em número': {**self.corpo, 'chamada': {**CHAMADA_EXEMPLO, 'prazo_envio': 20260320}},
            'documentos em número': {**self.corpo, 'chamada': {**CHAMADA_EXEMPLO, 'documentos_exigidos': 5}},
            'documento que não é texto': {**self.corpo, 'chamada': {**CHAMADA_EXEMPLO, 'documentos_exigidos': [1]}},
            # no meio da conversa: no fim, a regra da última mensagem já barraria
            'papel desconhecido': {**self.corpo, 'mensagens': [{'papel': 'prefeitura', 'texto': 'x'}, agricultor('3')]},
            'texto vazio': {**self.corpo, 'mensagens': [agricultor('  ')]},
            'termina no assistente': {**self.corpo,
                                      'mensagens': [agricultor('oi'), {'papel': 'assistente', 'texto': 'olá'}]},
        }
        for nome, corpo in casos.items():
            with self.subTest(nome):
                self.servidor.cliente = cliente = falso_que_devolve(RESPOSTA_DA_IA)
                status, resposta = self.pedir(corpo)
                self.assertEqual((status, list(resposta)), (400, ['erro']))
                self.assertIsNone(cliente.pedido)

    def test_campos_nulos_ou_ausentes_da_chamada_valem_e_nao_dao_500(self):
        sem_nome_nem_unidade = {chave: valor for chave, valor in CHAMADA_EXEMPLO['itens'][0].items()
                                if chave not in ('produto', 'unidade')}
        sem_id_nem_quantidade = {**CHAMADA_EXEMPLO['itens'][1], 'produto_id': None, 'quantidade': None, 'unidade': None}
        chamada = {**CHAMADA_EXEMPLO, 'prazo_envio': None, 'semanas_fornecimento': None, 'documentos_exigidos': None,
                   'itens': [sem_nome_nem_unidade, sem_id_nem_quantidade]}
        perfil = {**PERFIL_ALFACE, 'produtos': [*PERFIL_ALFACE['produtos'], {'produto_id': None}]}
        for cliente in (None, falso_que_devolve(RESPOSTA_DA_IA)):  # roteiro e IA
            for mensagens in ([], [agricultor('consigo 30 kg')]):
                with self.subTest(cliente=cliente is not None, mensagens=len(mensagens)):
                    self.servidor.cliente = cliente
                    status, resposta = self.pedir({'chamada': chamada, 'perfil': perfil, 'mensagens': mensagens})
                    self.assertEqual((status, resposta['origem']), (200, 'regras' if cliente is None else 'ia'))

    def test_sem_chave_o_servidor_responde_pelo_roteiro(self):
        self.servidor.cliente = None
        status, resposta = self.pedir({**self.corpo, 'mensagens': [agricultor('consigo 30 kg por semana')]})
        self.assertEqual((status, resposta['origem']), (200, 'regras'))
        self.assertEqual(resposta['sugestao'], {'itens': [{'produto_id': 'alface', 'quantidade': 1200}]})


class TestComOSdkDeVerdade(unittest.TestCase):
    """O SDK de verdade falando com um servidor local que faz de conta que é a API (o padrão de test_extrair_claude):
    sem rede, com chave falsa. O cliente falso não pega um parâmetro que o SDK renomeou nem o que ele manda de fato."""

    def setUp(self):
        self.pedidos = []  # o que a API recebeu
        teste = self

        class ApiFalsa(BaseHTTPRequestHandler):
            def do_POST(self):
                teste.pedidos.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                corpo = mensagem('end_turn', json.dumps(RESPOSTA_DA_IA)).model_dump_json().encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)

            def log_message(self, *args):
                pass

        servidor = ThreadingHTTPServer(('127.0.0.1', 0), ApiFalsa)
        threading.Thread(target=servidor.serve_forever, daemon=True).start()
        self.addCleanup(servidor.server_close)
        self.addCleanup(servidor.shutdown)
        self.cliente = anthropic.Anthropic(api_key='chave-falsa', base_url=f'http://127.0.0.1:{servidor.server_port}')
        self.addCleanup(self.cliente.close)

    def test_o_pedido_que_o_sdk_manda_e_o_que_a_api_espera(self):
        conversa = [agricultor('oi'), {'papel': 'assistente', 'texto': 'Olá!'}, agricultor('consigo 30 kg')]
        r = responder_assistente(CHAMADA_EXEMPLO, PERFIL_ALFACE, conversa, cliente=self.cliente,
                                 modelo='claude-haiku-5-5')
        self.assertEqual((r['origem'], r['resposta']), ('ia', f"{RESPOSTA_DA_IA['resposta']}\n\n{AVISO}"))
        [pedido] = self.pedidos  # sem novas tentativas do SDK
        self.assertEqual(set(pedido), {'model', 'max_tokens', 'messages', 'output_config', 'system'})
        self.assertEqual((pedido['model'], pedido['system']), ('claude-haiku-5-5', PROMPT.read_text(encoding='utf-8')))
        self.assertEqual(pedido['output_config']['effort'], 'low')
        self.assertEqual(pedido['output_config']['format']['type'], 'json_schema')
        # os dados da conversa e depois a conversa, termina numa mensagem do agricultor (o Haiku 5.5 não aceita prefill)
        self.assertEqual([m['role'] for m in pedido['messages']], ['user', 'user', 'assistant', 'user'])
        self.assertEqual([m['content'] for m in pedido['messages'][1:]], ['oi', 'Olá!', 'consigo 30 kg'])


class TestSemanasPadrao(unittest.TestCase):
    """SEMANAS_PADRAO vale igual no app e no assistente: a variável de ambiente, e sem ela o regras-pnae.json."""
    CONTA_DO_ROTEIRO = (  # 10 kg por semana de alface numa chamada sem semanas: a quantidade sugerida
        "from ia.assistente.roteiro import responder_por_roteiro as r; "
        "c = {'itens': [{'produto': 'Alface', 'produto_id': 'alface', 'unidade': 'kg', 'quantidade': 1200}]}; "
        "print(r(c, {'produtos': [{'produto_id': 'alface'}]}, [{'papel': 'agricultor', 'texto': '10'}])"
        "['sugestao']['itens'][0]['quantidade'])")

    @staticmethod
    def rodar_com(valor, codigo='from ia.assistente.roteiro import SEMANAS_PADRAO; print(SEMANAS_PADRAO)'):
        """(stdout, stderr) de um processo novo: a variável é lida quando o roteiro é importado."""
        ambiente = {chave: v for chave, v in os.environ.items() if chave != 'SEMANAS_PADRAO'}
        if valor is not None:
            ambiente['SEMANAS_PADRAO'] = valor
        saida = subprocess.run([sys.executable, '-c', codigo], cwd=RAIZ, env=ambiente, capture_output=True, text=True,
                               timeout=60, check=True)
        return saida.stdout.strip(), saida.stderr

    def test_a_variavel_troca_o_padrao_e_a_conta_do_roteiro(self):
        self.assertEqual(self.rodar_com('36'), ('36', ''))
        self.assertEqual(self.rodar_com('36.5'), ('36.5', ''))
        self.assertEqual(self.rodar_com('36', self.CONTA_DO_ROTEIRO), ('360.0', ''))  # 10 × 36
        self.assertEqual(self.rodar_com(None, self.CONTA_DO_ROTEIRO), ('400.0', ''))  # 10 × 40

    def test_sem_variavel_ou_vazia_vale_o_json(self):
        self.assertEqual(self.rodar_com(None), ('40', ''))
        self.assertEqual(self.rodar_com(''), ('40', ''))  # vazia vale como ausente, como no app

    def test_valor_que_nao_e_numero_maior_que_zero_e_ignorado_com_aviso_no_stderr(self):
        for valor in ('quarenta', '0', '-5', 'nan', 'inf', '36,5'):
            with self.subTest(valor=valor):
                semanas, erro = self.rodar_com(valor)
                self.assertEqual(semanas, '40')
                self.assertIn(f'SEMANAS_PADRAO inválida ({valor!r})', erro)
