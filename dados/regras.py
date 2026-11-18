"""Regras do PNAE usadas no data lake: mínimo de compra da agricultura familiar (AF) e faixas de cumprimento.

Mínimo de 30% do repasse até 2025 e de 45% a partir de 2026 (Lei 11.947/2009, art. 14, com a Lei 15.226/2025).
"""

import math

ANO_REGRA_45 = 2026
LIMITE_TEMP_C = 10  # câmara fria: até 10 °C, o mesmo padrão do app (LIMITE_TEMP_C) e do alarme do Arduino

# Rótulos da coluna `faixa`, do pior ao melhor caso. A medida "Faixa de cumprimento" do Power BI usa os mesmos.
SEM_REPASSE = 'sem repasse'            # pct vazio: repasse 0, em branco ou com valor não numérico
SEM_COMPRA = 'sem compra'              # pct igual a 0
ABAIXO_DO_MINIMO = 'abaixo do mínimo'  # pct menor que o mínimo do ano
NO_MINIMO = 'no mínimo'                # do mínimo até menos de 10 pontos percentuais acima dele
ACIMA_DO_MINIMO = 'acima do mínimo'    # 10 pontos percentuais ou mais acima do mínimo
MARGEM_NO_MINIMO = 0.10


def minimo_do_ano(ano: int) -> float:
    return 0.45 if ano >= ANO_REGRA_45 else 0.30


def gap_reais(repasse: float, compra_af: float, ano: int) -> float:
    """Quanto faltou comprar da AF para chegar ao mínimo do ano, em reais (nunca negativo)."""
    return max(0.0, minimo_do_ano(ano) * repasse - compra_af)


def faixa(pct: float | None, ano: int) -> str:
    if pct is None or math.isnan(pct):
        return SEM_REPASSE
    if pct == 0:
        return SEM_COMPRA
    minimo = minimo_do_ano(ano)
    if pct < minimo:
        return ABAIXO_DO_MINIMO
    if pct < minimo + MARGEM_NO_MINIMO:
        return NO_MINIMO
    return ACIMA_DO_MINIMO
