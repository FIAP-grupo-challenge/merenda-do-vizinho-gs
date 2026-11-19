"""Etapa refinar (trusted -> refined): as tabelas do painel do Power BI, em CSV e em merenda_do_vizinho.xlsx,
com uma aba por tabela. Dicionário das colunas em dados/datalake/README.md."""

import json
from pathlib import Path

import pandas as pd

from dados.regras import ANO_REGRA_45, LIMITE_TEMP_C, faixa, gap_reais, minimo_do_ano

CATALOGO = Path(__file__).resolve().parents[2] / 'compartilhado' / 'catalogo-produtos.json'
ANOS_SO_REPASSE = range(2023, 2027)  # o FNDE publicou a compra da AF só até 2022; 2026 é parcial
FUSO = 'America/Sao_Paulo'
COLUNAS_PNAE_AF = ['ano', 'cod_ibge', 'municipio', 'entidade', 'esfera', 'uf', 'regiao', 'repasse', 'compra_af',
                   'pct_af', 'minimo', 'falta_minimo_reais', 'falta_45_reais', 'faixa', 'preliminar', 'repasse_zero']
COLUNAS_ENTREGAS = ['data', 'origem', 'escola', 'produto_id', 'agricultor_pseudonimo', 'quantidade', 'unidade', 'kg',
                    'valor', 'no_prazo', 'primeira_venda']


def refinar(trusted: Path, refined: Path) -> dict[str, Path]:
    municipios = pd.read_csv(trusted / 'municipios.csv')
    tabelas = {
        'fato_pnae_af': fato_pnae_af(pd.read_csv(trusted / 'pnae_af.csv'), municipios),
        'fato_repasse_uf': fato_repasse_uf(pd.read_csv(trusted / 'repasses.csv', usecols=['ano', 'uf', 'repasse'])),
        'fato_entregas': fato_entregas(pd.read_csv(trusted / 'entregas.csv', parse_dates=['data']),
                                       pd.read_csv(trusted / 'agricultores.csv')),
        'fato_camara_fria': fato_camara_fria(pd.read_csv(trusted / 'leituras.csv')),
        'dim_produto': pd.DataFrame(json.loads(CATALOGO.read_text(encoding='utf-8')))
                         .rename(columns={'id': 'produto_id'})[['produto_id', 'nome', 'unidade_padrao']],
        'dim_municipio': municipios,
    }
    refined.mkdir(parents=True, exist_ok=True)
    caminhos = {nome: refined / f'{nome}.csv' for nome in tabelas}
    caminhos['excel'] = refined / 'merenda_do_vizinho.xlsx'
    with pd.ExcelWriter(caminhos['excel']) as excel:
        for nome, tabela in tabelas.items():
            tabela.to_csv(caminhos[nome], index=False)
            tabela.to_excel(excel, sheet_name=nome, index=False)
            # o pandas grava o vazio como texto vazio (<c t="inlineStr"/>), que o Power Query pode ler como "";
            # com None o openpyxl nem escreve a célula, e ela vira vazio de verdade (null)
            for linha in excel.sheets[nome].iter_rows():
                for celula in linha:
                    if celula.value == '':
                        celula.value = None
    return caminhos


def fato_pnae_af(af: pd.DataFrame, municipios: pd.DataFrame) -> pd.DataFrame:
    """Uma linha por entidade e ano. As secretarias estaduais ficam sem cod_ibge e município: o FNDE grava nelas o
    código de um município da UF (a capital em 2018 e 2019; depois, o primeiro em ordem alfabética), e ligado a
    dim_municipio ele levaria o repasse do estado a essa cidade. A região vem da UF."""
    fato = af.merge(municipios[['cod_ibge', 'municipio']], on='cod_ibge', how='left')
    fato['regiao'] = fato['uf'].map(municipios.drop_duplicates('uf').set_index('uf')['regiao'])
    estadual = fato['esfera'] == 'ESTADUAL'
    fato['cod_ibge'] = fato['cod_ibge'].astype('Int64').mask(estadual)  # Int64: o vazio não vira 1200013.0 no CSV
    fato['municipio'] = fato['municipio'].mask(estadual)
    fato['minimo'] = fato['ano'].map(minimo_do_ano)
    fato['falta_minimo_reais'] = list(map(gap_reais, fato['repasse'], fato['compra_af'], fato['ano']))
    fato['falta_45_reais'] = [gap_reais(repasse, compra, ANO_REGRA_45)
                              for repasse, compra in zip(fato['repasse'], fato['compra_af'])]
    # sem percentual (repasse 0 ou valor não numérico), a linha fica fora das contas de falta, como do % nacional
    fato.loc[fato['pct_af'].isna(), ['falta_minimo_reais', 'falta_45_reais']] = float('nan')
    fato['faixa'] = list(map(faixa, fato['pct_af'], fato['ano']))
    return fato[COLUNAS_PNAE_AF]


def fato_repasse_uf(repasses: pd.DataFrame) -> pd.DataFrame:
    fato = repasses[repasses['ano'].isin(ANOS_SO_REPASSE)].groupby(['ano', 'uf'], as_index=False)['repasse'].sum()
    fato['minimo'] = fato['ano'].map(minimo_do_ano)
    fato['verba_minima_af_reais'] = fato['minimo'] * fato['repasse']
    return fato


def fato_entregas(entregas: pd.DataFrame, agricultores: pd.DataFrame) -> pd.DataFrame:
    """kg só nas entregas em kg. primeira_venda: o agricultor nunca tinha vendido ao PNAE (vazio sem agricultor,
    como nas linhas do app, que registram a entrega da proposta e não de cada cooperado)."""
    ja_vendeu = agricultores.drop_duplicates('pseudonimo').set_index('pseudonimo')['ja_vendeu_pnae']
    fato = entregas.assign(
        kg=entregas['quantidade'].where(entregas['unidade'] == 'kg'),
        primeira_venda=~entregas['agricultor_pseudonimo'].map(ja_vendeu).astype('boolean'))
    return fato[COLUNAS_ENTREGAS]


def fato_camara_fria(leituras: pd.DataFrame) -> pd.DataFrame:
    """Uma linha por hora (horário de Brasília), dispositivo e origem. Cada leitura vale até a próxima, por no
    máximo 60 minutos; a última de cada série não soma minutos."""
    leituras = leituras.assign(momento=pd.to_datetime(leituras['momento'], utc=True, format='ISO8601'))
    leituras = leituras.sort_values(['origem', 'dispositivo', 'momento'])
    proxima = leituras.groupby(['origem', 'dispositivo'])['momento'].shift(-1)
    minutos = ((proxima - leituras['momento']).dt.total_seconds() / 60).clip(upper=60).fillna(0)
    leituras['minutos_fora'] = minutos.where(leituras['temperatura_c'] > LIMITE_TEMP_C, 0)
    leituras['hora'] = leituras['momento'].dt.tz_convert(FUSO).dt.tz_localize(None).dt.floor('h')
    return leituras.groupby(['hora', 'origem', 'dispositivo'], as_index=False).agg(
        temperatura_media_c=('temperatura_c', 'mean'),
        minutos_fora_faixa=('minutos_fora', 'sum'),
        porta_aberta=('porta_aberta', 'any'))
