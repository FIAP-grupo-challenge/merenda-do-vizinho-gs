import os

import anthropic


class ErroIA(Exception):
    """A IA não deu resposta usável (recusa, tempo esgotado, fora do esquema): quem chama cai para o modo de regras."""


def criar_cliente_claude() -> anthropic.Anthropic | None:
    """Cliente do Claude, ou None sem ANTHROPIC_API_KEY: aí o servidor fica no modo de regras."""
    if not os.getenv('ANTHROPIC_API_KEY'):
        return None
    return anthropic.Anthropic()
