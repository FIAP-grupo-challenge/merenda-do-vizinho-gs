import base64
import logging
import time

from pypdf.errors import PyPdfError

from ia.catalogo import identificar_produto
from ia.cliente_claude import ErroIA
from ia.config import MODELO_PADRAO
from ia.extrair.claude import extrair_com_claude
from ia.extrair.regras import extrair_por_regras
from ia.extrair.texto_pdf import texto_do_pdf

log = logging.getLogger(__name__)


class PdfIlegivel(Exception):
    """O pdf_base64 enviado não decodifica ou o PDF está corrompido: erro de quem enviou (400), não falha nossa."""


def extrair_chamada(entrada: dict, cliente=None, modelo: str = MODELO_PADRAO, timeout_s: float = 90) -> dict:
    """Lê a chamada de { pdf_base64 } ou { texto }. Com cliente e PDF, quem lê é o Claude; sem cliente, só com
    texto ou quando a IA falha (erro da API, tempo esgotado, recusa, resposta fora do esquema), o modo de regras."""
    inicio = time.monotonic()
    avisos = []
    chamada = None
    if cliente is not None and entrada.get('pdf_base64'):
        try:
            chamada = extrair_com_claude(entrada['pdf_base64'], cliente, modelo, timeout_s)
        except ErroIA as erro:
            avisos.append(f'IA indisponível ({erro}); usei o modo de regras')
            log.warning('IA indisponível (%s); causa: %r', erro, erro.__cause__)  # só a causa: nunca o corpo nem a chave
        else:
            for item in chamada['itens']:  # o id sai sempre do catálogo, nunca do modelo
                item['produto_id'] = identificar_produto(item['produto'])
    origem = 'regras' if chamada is None else 'ia'
    if chamada is None:
        chamada = extrair_por_regras(_texto(entrada, avisos))
    if not chamada['itens']:
        avisos.append('nenhuma tabela de itens encontrada; confira à mão')
    return {
        'origem': origem,
        'modelo': modelo if origem == 'ia' else None,
        'duracao_ms': round((time.monotonic() - inicio) * 1000),
        'chamada': chamada,
        'avisos': avisos,
    }


def _texto(entrada: dict, avisos: list) -> str:
    """Texto para o modo de regras. Base64 quebrado ou PDF corrompido viram PdfIlegivel (400 no servidor)."""
    if not entrada.get('pdf_base64'):
        return entrada['texto']
    try:
        texto = texto_do_pdf(base64.b64decode(entrada['pdf_base64']))
    except (ValueError, PyPdfError) as erro:  # só a leitura do arquivo; um erro de outro ponto daqui é falha nossa
        raise PdfIlegivel from erro
    if not texto.strip():
        avisos.append('PDF sem texto (talvez escaneado)')
    return texto
