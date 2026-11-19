import base64
import json
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import anthropic
import httpx2  # a camada HTTP do próprio SDK: os erros dele pedem o pedido e a resposta desta biblioteca
from anthropic.types import Message

from ia.extrair.esquema import ESQUEMA_CHAMADA, ESQUEMA_ITEM
from ia.extrair.regras import extrair_por_regras
from ia.extrair.servico import extrair_chamada
from ia.servidor import criar_servidor

PDF_B64 = base64.b64encode((Path(__file__).parent / 'fixtures' / 'chamada-real.pdf').read_bytes()).decode()
PROMPT = Path(__file__).parents[1] / 'prompts' / 'extrair-chamada.md'

# Uma chamada no formato da T2, como o Claude a devolve: o produto_id vem nulo, quem preenche é o catálogo.
CHAMADA_OK = {
    'numero': '001/2026', 'orgao': 'Prefeitura Municipal de Vale Verde', 'municipio': 'Vale Verde', 'uf': 'SP',
    'data_publicacao': None, 'prazo_envio': '2026-03-20', 'periodo_fornecimento': 'abril a dezembro de 2026',
    'semanas_fornecimento': None, 'local_entrega': None, 'documentos_exigidos': ['extrato do CAF'],
    'criterios_prioridade': [], 'contato': None,
    'itens': [{'produto': 'Alface crespa', 'produto_id': None, 'unidade': 'kg', 'quantidade': 1200,
               'preco_unitario': 5.4, 'valor_total': 6480.0, 'entrega': None, 'observacoes': None}],
}


def mensagem(stop_reason, texto=None):
    """Resposta como o SDK a monta. O Haiku 5.5 pensa antes de responder: o texto não é o primeiro bloco."""
    conteudo = [{'type': 'thinking', 'thinking': '', 'signature': 'assinatura'}]
    if texto is not None:
        conteudo.append({'type': 'text', 'text': texto})
    return Message.model_validate({
        'id': 'msg_teste', 'type': 'message', 'role': 'assistant', 'model': 'claude-haiku-5-5',
        'content': conteudo, 'stop_reason': stop_reason, 'usage': {'input_tokens': 1, 'output_tokens': 1},
    })


class ClienteFalso:
    """A parte do SDK que extrair_com_claude usa, with_options(...).messages.create(...), sem rede."""

    def __init__(self, responder):
        self.responder, self.opcoes, self.pedido = responder, None, None
        self.messages = self

    def with_options(self, **opcoes):
        self.opcoes = opcoes
        return self

    def create(self, **pedido):
        self.pedido = pedido
        return self.responder()


def falso_que_devolve(chamada):
    return ClienteFalso(lambda: mensagem('end_turn', json.dumps(chamada)))


def falso_que_lanca(erro):
    def lancar():
        raise erro
    return ClienteFalso(lancar)


def falso_que_recusa():
    return ClienteFalso(lambda: mensagem('refusal'))


def queda_para_regras(teste, cliente):
    """extrair_chamada com uma IA que falha: devolve (resultado, linhas do log). O aviso da queda vai para o log,
    que assim não suja a saída dos testes; se a queda não logar, o assertLogs reprova."""
    with teste.assertLogs('ia', 'WARNING') as log:
        resultado = extrair_chamada({'pdf_base64': PDF_B64}, cliente=cliente)
    return resultado, log.output


