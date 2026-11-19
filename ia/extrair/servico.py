import base64
import time

from pypdf.errors import PyPdfError

from ia.config import MODELO_PADRAO
from ia.extrair.regras import extrair_por_regras
from ia.extrair.texto_pdf import texto_do_pdf


class PdfIlegivel(Exception):
    """O pdf_base64 enviado não decodifica ou o PDF está corrompido: erro de quem enviou (400), não falha nossa."""


def extrair_chamada(entrada: dict, cliente=None, modelo: str = MODELO_PADRAO, timeout_s: float = 90) -> dict:
    """Lê a chamada de { pdf_base64 } ou { texto }. Por ora só há o modo de regras; cliente, modelo e timeout_s
    ficam na assinatura para a leitura com o Claude, que entra na frente das regras."""
    inicio = time.monotonic()
    avisos = []
    if entrada.get('pdf_base64'):
        try:
            texto = texto_do_pdf(base64.b64decode(entrada['pdf_base64']))
        except (ValueError, PyPdfError) as erro:  # só a leitura do arquivo; um erro de outro ponto daqui é falha nossa
            raise PdfIlegivel from erro
        if not texto.strip():
            avisos.append('PDF sem texto (talvez escaneado)')
    else:
        texto = entrada['texto']
    chamada = extrair_por_regras(texto)
    if not chamada['itens']:
        avisos.append('nenhuma tabela de itens encontrada; confira à mão')
    return {
        'origem': 'regras',
        'modelo': None,
        'duracao_ms': round((time.monotonic() - inicio) * 1000),
        'chamada': chamada,
        'avisos': avisos,
    }
