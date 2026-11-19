import base64
import time

from ia.config import MODELO_PADRAO
from ia.extrair.regras import extrair_por_regras
from ia.extrair.texto_pdf import texto_do_pdf


def extrair_chamada(entrada: dict, cliente=None, modelo: str = MODELO_PADRAO, timeout_s: float = 90) -> dict:
    """Lê a chamada de { pdf_base64 } ou { texto }. Por ora só há o modo de regras; cliente, modelo e timeout_s
    ficam na assinatura para a leitura com o Claude, que entra na frente das regras."""
    inicio = time.monotonic()
    avisos = []
    if entrada.get('pdf_base64'):
        texto = texto_do_pdf(base64.b64decode(entrada['pdf_base64']))
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