class TestExtrairComClaude(unittest.TestCase):
    def test_com_cliente_origem_e_ia(self):
        r = extrair_chamada({'pdf_base64': PDF_B64}, cliente=falso_que_devolve(CHAMADA_OK), modelo='claude-haiku-5-5')
        self.assertEqual((r['origem'], r['modelo']), ('ia', 'claude-haiku-5-5'))
        self.assertEqual(r['chamada']['itens'][0]['produto_id'], 'alface')

    def test_falha_da_ia_cai_para_regras(self):
        r, _ = queda_para_regras(self, falso_que_lanca(TimeoutError('timeout')))
        self.assertEqual(r['origem'], 'regras'); self.assertTrue(r['avisos'][0].startswith('IA indisponível'))

    def test_recusa_do_modelo_cai_para_regras(self):
        r, _ = queda_para_regras(self, falso_que_recusa())
        self.assertEqual(r['origem'], 'regras')

    def test_resposta_inutil_cai_para_regras_com_o_motivo(self):
        item = CHAMADA_OK['itens'][0]
        casos = [
            ('refusal', None, 'o modelo recusou o pedido'),
            ('max_tokens', '{"numero": "003', 'resposta cortada no limite de tokens'),
            ('end_turn', 'não é JSON', 'resposta fora do esquema'),
            ('end_turn', '{"itens": []}', 'resposta fora do esquema'),
            ('end_turn', json.dumps({**CHAMADA_OK, 'itens': [{'produto': 'x'}]}), 'resposta fora do esquema'),
            ('end_turn', json.dumps({**CHAMADA_OK, 'itens': None}), 'resposta fora do esquema'),
            ('end_turn', json.dumps({**CHAMADA_OK, 'itens': {}}), 'resposta fora do esquema'),  # percorrível e vazio: só a conferência do tipo pega
            # chaves certas e tipo errado: sem a conferência, o identificar_produto(None) daria erro no servidor
            ('end_turn', json.dumps({**CHAMADA_OK, 'itens': [{**item, 'produto': None}]}), 'resposta fora do esquema'),
            ('end_turn', json.dumps({**CHAMADA_OK, 'itens': [{**item, 'unidade': None}]}), 'resposta fora do esquema'),
        ]
        for stop_reason, texto, motivo in casos:
            with self.subTest(stop_reason=stop_reason, texto=texto):
                resposta = mensagem(stop_reason, texto)
                r, _ = queda_para_regras(self, ClienteFalso(lambda: resposta))
                self.assertEqual((r['origem'], r['modelo']), ('regras', None))
                self.assertEqual(r['avisos'], [f'IA indisponível ({motivo}); usei o modo de regras'])
                self.assertEqual(len(r['chamada']['itens']), 16)  # o modo de regras leu o edital de Catalão

    def test_a_causa_da_queda_vai_para_o_log(self):
        causa = TypeError("'NoneType' object is not iterable")  # o que o SDK deixa escapar com content nulo
        r, log = queda_para_regras(self, falso_que_lanca(causa))
        self.assertEqual(r['avisos'], ['IA indisponível (resposta fora do esquema); usei o modo de regras'])
        # só o motivo e o repr da causa: nunca o corpo da resposta nem a chave
        self.assertEqual(log, [f'WARNING:ia.extrair.servico:IA indisponível (resposta fora do esquema); causa: {causa!r}'])

    def test_produto_id_vem_sempre_do_catalogo(self):
        item = CHAMADA_OK['itens'][0]
        chamada = {**CHAMADA_OK, 'itens': [
            {**item, 'produto': 'Banana prata', 'produto_id': 'id-inventado'},
            {**item, 'produto': 'Pitaia', 'produto_id': 'pitaia'},  # fora do catálogo
        ]}
        r = extrair_chamada({'pdf_base64': PDF_B64}, cliente=falso_que_devolve(chamada))
        self.assertEqual([i['produto_id'] for i in r['chamada']['itens']], ['banana', None])

    def test_pedido_leva_so_o_pdf_e_o_prompt_no_esquema_com_esforco_medio(self):
        cliente = falso_que_devolve(CHAMADA_OK)
        extrair_chamada({'pdf_base64': PDF_B64}, cliente=cliente, modelo='claude-haiku-5-5', timeout_s=30)
        self.assertEqual(cliente.opcoes, {'timeout': 30, 'max_retries': 0})  # sem novas tentativas de 30 s cada
        pedido = cliente.pedido
        self.assertEqual(pedido['model'], 'claude-haiku-5-5')
        self.assertEqual(pedido['output_config'],
                         {'effort': 'medium', 'format': {'type': 'json_schema', 'schema': ESQUEMA_CHAMADA}})
        [do_usuario] = pedido['messages']  # uma mensagem só, do usuário: sem prefill
        self.assertEqual(do_usuario['role'], 'user')
        self.assertEqual(do_usuario['content'], [
            {'type': 'document', 'source': {'type': 'base64', 'media_type': 'application/pdf', 'data': PDF_B64}},
            {'type': 'text', 'text': PROMPT.read_text(encoding='utf-8')},
        ])
        # o Haiku 5.5 responde 400 a parâmetros de amostragem e não tem fallback; o pensamento fica no padrão
        self.assertEqual({'temperature', 'top_p', 'top_k', 'thinking', 'fallbacks', 'system'} & set(pedido), set())

    def test_esquema_tem_os_campos_da_chamada_e_cabe_no_limite_da_api(self):
        regras = extrair_por_regras('1 Alface kg 10 5,00 50,00')
        self.assertEqual(set(ESQUEMA_CHAMADA['properties']), set(regras))
        self.assertEqual(set(ESQUEMA_ITEM['properties']), set(regras['itens'][0]))
        self.assertIs(ESQUEMA_CHAMADA['properties']['itens']['items'], ESQUEMA_ITEM)
        unioes = [campo for esquema in (ESQUEMA_CHAMADA, ESQUEMA_ITEM)
                  for campo, tipo in esquema['properties'].items() if 'anyOf' in tipo]
        self.assertLessEqual(len(unioes), 16)  # a saída estruturada recusa (400) mais de 16 campos com união de tipos

    def test_prompt_e_esquema_dizem_o_mesmo(self):
        prompt = PROMPT.read_text(encoding='utf-8')
        # data_publicacao é o início do recebimento dos projetos, não a assinatura: a mesma definição nos dois lugares
        definicao = ESQUEMA_CHAMADA['properties']['data_publicacao']['description']
        self.assertIn(f'- data_publicacao: {definicao}\n', prompt)
        # o que o esquema não deixa ser null, o prompt manda ficar vazio quando faltar (senão o modelo inventa)
        sem_null = [campo for esquema in (ESQUEMA_CHAMADA, ESQUEMA_ITEM)
                    for campo, tipo in esquema['properties'].items() if tipo == {'type': 'string'}]
        self.assertEqual(sem_null, ['orgao', 'produto', 'unidade'])
        regra = next((linha for linha in prompt.splitlines() if 'se faltar, texto vazio' in linha), '')
        for campo in sem_null:
            self.assertIn(campo, regra)


