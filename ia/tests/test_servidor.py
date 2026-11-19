import base64
import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

from ia.cliente_claude import criar_cliente_claude
from ia.servidor import ROTAS, Manipulador, criar_servidor

FIXTURE = Path(__file__).parent / 'fixtures' / 'chamada-exemplo.txt'


class TestServidor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.servidor = criar_servidor(0)
        threading.Thread(target=cls.servidor.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.servidor.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()
        cls.servidor.server_close()

    def pedir(self, caminho, corpo=None):
        dados = corpo if corpo is None or isinstance(corpo, bytes) else json.dumps(corpo).encode()
        try:
            with urllib.request.urlopen(urllib.request.Request(self.url + caminho, data=dados), timeout=30) as resposta:
                return resposta.status, json.loads(resposta.read())
        except urllib.error.HTTPError as erro:
            with erro:
                return erro.code, json.loads(erro.read())

    def test_saude_no_modo_de_regras(self):
        self.assertEqual(self.pedir('/saude'), (200, {'ok': True, 'modo': 'regras'}))
        self.assertEqual(self.pedir('/nao-existe')[0], 404)

    def test_extrair_chamada_recusa_corpo_invalido_com_400(self):
        for corpo in ({}, {'pdf_base64': 'aGVsbG8='}, b'{isto nao e json'):
            with self.subTest(corpo=corpo):
                status, resposta = self.pedir('/extrair-chamada', corpo)
                self.assertEqual((status, list(resposta)), (400, ['erro']))

    def test_pdf_corrompido_devolve_400(self):
        pdf = base64.b64encode(b'%PDF-1.4\ngarbage').decode()
        with self.assertLogs('pypdf', 'WARNING'):  # o aviso "EOF marker not found" do pypdf fica aqui, não no stderr
            resposta = self.pedir('/extrair-chamada', {'pdf_base64': pdf})
        self.assertEqual(resposta, (400, {'erro': 'não consegui ler o PDF'}))

    def test_base64_quebrado_devolve_400(self):
        resposta = self.pedir('/extrair-chamada', {'pdf_base64': 'JVBERi0xLjQ'})  # '%PDF-1.4' sem o '=' do fim
        self.assertEqual(resposta, (400, {'erro': 'não consegui ler o PDF'}))

    def test_valueerror_fora_da_leitura_do_pdf_vira_500_e_nao_400(self):
        # a T3 lê a resposta do Claude dentro de extrair_chamada: JSON malformado é falha nossa, não do arquivo enviado
        with mock.patch('ia.servidor.extrair_chamada', side_effect=json.JSONDecodeError('x', '', 0)), \
                mock.patch.object(Manipulador, 'log_error'):
            resposta = self.pedir('/extrair-chamada', {'texto': 'edital'})
        self.assertEqual(resposta, (500, {'erro': 'erro interno da IA'}))

    def test_extrair_chamada_por_texto(self):
        status, resposta = self.pedir('/extrair-chamada', {'texto': FIXTURE.read_text(encoding='utf-8')})
        self.assertEqual((status, resposta['origem'], len(resposta['chamada']['itens'])), (200, 'regras', 5))

    def test_corpo_de_mais_de_10_mb_devolve_413(self):
        status, resposta = self.pedir('/extrair-chamada', b' ' * (10 * 1024 * 1024 + 1))
        self.assertEqual((status, list(resposta)), (413, ['erro']))

    def test_erro_inesperado_vira_500_em_json(self):
        with mock.patch.dict(ROTAS, {('GET', '/falha'): lambda servidor, corpo: 1 / 0}), \
                mock.patch.object(Manipulador, 'log_error'):
            self.assertEqual(self.pedir('/falha'), (500, {'erro': 'erro interno da IA'}))


class TestClienteClaude(unittest.TestCase):
    def test_sem_chave_nao_ha_cliente(self):
        with mock.patch.dict(os.environ, {'ANTHROPIC_API_KEY': ''}):
            self.assertIsNone(criar_cliente_claude())
        with mock.patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'chave-de-teste'}):
            self.assertIsNotNone(criar_cliente_claude())
