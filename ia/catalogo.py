import json
import re
import unicodedata
from pathlib import Path

CATALOGO = Path(__file__).resolve().parents[1] / 'compartilhado' / 'catalogo-produtos.json'


def normalizar_texto(texto: str) -> str:
    sem_acento = ''.join(
        c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn'
    )
    return ' '.join(sem_acento.lower().split())


def listar_produtos() -> list[dict]:
    return json.loads(CATALOGO.read_text(encoding='utf-8'))


def identificar_produto(texto: str) -> str | None:
    texto_normalizado = normalizar_texto(texto)
    melhor_id, melhor_tamanho = None, 0
    for produto in listar_produtos():
        for termo in [produto['nome'], *produto['sinonimos']]:
            termo_normalizado = normalizar_texto(termo)
            casa = re.search(rf'\b{re.escape(termo_normalizado)}\b', texto_normalizado)
            if casa and len(termo_normalizado) > melhor_tamanho:
                melhor_id, melhor_tamanho = produto['id'], len(termo_normalizado)
    return melhor_id
