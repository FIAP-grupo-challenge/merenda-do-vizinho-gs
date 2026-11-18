"""Etapa baixar-fontes: baixa os dados públicos para raw/publicos. Se a rede falhar, ou com PIPELINE_OFFLINE=1,
usa a cópia versionada em dados/datalake/raw/publicos. Fontes, links e licenças: dados/datalake/README.md."""

import http.client
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
    """Baixa o arquivo inteiro e só troca o destino se ele vier completo e com a assinatura esperada."""
    temporario = destino.with_name(destino.name + '.baixando')
    try:
        with urllib.request.urlopen(url, timeout=60) as resposta:
            # read() sem tamanho levanta IncompleteRead se vier menos bytes que o Content-Length (o copyfileobj não)
            # shortcut: o arquivo todo na memória (a maior fonte tem 2,4 MB); gravar em blocos se alguma crescer muito
            conteudo = resposta.read()
        if not conteudo.startswith(ASSINATURAS[destino.suffix]):
            raise ValueError('o conteúdo não é o arquivo esperado')
        temporario.write_bytes(conteudo)
        temporario.replace(destino)
        return True
    except (OSError, ValueError, http.client.HTTPException) as erro:  # rede ou HTTP, página no lugar, corpo cortado
        log.warning('falha ao baixar %s (%s): usando a cópia versionada', destino.name, erro)
        return False
    finally:
        temporario.unlink(missing_ok=True)  # nunca deixa o .baixando para trás, nem com Ctrl+C
