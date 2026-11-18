"""Etapa ingerir-app: grava em raw/app a exportação pseudonimizada do app (GET /api/exportar).
Sem o app (fora do ar, chave recusada ou resposta inválida), avisa e devolve None: o pipeline segue sem ele."""

import datetime
import http.client
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

log = logging.getLogger(__name__)

COLECOES = ('agricultores', 'chamadas', 'propostas', 'entregas', 'leituras')
DESDE = '2000-01-01T00:00:00Z'  # pede tudo: cada execução guarda no raw uma foto completa do app


def ingerir_app(url: str, chave: str, raw: Path) -> Path | None:
    if not chave:
        log.warning('sem CHAVE_SERVICO: o pipeline segue sem os dados do app')
        return None
    endereco = f"{url.rstrip('/')}/api/exportar?{urllib.parse.urlencode({'desde': DESDE})}"
    pedido = urllib.request.Request(endereco, headers={'X-Chave-Servico': chave})
    try:
        with urllib.request.urlopen(pedido, timeout=30) as resposta:
            exportacao = json.load(resposta)
    except urllib.error.HTTPError as erro:
        erro.close()  # o corpo da resposta de erro não interessa
        motivo = 'chave de serviço recusada' if erro.code == 401 else 'erro no app'
        log.warning('o app respondeu %s (%s): o pipeline segue sem os dados do app', erro.code, motivo)
        return None
    except (OSError, ValueError, http.client.HTTPException) as erro:  # sem rede, JSON inválido ou corpo cortado
        log.warning('app fora do ar ou resposta inválida em %s (%s): o pipeline segue sem os dados do app', url, erro)
        return None
    if not isinstance(exportacao, dict) or not all(isinstance(exportacao.get(nome), list) for nome in COLECOES):
        log.warning('exportação do app fora do formato esperado: o pipeline segue sem os dados do app')
        return None
    destino = raw / 'app' / f'exportacao-{datetime.datetime.now(datetime.UTC):%Y%m%dT%H%M%SZ}.json'
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(exportacao, ensure_ascii=False), encoding='utf-8')
    return destino
