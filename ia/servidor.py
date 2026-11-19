"""Servidor HTTP da IA (porta 3001). Subir com: python -m ia.servidor"""
import json
import os
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pypdf.errors import PyPdfError

from ia.cliente_claude import criar_cliente_claude
from ia.config import MODELO_PADRAO
from ia.extrair.servico import extrair_chamada

LIMITE_CORPO = 10 * 1024 * 1024  # 10 MB


def saude(servidor, corpo):
    return 200, {'ok': True, 'modo': 'ia' if servidor.cliente is not None else 'regras'}


def extrair(servidor, corpo):
    pdf, texto = corpo.get('pdf_base64'), corpo.get('texto')
    if pdf is None and not (isinstance(texto, str) and texto.strip()):
        return 400, {'erro': 'envie pdf_base64 ou texto'}
    if pdf is not None and not (isinstance(pdf, str) and pdf.startswith('JVBER')):  # JVBER é '%PDF' em base64
        return 400, {'erro': 'pdf_base64 não é um PDF'}
    try:
        return 200, extrair_chamada(corpo, servidor.cliente, servidor.modelo)
    except (ValueError, PyPdfError):  # base64 quebrado ou PDF corrompido
        return 400, {'erro': 'não consegui ler o PDF'}


ROTAS = {
    ('GET', '/saude'): saude,
    ('POST', '/extrair-chamada'): extrair,
}


class Manipulador(BaseHTTPRequestHandler):
    timeout = 60  # um cliente lento não prende a thread para sempre

    def do_GET(self):
        self._atender('GET', None)

    def do_POST(self):
        try:
            tamanho = max(0, int(self.headers.get('Content-Length') or 0))
        except ValueError:
            return self._responder(400, {'erro': 'Content-Length inválido'})
        if tamanho > LIMITE_CORPO:
            self._descartar(tamanho)
            return self._responder(413, {'erro': 'o corpo passa de 10 MB'})
        try:
            corpo = json.loads(self.rfile.read(tamanho))
        except (ValueError, RecursionError):  # RecursionError: JSON aninhado demais (no Python 3.12)
            return self._responder(400, {'erro': 'JSON inválido'})
        if not isinstance(corpo, dict):
            return self._responder(400, {'erro': 'o corpo deve ser um objeto JSON'})
        self._atender('POST', corpo)

    def _atender(self, metodo, corpo):
        rota = ROTAS.get((metodo, self.path))
        if rota is None:
            return self._responder(404, {'erro': 'rota não encontrada'})
        try:
            status, resposta = rota(self.server, corpo)
        except Exception:  # o cliente sempre recebe { erro } em JSON, mesmo num erro inesperado
            self.log_error('%s', traceback.format_exc())
            status, resposta = 500, {'erro': 'erro interno da IA'}
        self._responder(status, resposta)

    def _descartar(self, tamanho):
        # lê e joga fora o corpo grande, aos poucos: sem isso o cliente vê a conexão cortada em vez do 413
        while tamanho > 0:
            bloco = self.rfile.read(min(tamanho, 64 * 1024))
            if not bloco:
                break
            tamanho -= len(bloco)

    def _responder(self, status, resposta):
        dados = json.dumps(resposta, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def log_request(self, code='-', size='-'):
        pass  # sem uma linha por pedido no terminal; erros continuam em log_error


def criar_servidor(porta: int, cliente=None, modelo=MODELO_PADRAO) -> ThreadingHTTPServer:
    servidor = ThreadingHTTPServer(('', porta), Manipulador)  # todas as interfaces: o app chega de outro contêiner
    servidor.cliente, servidor.modelo = cliente, modelo
    return servidor


if __name__ == '__main__':
    porta = int(os.getenv('PORT') or 3001)
    servidor = criar_servidor(porta, criar_cliente_claude())
    print(f'IA na porta {porta}, modo {"ia" if servidor.cliente is not None else "regras"}', flush=True)
    servidor.serve_forever()
