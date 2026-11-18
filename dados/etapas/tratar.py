"""Etapa tratar (raw -> trusted): tipos corretos, código IBGE conferido, sem duplicatas e sem dados pessoais
(agricultor só por pseudônimo). Cada problema das planilhas do FNDE e o tratamento dele: dados/datalake/README.md."""

import json
import logging
import re
import unicodedata
from pathlib import Path

import pandas as pd

from dados.etapas.baixar_fontes import MUNICIPIOS, PLANILHAS_AF, REPASSES

log = logging.getLogger(__name__)

# Colunas de cada formato de planilha, com o cabeçalho em maiúsculas e sem acento. No formato C os nomes têm
# erros de digitação que mudam de um ano para o outro ("TRANFERIDO", "AQUSIÇÃO").
COLUNAS_AF = {
    'C': {  # 2018 e 2019, cabeçalho na linha 11
        'COD. IBGE': 'cod_ibge', 'UF': 'uf', 'ENTIDADE EXECUTORA': 'entidade',
        'VALOR TRANFERIDO PELO FNDE': 'repasse', 'VALOR TRANSFERIDO PELO FNDE': 'repasse',
        'VALOR DE AQUSICAO DA AGRICULTURA FAMILIAR': 'compra_af',
        'VALOR AQUISICOES DA AGRICULTURA FAMILIAR': 'compra_af'},
    'D': {  # 2020 a 2022, cabeçalho na linha 2
        'IBGE': 'cod_ibge', 'UF': 'uf', 'ENTIDADE EXECUTORA': 'entidade', 'VALOR TRANSFERIDO': 'repasse',
        'VALOR AQUISICOES DA AGRICULTURA FAMILIAR': 'compra_af', 'ESFERA': 'esfera'},
}
ANOS_PRELIMINARES = (2020, 2021, 2022)  # "DADOS PRELIMINARES - PASSÍVEIS DE REVISÃO"
PREFEITURA = re.compile(r'^(PREF|PM )|\bMUN\b|\bMUNIC')  # PREF MUN DE X, PM DE X, MUNICIPIO DE X, SEC MUN DE EDUC
PREFIXO_PREFEITURA = re.compile(r'^PREF(EITURA)? MUN(IC|ICIPAL)? (DE|DA|DO|DAS|DOS) ')
NOME_NO_IBGE = {('TO', 'SITIO NOVO'): 'SITIO NOVO DO TOCANTINS'}  # (UF, nome do FNDE): nome do IBGE
COLUNAS_AGRICULTOR = ['pseudonimo', 'municipio', 'uf', 'organico', 'ja_vendeu_pnae']  # lista fechada: nada pessoal
COLUNAS_ENTREGA = ['data', 'escola', 'produto_id', 'agricultor_pseudonimo', 'quantidade', 'unidade', 'valor',
                   'no_prazo']
COLUNAS_LEITURA = ['dispositivo', 'momento', 'temperatura_c', 'peso_kg', 'porta_aberta']


def tratar(raw: Path, trusted: Path) -> dict[str, Path]:
    publicos = raw / 'publicos'
    municipios = tratar_municipios(publicos / 'ibge' / MUNICIPIOS)
    tabelas = {
        'pnae_af': tratar_af(publicos / 'fnde-af', municipios),
        'repasses': tratar_repasses(publicos / 'repasses' / REPASSES),
        'municipios': municipios,
        **tratar_app_e_simulado(raw),
    }
    trusted.mkdir(parents=True, exist_ok=True)
    caminhos = {nome: trusted / f'{nome}.csv' for nome in tabelas}
    for nome, tabela in tabelas.items():
        tabela.to_csv(caminhos[nome], index=False)
    return caminhos


def normalizar(texto) -> str:
    """Maiúsculas, sem acento e com espaços simples: para comparar nomes."""
    sem_acento = unicodedata.normalize('NFKD', str(texto)).encode('ascii', 'ignore').decode()
    return ' '.join(sem_acento.upper().split())


def numero_br(valor) -> float:
    """Número do Excel ou texto no formato brasileiro ('\\xa069.234,48' vira 69234.48). O resto vira NaN."""
    if isinstance(valor, str):
        valor = valor.replace('\xa0', '').strip()
        if ',' in valor:
            valor = valor.replace('.', '').replace(',', '.')
    try:
        return float(valor)
    except (TypeError, ValueError):
        return float('nan')


