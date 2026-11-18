"""Pipeline do data lake. Da raiz do repositório: .venv/bin/python -m unittest discover -s dados/tests -t ."""

import io
import json
import logging.handlers
import math
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

import pandas as pd

from dados import pipeline
from dados.etapas.gerar_simulado import gerar_simulado
from dados.etapas.ingerir_app import ingerir_app
from dados.etapas.tratar import esfera_pelo_nome, numero_br
from dados.regras import faixa, gap_reais, minimo_do_ano

FIXTURES = Path(__file__).resolve().parent / 'fixtures'
ABAS = ['fato_pnae_af', 'fato_repasse_uf', 'fato_entregas', 'fato_camara_fria', 'dim_produto', 'dim_municipio']


class TestRegras(unittest.TestCase):
    def test_minimo_de_30_ate_2025_e_de_45_a_partir_de_2026(self):
        self.assertEqual(minimo_do_ano(2025), 0.30)
        self.assertEqual(minimo_do_ano(2026), 0.45)

    def test_gap_e_o_que_falta_para_o_minimo_e_nunca_negativo(self):
        self.assertEqual(gap_reais(1000, 200, 2026), 250)
        self.assertEqual(gap_reais(1000, 500, 2025), 0)

    def test_faixas_de_cumprimento(self):
        self.assertEqual(faixa(0, 2026), 'sem compra')
        self.assertEqual(faixa(None, 2026), 'sem repasse')
        self.assertEqual(faixa(math.nan, 2026), 'sem repasse')  # o vazio como o pandas lê
        self.assertEqual(faixa(0.29, 2025), 'abaixo do mínimo')
        self.assertEqual(faixa(0.30, 2025), 'no mínimo')
        self.assertEqual(faixa(0.39, 2025), 'no mínimo')
        self.assertEqual(faixa(0.40, 2025), 'acima do mínimo')
        self.assertEqual(faixa(0.44, 2026), 'abaixo do mínimo')


