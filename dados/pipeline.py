"""Pipeline do data lake do Merenda do Vizinho: raw -> trusted -> refined.

Da raiz do repositório: python -m dados.pipeline {tudo,baixar-fontes,ingerir-app,gerar-simulado,tratar,refinar}
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

import pandas as pd

from dados.etapas.baixar_fontes import baixar_fontes
from dados.etapas.gerar_simulado import gerar_simulado
from dados.etapas.ingerir_app import ingerir_app
from dados.etapas.refinar import refinar
from dados.etapas.tratar import tratar

log = logging.getLogger(__name__)

DATALAKE = Path(__file__).resolve().parent / 'datalake'
ETAPAS = ('tudo', 'baixar-fontes', 'ingerir-app', 'gerar-simulado', 'tratar', 'refinar')


def executar(etapa: str, datalake: Path = DATALAKE) -> None:
    raw, trusted, refined = datalake / 'raw', datalake / 'trusted', datalake / 'refined'
    passos = {
        'baixar-fontes': lambda: baixar_fontes(raw),
        'ingerir-app': lambda: ingerir_app(os.environ.get('APP_URL', 'http://localhost:3000'),
                                           os.environ.get('CHAVE_SERVICO', ''), raw),
        'gerar-simulado': lambda: gerar_simulado(raw),
        'tratar': lambda: tratar(raw, trusted),
        'refinar': lambda: refinar(trusted, refined),
    }
    for nome, passo in passos.items():
        if etapa in ('tudo', nome):
            log.info('etapa %s', nome)
            passo()


def contar_linhas(arquivo: Path) -> int:
    """Registros do JSON, linhas da planilha (com os títulos, como no arquivo) ou do CSV."""
    if arquivo.suffix == '.json':
        dados = json.loads(arquivo.read_text(encoding='utf-8'))
        return len(dados) if isinstance(dados, list) else sum(len(v) for v in dados.values() if isinstance(v, list))
    if arquivo.suffix == '.xlsx':
        return len(pd.read_excel(arquivo, sheet_name=0, header=None))
    return len(pd.read_csv(arquivo, sep=';' if arquivo.suffix == '.gz' else ','))


def resumo(datalake: Path = DATALAKE) -> str:
    """Linhas de cada arquivo, por camada. O .xlsx do refined repete as tabelas dos CSVs, uma por aba."""
    texto = ['Resumo do data lake (linhas por camada):']
    for camada, padrao in (('raw', '*.*'), ('trusted', '*.csv'), ('refined', '*.csv')):
        pasta = datalake / camada
        linhas = {arquivo.relative_to(pasta).as_posix(): contar_linhas(arquivo)
                  for arquivo in sorted(pasta.rglob(padrao))}
        texto.append(f'{camada}: {sum(linhas.values()):,} linhas em {len(linhas)} arquivos'.replace(',', '.'))
        texto += [f'  {nome}: {total:,}'.replace(',', '.') for nome, total in linhas.items()]
    excel = datalake / 'refined' / 'merenda_do_vizinho.xlsx'
    if excel.exists():
        with pd.ExcelFile(excel) as planilha:
            texto.append(f'refined/{excel.name}: abas {", ".join(planilha.sheet_names)}')
    return '\n'.join(texto)


def principal(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog='python -m dados.pipeline',
                                     description='Pipeline do data lake do Merenda do Vizinho (raw, trusted, refined).')
    parser.add_argument('etapa', choices=ETAPAS, help='etapa a rodar; "tudo" roda todas, na ordem')
    etapa = parser.parse_args(argv).etapa
    logging.addLevelName(logging.INFO, 'info')
    logging.addLevelName(logging.WARNING, 'aviso')
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    executar(etapa)
    print(resumo())
    return 0


if __name__ == '__main__':
    sys.exit(principal())