def esfera_pelo_nome(entidade: str) -> str:
    """Para 2018 e 2019, que não têm a coluna ESFERA: prefeitura é MUNICIPAL; secretaria de estado, ESTADUAL."""
    return 'MUNICIPAL' if PREFEITURA.search(normalizar(entidade)) else 'ESTADUAL'


def ler_planilha_af(arquivo: Path, ano: int) -> pd.DataFrame:
    bruto = pd.read_excel(arquivo, sheet_name=0, header=None, dtype=object)  # a aba de dados é sempre a primeira
    linha = next((i for i, valores in bruto.iterrows()
                  if valores.astype(str).str.contains('entidade', case=False).any()), None)
    if linha is None:
        raise ValueError(f'{arquivo.name}: cabeçalho com "Entidade" não encontrado')
    colunas = COLUNAS_AF['C' if ano <= 2019 else 'D']
    planilha = bruto.iloc[linha + 1:].set_axis([normalizar(nome) for nome in bruto.iloc[linha]], axis=1)
    af = planilha[[nome for nome in planilha.columns if nome in colunas]].rename(columns=colunas)
    faltando = set(colunas.values()) - set(af.columns)
    if faltando:
        raise ValueError(f'{arquivo.name}: faltam as colunas {sorted(faltando)}')
    af = af.dropna(subset=['entidade'])  # a linha de total não tem entidade
    af = af.assign(
        ano=ano,
        preliminar=ano in ANOS_PRELIMINARES,
        entidade=af['entidade'].str.strip(),
        cod_ibge=pd.to_numeric(af['cod_ibge'], errors='coerce').astype('Int64'),
        repasse=af['repasse'].map(numero_br),
        compra_af=af['compra_af'].map(numero_br))
    if 'esfera' not in af:
        af['esfera'] = af['entidade'].map(esfera_pelo_nome)
    return af


def tratar_af(pasta: Path, municipios: pd.DataFrame) -> pd.DataFrame:
    af = pd.concat([ler_planilha_af(pasta / arquivo, ano) for ano, arquivo in PLANILHAS_AF.items()],
                   ignore_index=True)
    af = conferir_codigos(af.drop_duplicates(ignore_index=True), municipios)  # 2022 repete São João Evangelista
    af['repasse_zero'] = af['repasse'] == 0
    # recalculado dos valores (a coluna Percentual mistura fração, pontos e texto); vazio sem repasse ou sem número
    af['pct_af'] = (af['compra_af'] / af['repasse']).where(af['repasse'].gt(0) & af['compra_af'].notna())
    repetidas = af.duplicated(['ano', 'cod_ibge', 'esfera'])
    if repetidas.any():
        log.warning('%d linhas da AF com a chave (ano, código IBGE, esfera) repetida foram descartadas',
                    repetidas.sum())
    colunas = ['ano', 'cod_ibge', 'uf', 'entidade', 'esfera', 'repasse', 'compra_af', 'pct_af', 'preliminar',
               'repasse_zero']
    return af.loc[~repetidas, colunas]


def conferir_codigos(af: pd.DataFrame, municipios: pd.DataFrame) -> pd.DataFrame:
    """Confere o código IBGE com a UF da linha. Em 2022, 13 prefeituras vêm com o código da cidade de mesmo nome
    em outro estado (ex.: Sítio Novo, TO, com o código de Sítio Novo, MA): o código é refeito pelo nome e pela UF."""
    uf_do_codigo = af['cod_ibge'].map(municipios.set_index('cod_ibge')['uf'])
    af['uf'] = af['uf'].fillna(uf_do_codigo)  # Guaratinguetá (SP) vem sem UF em 2022
    codigo_pelo_nome = dict(zip(zip(municipios['uf'], municipios['municipio'].map(normalizar)),
                                municipios['cod_ibge']))
    for i in af.loc[af['uf'] != uf_do_codigo].index:
        uf, nome = af.at[i, 'uf'], PREFIXO_PREFEITURA.sub('', normalizar(af.at[i, 'entidade']))
        codigo = codigo_pelo_nome.get((uf, NOME_NO_IBGE.get((uf, nome), nome)))
        if codigo is None:
            log.warning('código IBGE não conferido: %s (%s), %s', af.at[i, 'entidade'], uf, af.at[i, 'ano'])
        af.at[i, 'cod_ibge'] = pd.NA if codigo is None else codigo
    return af


