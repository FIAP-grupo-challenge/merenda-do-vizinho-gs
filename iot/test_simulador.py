import contextlib
import datetime
import io
import json
import unittest
import urllib.error
from unittest import mock

from iot.simulador import enviar, gerar_leitura, principal

URL = 'http://localhost:3000/api/leituras'
CENARIOS = ('normal', 'porta-aberta', 'entrega', 'colheita')


class TestGerarLeitura(unittest.TestCase):
    def test_leitura_tem_os_campos_do_arduino_e_momento_iso(self):
        leitura = gerar_leitura('normal', 0, {})
        self.assertEqual(set(leitura), {'dispositivo', 'temperatura_c', 'peso_kg', 'porta_aberta', 'momento'})
        self.assertEqual(leitura['dispositivo'], 'camara-01')
        self.assertIsInstance(datetime.datetime.fromisoformat(leitura['momento']), datetime.datetime)

    def test_momento_em_utc_com_offset_00_00(self):
        momento = gerar_leitura('normal', 0, {})['momento']
        self.assertTrue(momento.endswith('+00:00'), momento)  # o mesmo em qualquer máquina, sem depender do fuso

    def test_porta_aberta_temperatura_sobe_de_5_ate_18(self):
        inicio = gerar_leitura('porta-aberta', 0, {})
        self.assertTrue(inicio['porta_aberta'])
        self.assertEqual(inicio['temperatura_c'], 5.0)
        self.assertGreater(gerar_leitura('porta-aberta', 10, {})['temperatura_c'], inicio['temperatura_c'])
        self.assertEqual(gerar_leitura('porta-aberta', 100, {})['temperatura_c'], 18.0)

    def test_porta_aberta_cruza_o_limite_de_10_graus_no_passo_13(self):
        # 10,0 °C é o limite do alarme do Arduino: a demonstração passa dele no passo 13 (10,2 °C)
        self.assertLessEqual(gerar_leitura('porta-aberta', 12, {})['temperatura_c'], 10.0)
        self.assertGreater(gerar_leitura('porta-aberta', 13, {})['temperatura_c'], 10.0)

    def test_entrega_peso_cai_15_kg_por_passo_ate_20_kg(self):
        pesos = [gerar_leitura('entrega', passo, {})['peso_kg'] for passo in range(5)]
        self.assertEqual([depois - antes for antes, depois in zip(pesos, pesos[1:])], [-15.0] * 4)
        self.assertEqual(gerar_leitura('entrega', 100, {})['peso_kg'], 20.0)

    def test_colheita_peso_sobe_20_kg_por_passo_ate_480_kg(self):
        pesos = [gerar_leitura('colheita', passo, {})['peso_kg'] for passo in range(5)]
        self.assertEqual([depois - antes for antes, depois in zip(pesos, pesos[1:])], [20.0] * 4)
        self.assertEqual(gerar_leitura('colheita', 100, {})['peso_kg'], 480.0)

    def test_normal_fica_entre_4_e_7_graus_com_180_kg_e_porta_fechada(self):
        estado = {}
        for passo in range(50):
            leitura = gerar_leitura('normal', passo, estado)
            self.assertTrue(4.0 <= leitura['temperatura_c'] <= 7.0)
            self.assertEqual(leitura['peso_kg'], 180.0)
            self.assertFalse(leitura['porta_aberta'])

    def test_todos_os_cenarios_ficam_nas_faixas_fisicas(self):
        for cenario in CENARIOS:
            estado = {}
            for passo in range(60):
                leitura = gerar_leitura(cenario, passo, estado)
                self.assertTrue(-30 <= leitura['temperatura_c'] <= 60, (cenario, passo))
                self.assertTrue(0 <= leitura['peso_kg'] <= 5000, (cenario, passo))

    def test_cenario_desconhecido_levanta_erro(self):
        with self.assertRaises(ValueError):
            gerar_leitura('inexistente', 0, {})


class TestEnviar(unittest.TestCase):
    def test_faz_post_com_a_chave_e_devolve_o_status(self):
        with mock.patch('urllib.request.urlopen') as urlopen:
            urlopen.return_value.__enter__.return_value = mock.MagicMock(status=201)
            status = enviar(URL, 'chave-teste', {'dispositivo': 'camara-01'})
        pedido = urlopen.call_args.args[0]
        self.assertEqual(status, 201)
        self.assertEqual(pedido.full_url, URL)
        self.assertEqual(pedido.get_method(), 'POST')
        self.assertEqual(pedido.headers['X-chave-dispositivo'], 'chave-teste')  # urllib guarda o nome com capitalize()
        self.assertEqual(json.loads(pedido.data), {'dispositivo': 'camara-01'})

    def test_devolve_o_status_de_erro_http(self):
        erro = urllib.error.HTTPError(URL, 401, 'Não autorizado', {}, io.BytesIO())
        with mock.patch('urllib.request.urlopen', side_effect=erro):
            self.assertEqual(enviar(URL, 'errada', {}), 401)


class TestPrincipal(unittest.TestCase):
    def rodar(self, *argumentos):
        saida, erro = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
            codigo = principal(list(argumentos))
        return codigo, saida.getvalue().splitlines(), erro.getvalue()

    def test_modo_seco_imprime_as_leituras_sem_enviar(self):
        with mock.patch('iot.simulador.enviar') as enviar_falso:
            codigo, linhas, _ = self.rodar('--cenario', 'porta-aberta', '--seco', '--quantidade', '5', '--intervalo', '0')
        enviar_falso.assert_not_called()
        self.assertEqual(codigo, 0)
        self.assertEqual([json.loads(linha)['temperatura_c'] for linha in linhas], [5.0, 5.4, 5.8, 6.2, 6.6])
        self.assertTrue(linhas[0].startswith('{"dispositivo":"camara-01","temperatura_c":5.0,'))

    def test_sai_com_0_quando_todas_as_respostas_forem_201(self):
        with mock.patch('iot.simulador.enviar', return_value=201):
            codigo, linhas, _ = self.rodar('--chave', 'x', '--quantidade', '2', '--intervalo', '0')
        self.assertEqual(codigo, 0)
        self.assertEqual(len(linhas), 2)
        self.assertTrue(all(linha.startswith('201 {') for linha in linhas))

    def test_sai_com_1_se_algum_status_nao_for_201(self):
        with mock.patch('iot.simulador.enviar', side_effect=[201, 200]):
            codigo, linhas, _ = self.rodar('--chave', 'x', '--quantidade', '2', '--intervalo', '0')
        self.assertEqual(codigo, 1)
        self.assertEqual([linha.split()[0] for linha in linhas], ['201', '200'])

    def test_sem_conexao_sai_com_1_e_avisa_no_erro(self):
        with mock.patch('urllib.request.urlopen', side_effect=urllib.error.URLError('recusada')):
            codigo, _, erro = self.rodar('--chave', 'x', '--quantidade', '2', '--intervalo', '0')
        self.assertEqual(codigo, 1)
        self.assertIn('falha ao enviar', erro)
