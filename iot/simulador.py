"""Simulador da câmara fria: gera as leituras do Arduino e as envia à API. Só biblioteca padrão."""

import argparse
import datetime
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

CENARIOS = ('normal', 'porta-aberta', 'entrega', 'colheita')
URL_PADRAO = 'http://localhost:3000/api/leituras'
PESO_BASE_KG = 180.0  # estoque da câmara: a entrega tira daqui e a colheita põe aqui


def gerar_leitura(cenario: str, passo: int, estado: dict) -> dict:
    """Leitura do passo. `estado` guarda o gerador aleatório entre as chamadas."""
    if cenario not in CENARIOS:
        raise ValueError(f'cenário desconhecido: {cenario}')
    porta_aberta = cenario == 'porta-aberta'
    if porta_aberta:
        temperatura = min(5.0 + 0.4 * passo, 18.0)
    else:
        aleatorio = estado.setdefault('aleatorio', random.Random())
        temperatura = aleatorio.uniform(4.0, 7.0)
    if cenario == 'entrega':
        peso = max(PESO_BASE_KG - 15.0 * passo, 20.0)
    elif cenario == 'colheita':
        peso = min(PESO_BASE_KG + 20.0 * passo, 480.0)
    else:
        peso = PESO_BASE_KG
    return {
        'dispositivo': 'camara-01',
        'temperatura_c': round(temperatura, 1),
        'peso_kg': round(peso, 1),
        'porta_aberta': porta_aberta,
        'momento': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
    }


def linha_json(leitura: dict) -> str:
    return json.dumps(leitura, separators=(',', ':'))  # sem espaços, como na Serial do Arduino


def enviar(url: str, chave: str, leitura: dict) -> int:
    """POST da leitura. Devolve o status HTTP, inclusive de erro (ex.: 401)."""
    pedido = urllib.request.Request(
        url,
        data=linha_json(leitura).encode(),
        headers={'Content-Type': 'application/json', 'X-Chave-Dispositivo': chave},
        method='POST',
    )
    try:
        with urllib.request.urlopen(pedido, timeout=10) as resposta:
            return resposta.status
    except urllib.error.HTTPError as erro:
        erro.close()  # o corpo da resposta de erro não interessa
        return erro.code


def ler_argumentos(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Envia à API leituras simuladas da câmara fria.')
    parser.add_argument('--cenario', choices=CENARIOS, default='normal', help='cenário a simular')
    parser.add_argument('--url', default=URL_PADRAO, help='endpoint de leituras da API')
    parser.add_argument('--chave', default=os.environ.get('CHAVE_DISPOSITIVO', ''),
                        help='chave do dispositivo (padrão: variável CHAVE_DISPOSITIVO)')
    parser.add_argument('--intervalo', type=float, default=2.0, help='segundos entre leituras')
    parser.add_argument('--quantidade', type=int, default=30, help='número de leituras')
    parser.add_argument('--seco', action='store_true', help='só imprime as leituras, sem enviar')
    args = parser.parse_args(argv)
    if not args.seco and not args.chave:
        parser.error('informe --chave ou defina a variável CHAVE_DISPOSITIVO')
    return args


def principal(argv: list[str] | None = None) -> int:
    args = ler_argumentos(argv)
    estado = {}
    falhas = 0
    for passo in range(args.quantidade):
        if passo:
            time.sleep(args.intervalo)
        leitura = gerar_leitura(args.cenario, passo, estado)
        if args.seco:
            print(linha_json(leitura))
            continue
        try:
            status = enviar(args.url, args.chave, leitura)
        except OSError as erro:  # URLError é subclasse de OSError: a API não está no ar
            print(f'falha ao enviar para {args.url}: {erro}', file=sys.stderr)
            return 1
        print(status, linha_json(leitura))
        if status != 201:
            falhas += 1
    return 1 if falhas else 0


if __name__ == '__main__':
    sys.exit(principal())