def tratar_repasses(arquivo: Path) -> pd.DataFrame:
    repasses = pd.read_csv(arquivo, sep=';', encoding='utf-8-sig', dtype={'CNPJ_Responsavel': str}).rename(columns={
        'Ano_Exercicio': 'ano', 'UF': 'uf', 'Municipio': 'municipio', 'Entidade_Responsavel': 'entidade',
        'CNPJ_Responsavel': 'cnpj', 'Quantidade_Alunos': 'alunos', 'Quantidade_Escolas': 'escolas',
        'Valor_Repasse': 'repasse'})
    return repasses.dropna(subset=['repasse']).drop_duplicates(['ano', 'cnpj'])  # 921 linhas vêm sem o valor


def tratar_municipios(arquivo: Path) -> pd.DataFrame:
    municipios = pd.read_json(arquivo).rename(columns={
        'municipio-id': 'cod_ibge', 'municipio-nome': 'municipio', 'UF-sigla': 'uf', 'regiao-nome': 'regiao',
        'regiao-intermediaria-nome': 'regiao_intermediaria', 'regiao-imediata-nome': 'regiao_imediata'})
    colunas = ['cod_ibge', 'municipio', 'uf', 'regiao', 'regiao_intermediaria', 'regiao_imediata']
    return municipios[colunas].drop_duplicates('cod_ibge')


def tratar_app_e_simulado(raw: Path) -> dict[str, pd.DataFrame]:
    """O histórico simulado e a última exportação do app, se houver, numa tabela só com a coluna `origem`."""
    fontes = {'simulado': json.loads((raw / 'simulado' / 'simulado.json').read_text(encoding='utf-8'))}
    exportacao = max((raw / 'app').glob('exportacao-*.json'), default=None)
    if exportacao:
        app = json.loads(exportacao.read_text(encoding='utf-8'))
        unidades = {(proposta.get('id'), item.get('produto_id')): item.get('unidade')
                    for proposta in app['propostas'] for item in proposta.get('itens') or []}
        for entrega in app['entregas']:  # a unidade é a do edital, guardada no item da proposta
            entrega['unidade'] = unidades.get((entrega.get('proposta_id'), entrega.get('produto_id')))
        fontes['app'] = app
    agricultores = juntar(fontes, 'agricultores', COLUNAS_AGRICULTOR)
    entregas = juntar(fontes, 'entregas', COLUNAS_ENTREGA)
    leituras = juntar(fontes, 'leituras', COLUNAS_LEITURA)
    return {
        'agricultores': agricultores.assign(
            organico=booleano(agricultores['organico']), ja_vendeu_pnae=booleano(agricultores['ja_vendeu_pnae'])),
        'entregas': entregas.assign(  # as linhas já são únicas: uma foto do app (com id) e o simulado
            data=pd.to_datetime(entregas['data'].astype(str).str[:10], errors='coerce'),  # data ou data e hora ISO
            quantidade=pd.to_numeric(entregas['quantidade'], errors='coerce'),
            unidade=entregas['unidade'].str.strip().str.lower(),
            valor=pd.to_numeric(entregas['valor'], errors='coerce'),
            no_prazo=booleano(entregas['no_prazo'])),
        'leituras': leituras.assign(
            momento=pd.to_datetime(leituras['momento'], utc=True, format='ISO8601', errors='coerce'),
            temperatura_c=pd.to_numeric(leituras['temperatura_c'], errors='coerce'),
            peso_kg=pd.to_numeric(leituras['peso_kg'], errors='coerce'),
            porta_aberta=booleano(leituras['porta_aberta']),
        ).dropna(subset=['momento', 'temperatura_c']).drop_duplicates(['origem', 'dispositivo', 'momento']),
    }


def juntar(fontes: dict, colecao: str, colunas: list[str]) -> pd.DataFrame:
    """Só as colunas da lista passam: o que mais vier do app (nome, CPF, CAF...) fica de fora."""
    partes = [pd.DataFrame(dados[colecao], columns=colunas).assign(origem=origem) for origem, dados in fontes.items()]
    return pd.concat(partes, ignore_index=True)[['origem', *colunas]]


def booleano(serie: pd.Series) -> pd.Series:
    return pd.to_numeric(serie, errors='coerce').astype('boolean')  # o SQLite do app guarda 0 e 1
