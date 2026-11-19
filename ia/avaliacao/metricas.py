"""Métricas da avaliação: o que a leitura da chamada extraiu, comparado com o gabarito feito à mão."""
from ia.catalogo import normalizar_texto


def comparar_itens(extraidos: list, gabarito: list) -> dict:
    """Um item do gabarito é encontrado se um extraído tem o mesmo produto_id (ou o mesmo nome normalizado), e correto
    se, além disso, a quantidade é igual e o preço difere no máximo R$ 0,01. Cada extraído casa com um item só."""
    livres = list(extraidos)
    # primeiro os pares certos: com dois itens do mesmo produto_id (abóbora cabotiá e abóbora verde), um par trocado
    # gastaria os dois extraídos e contaria dois erros onde a leitura acertou
    sobras = [item for item in gabarito if not _casar(item, livres, _mesmos_valores)]
    encontrados_sem_acerto = sum(_casar(item, livres, lambda *_: True) for item in sobras)
    corretos = len(gabarito) - len(sobras)
    return {'total_gabarito': len(gabarito), 'encontrados': corretos + encontrados_sem_acerto, 'corretos': corretos}


def _casar(item: dict, livres: list, valores_conferem) -> bool:
    """Tira de livres o primeiro extraído do mesmo produto em que valores_conferem; diz se achou."""
    for i, extraido in enumerate(livres):
        if _mesmo_produto(extraido, item) and valores_conferem(extraido, item):
            del livres[i]
            return True
    return False


def _mesmo_produto(extraido: dict, item: dict) -> bool:
    if item.get('produto_id') and extraido.get('produto_id') == item['produto_id']:
        return True
    nome = normalizar_texto(item.get('produto') or '')  # fora do catálogo (produto_id None) só o nome serve
    return bool(nome) and normalizar_texto(extraido.get('produto') or '') == nome


def _mesmos_valores(extraido: dict, item: dict) -> bool:
    preco = extraido.get('preco_unitario')
    # a folga de 1e-9 é do ponto flutuante: 12.05 - 12.04 dá 0.010000000000001563
    return (extraido.get('quantidade') == item['quantidade'] and preco is not None
            and abs(preco - item['preco_unitario']) <= 0.01 + 1e-9)


def resumir(linhas: list) -> dict:
    """Junta as linhas de rodar.py (uma por chamada e modo). Só conta como IA a linha em que a IA respondeu; a chamada
    do modo IA que caiu para as regras vai para falhas_ia, com os avisos."""
    ia = [linha for linha in linhas if linha['modo'] == 'ia']
    respondeu = [linha for linha in ia if linha['origem'] == 'ia']
    return {
        'regras': _metricas([linha for linha in linhas if linha['modo'] == 'regras']),
        'ia': _metricas(respondeu) if respondeu else None,
        'falhas_ia': [{'arquivo': linha['arquivo'], 'avisos': linha['avisos']} for linha in ia if linha['origem'] != 'ia'],
    }


def _metricas(linhas: list) -> dict:
    # porcentagem sobre o total de itens das chamadas, não média das porcentagens: cada item pesa igual
    total = sum(linha['total_gabarito'] for linha in linhas)
    return {
        'pct_encontrados': round(100 * sum(linha['encontrados'] for linha in linhas) / total, 1),
        'pct_corretos': round(100 * sum(linha['corretos'] for linha in linhas) / total, 1),
        'pct_prazo_correto': round(100 * sum(linha['prazo_correto'] for linha in linhas) / len(linhas), 1),
        'tempo_medio_ms': round(sum(linha['duracao_ms'] for linha in linhas) / len(linhas)),
        'chamadas': len(linhas),
    }


def custo_usd(tokens_entrada: int, tokens_saida: int) -> float:
    """Custo de uma chamada ao Claude Haiku 5.5: US$ 0,10 (entrada) e 0,50 (saída) por milhão de tokens com prompt de
    até 100 mil tokens; acima disso, 0,50 e 2,50 na chamada inteira."""
    # shortcut: tabela fixa do Haiku 5.5; com outro MODELO_CLAUDE o custo sai errado, troque a tabela junto
    entrada, saida = (0.10, 0.50) if tokens_entrada <= 100_000 else (0.50, 2.50)
    return (tokens_entrada * entrada + tokens_saida * saida) / 1_000_000
