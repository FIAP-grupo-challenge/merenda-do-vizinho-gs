"""Etapa baixar-fontes: baixa os dados públicos para raw/publicos. Se a rede falhar, ou com PIPELINE_OFFLINE=1,
usa a cópia versionada em dados/datalake/raw/publicos. Fontes, links e licenças: dados/datalake/README.md."""

import logging
import os
import shutil
import urllib.request
from pathlib import Path

log = logging.getLogger(__name__)

COPIA_VERSIONADA = Path(__file__).resolve().parents[1] / 'datalake' / 'raw' / 'publicos'
GOVBR_AF = ('https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pnae/consultas/'
            'dados-agricultura-familiar-planilhas/{}/@@download/file')

PLANILHAS_AF = {  # ano: planilha da compra da AF no gov.br
    2018: 'DadosAF2018.xlsx',
    2019: 'ExtracaoAF_201910322_paraenvio.xlsx',  # não a DadosAF2019, que soma R$ 1 bi a mais que os repasses
    2020: 'Planilha2020_04_3_24.xlsx',
    2021: 'Planilha2021_04_3_24.xlsx',
    2022: 'Planilha2022_04_3_24.xlsx',
}
REPASSES = 'PNAE_Repasses_Alunos_Escolas_Atendidas.txt.gz'
MUNICIPIOS = 'municipios_ibge_nivelado.json'

FONTES = [  # (pasta em raw/publicos, arquivo, URL oficial)
    *[('fnde-af', arquivo, GOVBR_AF.format(arquivo)) for arquivo in PLANILHAS_AF.values()],
    ('repasses', REPASSES,
     'https://www.fnde.gov.br/plataforma-antonieta-de-barros-api/products/data-products/82/artifact'),
    ('ibge', MUNICIPIOS, 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado'),
]
# Começo esperado de cada tipo de arquivo: uma página de erro em HTML nunca substitui a cópia boa
ASSINATURAS = {'.xlsx': b'PK\x03\x04', '.gz': b'\x1f\x8b', '.json': b'['}


def baixar_fontes(raw: Path) -> list[Path]:
    offline = os.environ.get('PIPELINE_OFFLINE') == '1'
    if offline:
        log.warning('PIPELINE_OFFLINE=1: usando a cópia versionada das fontes públicas')
    arquivos = []
    for pasta, nome, url in FONTES:
        destino = raw / 'publicos' / pasta / nome
        destino.parent.mkdir(parents=True, exist_ok=True)
        if offline or not baixar(url, destino):
            versionado = COPIA_VERSIONADA / pasta / nome
            if versionado.resolve() != destino.resolve():
                shutil.copy2(versionado, destino)
        arquivos.append(destino)
    return arquivos


def baixar(url: str, destino: Path) -> bool:
    """Baixa para um arquivo temporário e só troca o destino se o conteúdo tiver a assinatura esperada."""
    temporario = destino.with_name(destino.name + '.baixando')
    try:
        with urllib.request.urlopen(url, timeout=60) as resposta, temporario.open('wb') as saida:
            shutil.copyfileobj(resposta, saida)
        with temporario.open('rb') as baixado:
            if not baixado.read(4).startswith(ASSINATURAS[destino.suffix]):
                raise ValueError('o conteúdo não é o arquivo esperado')
        temporario.replace(destino)
        return True
    except (OSError, ValueError) as erro:  # sem rede, HTTP de erro (URLError é OSError) ou página no lugar do arquivo
        log.warning('falha ao baixar %s (%s): usando a cópia versionada', destino.name, erro)
        temporario.unlink(missing_ok=True)
        return False
