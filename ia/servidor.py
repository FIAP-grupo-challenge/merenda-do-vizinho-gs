"""Servidor HTTP da IA (porta 3001). Subir com: python -m ia.servidor"""
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from ia.assistente.servico import responder_assistente
from ia.cliente_claude import criar_cliente_claude
from ia.config import MODELO_PADRAO
from ia.extrair.servico import PdfIlegivel, extrair_chamada
from ia.privacidade import contem_dados_pessoais, dados_pessoais_no_texto

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
    except PdfIlegivel:  # base64 quebrado ou PDF corrompido; qualquer outro erro vai para o 500 de _atender
        return 400, {'erro': 'não consegui ler o PDF'}


def assistente(servidor, corpo):
    chamada, perfil, mensagens = corpo.get('chamada'), corpo.get('perfil'), corpo.get('mensagens')
    if not (_chamada_ok(chamada) and _perfil_ok(perfil)
            and isinstance(mensagens, list) and all(_mensagem_ok(mensagem) for mensagem in mensagens)
            and (not mensagens or mensagens[-1]['papel'] == 'agricultor')):  # a IA responde ao agricultor
        return 400, {'erro': 'envie chamada, perfil e mensagens; a última mensagem é do agricultor'}
    campos = set(contem_dados_pessoais(corpo))  # com dado pessoal, nada chega à IA
    for mensagem in mensagens:
        campos.update(dados_pessoais_no_texto(mensagem['texto']))
    if campos:
        return 400, {'erro': 'dados pessoais não são aceitos', 'campos': sorted(campos)}
    return 200, responder_assistente(chamada, perfil, mensagens, servidor.cliente, servidor.modelo)


# Formato do que o assistente lê da chamada e do perfil: valor de outro tipo é 400 (antes ia até uma conta ou um texto
# e dava 500). Nulo vale: a chamada pode não trazer o campo.
def _texto_ou_nulo(valor):
    return valor is None or isinstance(valor, str)


def _numero_ou_nulo(valor):  # em JSON, true não é número, e NaN e Infinity não são números de verdade
    # abs(valor) <= o maior float, e não math.isfinite: um inteiro de 309 dígitos ou mais não cabe em float e daria
    # OverflowError (500). NaN e Infinity também ficam de fora, pois nenhum deles é <= ao maior float.
    return valor is None or (type(valor) in (int, float) and abs(valor) <= sys.float_info.max)


def _item_ok(item):
    return (isinstance(item, dict) and _numero_ou_nulo(item.get('quantidade'))
            and all(_texto_ou_nulo(item.get(campo)) for campo in ('produto', 'produto_id', 'unidade')))


def _chamada_ok(chamada):
    if not (isinstance(chamada, dict) and isinstance(chamada.get('itens'), list)):
        return False
    documentos = chamada.get('documentos_exigidos')
    return (_texto_ou_nulo(chamada.get('prazo_envio')) and _numero_ou_nulo(chamada.get('semanas_fornecimento'))
            and (documentos is None or (isinstance(documentos, list) and all(isinstance(d, str) for d in documentos)))
            and all(_item_ok(item) for item in chamada['itens']))


def _perfil_ok(perfil):
    return (isinstance(perfil, dict) and isinstance(perfil.get('produtos'), list)
            and all(isinstance(produto, dict) and _texto_ou_nulo(produto.get('produto_id'))
                    for produto in perfil['produtos']))


def _mensagem_ok(mensagem):
    return (isinstance(mensagem, dict) and mensagem.get('papel') in ('agricultor', 'assistente')
            and isinstance(mensagem.get('texto'), str) and mensagem['texto'].strip() != '')


ROTAS = {
    ('GET', '/saude'): saude,
    ('POST', '/extrair-chamada'): extrair,
    ('POST', '/assistente'): assistente,
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