class TestServidorComIa(unittest.TestCase):
    def test_servidor_com_ia_que_falha_devolve_200_regras(self):
        servidor = criar_servidor(0)
        threading.Thread(target=servidor.serve_forever, daemon=True).start()
        self.addCleanup(servidor.server_close)
        self.addCleanup(servidor.shutdown)
        pedido = httpx2.Request('POST', 'https://api.anthropic.com/v1/messages')
        casos = [
            (anthropic.APITimeoutError(request=pedido), 'tempo esgotado'),  # o tempo esgotado que o SDK de fato lança
            (anthropic.APIConnectionError(request=pedido), 'falha na chamada à API'),
            (anthropic.AuthenticationError('chave inválida', response=httpx2.Response(401, request=pedido), body=None),
             'erro 401 na API'),
        ]
        for erro, motivo in casos:
            with self.subTest(motivo=motivo):
                servidor.cliente = falso_que_lanca(erro)
                corpo = json.dumps({'pdf_base64': PDF_B64}).encode()
                url = f'http://127.0.0.1:{servidor.server_port}/extrair-chamada'
                with self.assertLogs('ia', 'WARNING'), \
                        urllib.request.urlopen(urllib.request.Request(url, data=corpo), timeout=30) as resposta:
                    status, dados = resposta.status, json.loads(resposta.read())
                self.assertEqual((status, dados['origem']), (200, 'regras'))
                self.assertEqual(dados['avisos'][0], f'IA indisponível ({motivo}); usei o modo de regras')


class TestComOSdkDeVerdade(unittest.TestCase):
    """O SDK de verdade falando com um servidor local que faz de conta que é a API: sem rede, com chave falsa.
    O cliente falso não pega um parâmetro que o SDK renomeou, nem o que o SDK faz com uma resposta estranha."""

    def setUp(self):
        self.pedidos, self.resposta = [], None  # o que a API recebeu; (status, Content-Type, corpo) que ela devolve
        teste = self

        class ApiFalsa(BaseHTTPRequestHandler):
            def do_POST(self):
                teste.pedidos.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                status, tipo, corpo = teste.resposta
                self.send_response(status)
                self.send_header('Content-Type', tipo)
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
        self.resposta = (200, 'application/json', mensagem('end_turn', json.dumps(CHAMADA_OK)).model_dump_json().encode())
        r = extrair_chamada({'pdf_base64': PDF_B64}, cliente=self.cliente, modelo='claude-haiku-5-5')
        self.assertEqual((r['origem'], r['avisos'], r['chamada']['itens'][0]['produto_id']), ('ia', [], 'alface'))
        [pedido] = self.pedidos
        self.assertEqual(set(pedido), {'model', 'max_tokens', 'messages', 'output_config'})
        self.assertEqual(pedido['output_config'],
                         {'effort': 'medium', 'format': {'type': 'json_schema', 'schema': ESQUEMA_CHAMADA}})
        [do_usuario] = pedido['messages']
        self.assertEqual([bloco['type'] for bloco in do_usuario['content']], ['document', 'text'])
        self.assertEqual(do_usuario['content'][0]['source'],
                         {'type': 'base64', 'media_type': 'application/pdf', 'data': PDF_B64})

    def test_resposta_estranha_da_api_cai_para_regras_em_vez_de_dar_500(self):
        sem_content = {'id': 'msg_x', 'type': 'message', 'role': 'assistant', 'model': 'claude-haiku-5-5',
                       'content': None, 'stop_reason': 'end_turn', 'usage': {'input_tokens': 1, 'output_tokens': 1}}
        sobrecarga = {'type': 'error', 'error': {'type': 'overloaded_error', 'message': 'Overloaded'}}
        casos = {  # nome: (motivo da queda, status, Content-Type, corpo)
            'html de um proxy': ('resposta fora do esquema', 200, 'text/html', b'<html>proxy</html>'),
            'JSON quebrado': ('resposta fora do esquema', 200, 'application/json', b'{"id": "msg_x", "content": [ {oops'),
            'JSON vazio': ('resposta fora do esquema', 200, 'application/json', b'{}'),
            'content nulo': ('resposta fora do esquema', 200, 'application/json', json.dumps(sem_content).encode()),
            'API sobrecarregada': ('erro 529 na API', 529, 'application/json', json.dumps(sobrecarga).encode()),
        }
        for nome, (motivo, *resposta) in casos.items():
            with self.subTest(nome):
                self.pedidos.clear()
                self.resposta = tuple(resposta)
                r, _ = queda_para_regras(self, self.cliente)
                self.assertEqual((r['origem'], r['avisos']), ('regras', [f'IA indisponível ({motivo}); usei o modo de regras']))
                self.assertEqual(len(self.pedidos), 1)  # sem novas tentativas do SDK (max_retries=0)