class TestLimpeza(unittest.TestCase):
    def test_numero_br_gravado_como_texto(self):
        self.assertEqual(numero_br('\xa069.234,48'), 69234.48)
        self.assertEqual(numero_br('\xa04.594.945,98'), 4594945.98)
        self.assertEqual(numero_br(87677.64), 87677.64)
        self.assertTrue(math.isnan(numero_br('100% ou mais')))
        self.assertTrue(math.isnan(numero_br(math.nan)))

    def test_esfera_pelo_nome_da_entidade(self):
        for entidade in ('PREF MUN DE ACRELANDIA', 'SEC MUN DE EDUC DE NATAL', 'MUNICIPIO DE MARIANA',
                         'PM DE CARLOS CHAGAS', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO DE PALMAS'):
            self.assertEqual(esfera_pelo_nome(entidade), 'MUNICIPAL', entidade)
        for entidade in ('SECRETARIA DE ESTADO DA EDUCAÇÃO', 'ESTADO DO AMAPA - GABINETE DO GOVERNADOR'):
            self.assertEqual(esfera_pelo_nome(entidade), 'ESTADUAL', entidade)


class TestIngerirApp(unittest.TestCase):
    def test_grava_no_raw_a_exportacao_pedida_com_a_chave_de_servico(self):
        exportacao = (FIXTURES / 'exportacao-app.json').read_bytes()
        with tempfile.TemporaryDirectory() as pasta, \
                mock.patch('urllib.request.urlopen', return_value=io.BytesIO(exportacao)) as urlopen:
            caminho = ingerir_app('http://app:3000', 'chave-teste', Path(pasta))
            gravado = json.loads(caminho.read_text(encoding='utf-8'))
        pedido = urlopen.call_args.args[0]
        self.assertTrue(pedido.full_url.startswith('http://app:3000/api/exportar?desde='), pedido.full_url)
        self.assertEqual(pedido.get_header('X-chave-servico'), 'chave-teste')  # urllib guarda o nome com capitalize()
        self.assertEqual(caminho.parent.name, 'app')
        self.assertEqual(gravado, json.loads(exportacao))

    def test_chave_recusada_401_vira_aviso_e_o_pipeline_segue_sem_o_app(self):
        erro = urllib.error.HTTPError('http://app:3000/api/exportar', 401, 'Unauthorized', {}, io.BytesIO())
        with tempfile.TemporaryDirectory() as pasta, mock.patch('urllib.request.urlopen', side_effect=erro), \
                self.assertLogs('dados', 'WARNING') as avisos:
            self.assertIsNone(ingerir_app('http://app:3000', 'errada', Path(pasta)))
            self.assertEqual(list(Path(pasta).rglob('*.json')), [])
        self.assertIn('401', avisos.output[0])

    def test_app_fora_do_ar_devolve_none_com_aviso(self):
        with tempfile.TemporaryDirectory() as pasta, \
                mock.patch('urllib.request.urlopen', side_effect=urllib.error.URLError('conexão recusada')), \
                self.assertLogs('dados', 'WARNING') as avisos:
            self.assertIsNone(ingerir_app('http://localhost:3000', 'chave-teste', Path(pasta)))
        self.assertIn('fora do ar', avisos.output[0])


class TestPipelineTudo(unittest.TestCase):
    """`tudo` com PIPELINE_OFFLINE=1, uma vez para a classe. O app devolve o controle com nome, CPF e CAF."""

    @classmethod
    def setUpClass(cls):
        pasta = tempfile.TemporaryDirectory()
        cls.addClassCleanup(pasta.cleanup)
        cls.datalake = Path(pasta.name)
        cls.controle = json.loads((FIXTURES / 'exportacao-app-com-dados-pessoais.json').read_text(encoding='utf-8'))
        avisos = logging.handlers.BufferingHandler(capacity=1000)
        logging.getLogger('dados').addHandler(avisos)
        cls.addClassCleanup(logging.getLogger('dados').removeHandler, avisos)
        ambiente = {'PIPELINE_OFFLINE': '1', 'APP_URL': 'http://app:3000', 'CHAVE_SERVICO': 'chave-teste'}
        resposta = io.BytesIO(json.dumps(cls.controle).encode())
        with mock.patch.dict(os.environ, ambiente), mock.patch('urllib.request.urlopen', return_value=resposta):
            pipeline.executar('tudo', cls.datalake)
        cls.avisos = [registro.getMessage() for registro in avisos.buffer]
        cls.refined = cls.datalake / 'refined'
        cls.af = pd.read_csv(cls.refined / 'fato_pnae_af.csv')

    def test_tudo_offline_cria_as_tres_camadas_e_o_xlsx_com_as_seis_abas(self):
        self.assertTrue(any('PIPELINE_OFFLINE' in aviso for aviso in self.avisos), self.avisos)
        self.assertEqual(len(list((self.datalake / 'raw' / 'publicos').rglob('*.*'))), 7)
        self.assertEqual(len(list((self.datalake / 'raw' / 'app').glob('exportacao-*.json'))), 1)
        self.assertTrue((self.datalake / 'raw' / 'simulado' / 'simulado.json').exists())
        trusted = {csv.stem for csv in (self.datalake / 'trusted').glob('*.csv')}
        self.assertEqual(trusted, {'pnae_af', 'repasses', 'municipios', 'agricultores', 'entregas', 'leituras'})
        for aba in ABAS:
            self.assertGreater(len(pd.read_csv(self.refined / f'{aba}.csv')), 0, aba)
        with pd.ExcelFile(self.refined / 'merenda_do_vizinho.xlsx') as excel:
            self.assertEqual(excel.sheet_names, ABAS)
        self.assertIn('municipios.csv: 5.571', pipeline.resumo(self.datalake))

    def test_trusted_sem_cpf_caf_nome(self):
        pessoais = [agricultor[chave] for agricultor in self.controle['agricultores']
                    for chave in ('nome', 'cpf', 'caf', 'email')]
        recebido = next((self.datalake / 'raw' / 'app').glob('exportacao-*.json')).read_text(encoding='utf-8')
        for valor in pessoais:
            self.assertIn(valor, recebido)  # controle positivo: os dados pessoais chegaram ao raw
        for csv in (self.datalake / 'trusted').glob('*.csv'):
            colunas = set(pd.read_csv(csv, nrows=0).columns)
            self.assertEqual(colunas & {'cpf', 'caf', 'nome', 'email', 'agricultor_id'}, set(), csv.name)
            texto = csv.read_text(encoding='utf-8')
            for valor in pessoais:
                self.assertNotIn(valor, texto, csv.name)
        agricultores = pd.read_csv(self.datalake / 'trusted' / 'agricultores.csv')
        self.assertEqual(set(agricultores.loc[agricultores['origem'] == 'app', 'pseudonimo']),
                         {'3a7f9c1e5b2d', '8e4b6d0a2c9f'})

    def test_numeros_de_referencia_de_2022(self):
        # método do README do data lake: o % nacional soma todas as entidades; a contagem e as faltas, só
        # prefeituras; sempre sem as linhas com repasse 0 ou valor não numérico (as de pct_af vazio)
        af = self.af[self.af['ano'] == 2022]
        validas = af[af['pct_af'].notna()]
        self.assertAlmostEqual(validas['compra_af'].sum() / validas['repasse'].sum(), 0.4450, delta=0.0005)
        prefeituras = af[af['esfera'] == 'MUNICIPAL']
        abaixo = prefeituras[prefeituras['pct_af'] < prefeituras['minimo']]
        self.assertEqual(len(abaixo), 1531)
        self.assertEqual(abaixo['cod_ibge'].nunique(), 1531)  # o DISTINCTCOUNT do Power BI dá o mesmo
        self.assertAlmostEqual(prefeituras['falta_minimo_reais'].sum() / 1e6, 97.1, delta=0.1)
        self.assertAlmostEqual(prefeituras['falta_45_reais'].sum() / 1e6, 244.8, delta=0.1)
        self.assertAlmostEqual(af['falta_45_reais'].sum() / 1e6, 461.3, delta=0.1)  # com as secretarias estaduais

    def test_af_com_chave_unica_codigo_ibge_conferido_e_preliminar_de_2020_a_2022(self):
        self.assertFalse(self.af.duplicated(['ano', 'cod_ibge', 'esfera']).any())
        sitio_novo = self.af[(self.af['ano'] == 2022) & (self.af['entidade'] == 'PREF MUN DE SITIO NOVO')]
        self.assertEqual(sorted(zip(sitio_novo['uf'], sitio_novo['cod_ibge'])),  # o de TO vinha com o código do MA
                         [('MA', 2111805), ('RN', 2413706), ('TO', 1720804)])
        self.assertFalse(self.af['municipio'].isna().any())  # todo código existe na tabela do IBGE
        self.assertEqual(self.af.groupby('ano')['preliminar'].all().to_dict(),
                         {2018: False, 2019: False, 2020: True, 2021: True, 2022: True})
        zero = self.af[self.af['repasse_zero']]
        self.assertTrue(zero['pct_af'].isna().all())
        self.assertEqual((zero['ano'] == 2022).sum(), 42)

    def test_entregas_do_app_com_unidade_kg_so_em_kg_e_sem_agricultor(self):
        entregas = pd.read_csv(self.refined / 'fato_entregas.csv')
        app = entregas[entregas['origem'] == 'app'].set_index('produto_id')
        self.assertEqual(app['unidade'].to_dict(), {'alface': 'pç', 'mandioca': 'kg'})
        self.assertEqual(app.loc['mandioca', 'kg'], 80)
        self.assertTrue(math.isnan(app.loc['alface', 'kg']))
        self.assertTrue(app['agricultor_pseudonimo'].isna().all())
        self.assertTrue(app['primeira_venda'].isna().all())

    def test_simulado_com_25_agricultores_12_escolas_12_meses_e_leitura_horaria(self):
        entregas = pd.read_csv(self.refined / 'fato_entregas.csv', parse_dates=['data'])
        simulado = entregas[entregas['origem'] == 'simulado']
        self.assertEqual(simulado['agricultor_pseudonimo'].nunique(), 25)
        self.assertEqual(simulado['escola'].nunique(), 12)
        self.assertEqual(simulado['data'].dt.to_period('M').nunique(), 12)
        self.assertTrue(simulado['primeira_venda'].any() and not simulado['primeira_venda'].all())
        camara = pd.read_csv(self.refined / 'fato_camara_fria.csv')
        self.assertEqual((camara['origem'] == 'simulado').sum(), 365 * 24)
        with tempfile.TemporaryDirectory() as pasta:  # a mesma semente gera os mesmos dados
            self.assertEqual(gerar_simulado(Path(pasta)).read_bytes(),
                             (self.datalake / 'raw' / 'simulado' / 'simulado.json').read_bytes())

    def test_camara_fria_por_hora_de_brasilia_com_minutos_acima_de_10_graus(self):
        camara = pd.read_csv(self.refined / 'fato_camara_fria.csv')
        app = camara[camara['origem'] == 'app']
        self.assertEqual(app['hora'].tolist(), ['2026-07-15 10:00:00'])  # 13 h em UTC
        self.assertAlmostEqual(app['minutos_fora_faixa'].iloc[0], 4 / 60)  # 10,4 °C e 10,8 °C por 2 s cada
        self.assertAlmostEqual(app['temperatura_media_c'].iloc[0], (6.0 + 10.4 + 10.8 + 6.5) / 4)
        self.assertTrue(app['porta_aberta'].iloc[0])
