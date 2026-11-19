import json
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import anthropic
import httpx2  # a camada HTTP do próprio SDK: os erros dele pedem o pedido e a resposta desta biblioteca

from ia.assistente.roteiro import DOCUMENTOS_FORNECEDOR_INDIVIDUAL
from ia.assistente.servico import AVISO, AVISO_SEM_IA, responder_assistente
from ia.extrair.regras import extrair_por_regras
from ia.servidor import criar_servidor
from ia.tests.test_extrair_claude import ClienteFalso, falso_que_devolve, falso_que_lanca, falso_que_recusa, mensagem

PROMPT = Path(__file__).parents[1] / 'prompts' / 'assistente.md'
FIXTURE = Path(__file__).parent / 'fixtures' / 'chamada-exemplo.txt'
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

    def test_corpo_fora_do_formato_devolve_400_sem_chamar_o_claude(self):
        casos = {
            'sem chamada': {'perfil': PERFIL_ALFACE, 'mensagens': []},
            'sem mensagens': {'chamada': CHAMADA_EXEMPLO, 'perfil': PERFIL_ALFACE},
            'perfil sem produtos': {**self.corpo, 'perfil': {**PERFIL_ALFACE, 'produtos': None}},
            'mensagens em texto': {**self.corpo, 'mensagens': 'oi'},
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

    def test_sem_chave_o_servidor_responde_pelo_roteiro(self):
        self.servidor.cliente = None
        status, resposta = self.pedir({**self.corpo, 'mensagens': [agricultor('consigo 30 kg por semana')]})
        self.assertEqual((status, resposta['origem']), (200, 'regras'))
        self.assertEqual(resposta['sugestao'], {'itens': [{'produto_id': 'alface', 'quantidade': 1200}]})
