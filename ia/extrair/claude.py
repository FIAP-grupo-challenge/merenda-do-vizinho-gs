"""Leitura da chamada com o Claude: o PDF vai inteiro, como documento, e a resposta vem no ESQUEMA_CHAMADA."""
import json
from pathlib import Path

import anthropic

from ia.cliente_claude import ErroIA
from ia.extrair.esquema import ESQUEMA_CHAMADA, ESQUEMA_ITEM

PROMPT = (Path(__file__).resolve().parents[1] / 'prompts' / 'extrair-chamada.md').read_text(encoding='utf-8')


def extrair_com_claude(pdf_base64: str, cliente, modelo: str, timeout_s: float) -> dict:
    """Chamada no formato da T2, com produto_id null. Levanta ErroIA(motivo) se a API falha, o tempo esgota,
    o modelo recusa ou a resposta sai do esquema."""
    try:
        # sem novas tentativas do SDK: três de timeout_s passariam dos 120 s que o app espera pela IA
        resposta = cliente.with_options(timeout=timeout_s, max_retries=0).messages.create(
            model=modelo,
            max_tokens=16000,
            output_config={'effort': 'medium', 'format': {'type': 'json_schema', 'schema': ESQUEMA_CHAMADA}},
            messages=[{'role': 'user', 'content': [  # o documento antes do pedido, como a Anthropic recomenda
                {'type': 'document', 'source': {'type': 'base64', 'media_type': 'application/pdf', 'data': pdf_base64}},
                {'type': 'text', 'text': PROMPT},
            ]}],
        )
    except (anthropic.APITimeoutError, TimeoutError) as erro:
        raise ErroIA('tempo esgotado') from erro
    except anthropic.APIStatusError as erro:  # chave inválida, limite de uso, PDF recusado, API sobrecarregada
        raise ErroIA(f'erro {erro.status_code} na API') from erro
    except anthropic.AnthropicError as erro:  # sem conexão e os demais erros do SDK
        raise ErroIA('falha na chamada à API') from erro
    if resposta.stop_reason == 'refusal':
        raise ErroIA('o modelo recusou o pedido')
    if resposta.stop_reason == 'max_tokens':
        raise ErroIA('resposta cortada no limite de tokens')
    try:  # o texto vem depois do bloco de pensamento: lê pelo tipo do bloco, não pela posição
        chamada = json.loads(''.join(bloco.text for bloco in resposta.content if bloco.type == 'text'))
    except ValueError as erro:
        raise ErroIA('resposta fora do esquema') from erro
    # a saída estruturada garante os tipos; aqui se confere a forma de que o resto do código depende
    if not (isinstance(chamada, dict) and chamada.keys() == ESQUEMA_CHAMADA['properties'].keys()
            and isinstance(chamada['itens'], list)
            and all(isinstance(item, dict) and item.keys() == ESQUEMA_ITEM['properties'].keys()
                    for item in chamada['itens'])):
        raise ErroIA('resposta fora do esquema')
    return chamada
