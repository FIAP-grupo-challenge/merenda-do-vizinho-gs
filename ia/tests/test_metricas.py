import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from ia.avaliacao import rodar
from ia.avaliacao.metricas import comparar_itens, custo_usd, resumir, valores_certos
from ia.avaliacao.rodar import avaliar, cliente_que_mede, markdown, recontar, tokens
from ia.extrair.servico import extrair_chamada
from ia.tests.test_extrair_claude import CHAMADA_OK, PDF_B64, falso_que_devolve

# o item que o gabarito e a leitura trazem nos testes de avaliar
SUCO = {'produto': 'Suco integral', 'produto_id': None, 'unidade': 'l', 'quantidade': 1000, 'preco_unitario': 19.54}


def linha(arquivo, modo, origem, total, encontrados, corretos, valores, prazo_correto, duracao_ms, avisos=()):
    return {'arquivo': arquivo, 'modo': modo, 'origem': origem, 'total_gabarito': total, 'encontrados': encontrados,
            'corretos': corretos, 'valores_certos': valores, 'prazo_correto': prazo_correto, 'duracao_ms': duracao_ms,
            'avisos': list(avisos)}


def item(produto, quantidade, preco, produto_id=None):
    return {'produto': produto, 'produto_id': produto_id, 'quantidade': quantidade, 'preco_unitario': preco}


class TestMetricas(unittest.TestCase):
    def test_comparar_itens_conta_encontrados_e_corretos(self):
        gab = [{'produto_id': 'alface', 'quantidade': 1200, 'preco_unitario': 5.4}, {'produto_id': 'mel', 'quantidade': 150, 'preco_unitario': 38.5}]
        ext = [{'produto_id': 'alface', 'quantidade': 1200, 'preco_unitario': 5.405}, {'produto_id': 'mel', 'quantidade': 15, 'preco_unitario': 38.5}]
        self.assertEqual(comparar_itens(ext, gab), {'total_gabarito': 2, 'encontrados': 2, 'corretos': 1})

    def test_preco_a_dois_centavos_do_gabarito_e_encontrado_mas_nao_correto(self):
        gab = [{'produto_id': 'alface', 'quantidade': 10, 'preco_unitario': 5.4}]
        # acima e abaixo do gabarito: R$ 0,02 de diferença não passa, R$ 0,01 (e o preço igual) passa dos dois lados
        for preco, corretos in [(5.42, 0), (5.38, 0), (5.41, 1), (5.39, 1), (5.4, 1)]:
            ext = [{'produto_id': 'alface', 'quantidade': 10, 'preco_unitario': preco}]
            self.assertEqual(comparar_itens(ext, gab), {'total_gabarito': 1, 'encontrados': 1, 'corretos': corretos}, preco)
        # sem preço lido: encontrado, não correto
        ext = [{'produto_id': 'alface', 'quantidade': 10, 'preco_unitario': None}]
        self.assertEqual(comparar_itens(ext, gab), {'total_gabarito': 1, 'encontrados': 1, 'corretos': 0})

    def test_cada_extraido_casa_uma_vez_e_o_item_certo_casa_primeiro(self):
        # duas abóboras com o mesmo produto_id, lidas fora de ordem; fora do catálogo (produto_id None) casa pelo nome
        gab = [{'produto': 'Abóbora Cabotiá', 'produto_id': 'abobora', 'quantidade': 390, 'preco_unitario': 7.0},
               {'produto': 'Abóbora verde', 'produto_id': 'abobora', 'quantidade': 1640, 'preco_unitario': 6.87},
               {'produto': 'Polpa de cajá', 'produto_id': None, 'quantidade': 100, 'preco_unitario': 12.04},
               {'produto': 'Rapadura', 'produto_id': None, 'quantidade': 50, 'preco_unitario': 15.0}]
        ext = [{'produto': 'Abóbora verde', 'produto_id': 'abobora', 'quantidade': 1640, 'preco_unitario': 6.87},
               {'produto': 'Abóbora cabotia', 'produto_id': 'abobora', 'quantidade': 390, 'preco_unitario': 7.0},
               {'produto': 'POLPA DE CAJA', 'produto_id': None, 'quantidade': 100, 'preco_unitario': 12.05},
               {'produto': 'Doce', 'produto_id': None, 'quantidade': 50, 'preco_unitario': 15.0}]
        self.assertEqual(comparar_itens(ext, gab), {'total_gabarito': 4, 'encontrados': 3, 'corretos': 3})
        # uma abóbora lida não vale pelas duas do gabarito
        self.assertEqual(comparar_itens(ext[:1], gab[:2]), {'total_gabarito': 2, 'encontrados': 1, 'corretos': 1})
        # sem nome, produto_id diferente não casa (dois nomes vazios não são o mesmo nome)
        mel, alface = {'produto_id': 'mel', 'quantidade': 1, 'preco_unitario': 1.0}, {'produto_id': 'alface', 'quantidade': 1, 'preco_unitario': 1.0}
        self.assertEqual(comparar_itens([mel], [alface]), {'total_gabarito': 1, 'encontrados': 0, 'corretos': 0})

    def test_valores_certos_ignora_o_nome_mas_nao_a_quantidade_nem_o_preco(self):
        gab = [item('Vagem', 3527, 20.07), item('Farinha de mandioca', 81197, 10.35, 'farinha-de-mandioca'),
               item('Mel', 150, 38.5, 'mel'), item('Alface', 1200, 5.4, 'alface')]
        ext = [item('Vagem fresca', 3527, 20.07),  # outro nome, números certos: não é "encontrado", mas conta aqui
               item('Farinha', 81197, 10.35),
               item('Mel', 15, 38.5, 'mel'),  # nome certo, quantidade errada
               item('Alface', 1200, 5.42, 'alface')]  # nome certo, preço R$ 0,02 acima
        self.assertEqual(comparar_itens(ext, gab), {'total_gabarito': 4, 'encontrados': 2, 'corretos': 0})
        self.assertEqual(valores_certos(ext, gab), 2)
        # o nome não pesa nem a favor: os números do mel com o nome de outro produto contam
        self.assertEqual(valores_certos([item('Alface', 150, 38.5, 'alface')], gab), 1)
        # o preço também tem a folga de R$ 0,01 e o limite de R$ 0,02
        self.assertEqual(valores_certos([item('Abacate', 1200, 5.41), item('Abacate', 150, 38.52)], gab), 1)

    def test_valores_certos_casa_cada_item_lido_uma_vez(self):
        igual = item('Banana', 5, 2.0)
        outro = item('Maçã', 5, 2.0)  # mesmos números, outro produto
        self.assertEqual(valores_certos([igual], [igual, outro]), 1)
        self.assertEqual(valores_certos([igual, igual], [igual, outro]), 2)
        self.assertEqual(valores_certos([igual, igual, igual], [igual, outro]), 2)  # item lido a mais não conta
        self.assertEqual(valores_certos([item('Banana', 5, None)], [igual]), 0)  # sem preço lido não casa
        self.assertEqual(valores_certos([], [igual]), 0)

    def test_resumir_conta_so_a_ia_que_respondeu_e_lista_as_quedas(self):
        queda = 'IA indisponível (tempo esgotado); usei o modo de regras'
        linhas = [linha('a.pdf', 'regras', 'regras', 10, 8, 6, 9, True, 100),
                  linha('b.pdf', 'regras', 'regras', 30, 12, 6, 15, False, 300),
                  linha('a.pdf', 'ia', 'ia', 10, 10, 9, 10, True, 20000),
                  linha('b.pdf', 'ia', 'regras', 30, 12, 6, 15, False, 90500, [queda])]
        # porcentagem sobre o total de itens (24 de 40, ou 60%), não a média das porcentagens de cada chamada (70%)
        self.assertEqual(resumir(linhas), {
            'regras': {'pct_encontrados': 50.0, 'pct_corretos': 30.0, 'pct_valores_certos': 60.0, 'pct_prazo_correto': 50.0, 'tempo_medio_ms': 200, 'chamadas': 2},
            'ia': {'pct_encontrados': 100.0, 'pct_corretos': 90.0, 'pct_valores_certos': 100.0, 'pct_prazo_correto': 100.0, 'tempo_medio_ms': 20000, 'chamadas': 1},
            'falhas_ia': [{'arquivo': 'b.pdf', 'avisos': [queda]}],
        })
        self.assertEqual(resumir(linhas[:2])['ia'], None)  # sem chave, só a linha de regras

    def test_custo_segue_a_tabela_do_haiku_pelo_tamanho_do_prompt(self):
        self.assertAlmostEqual(custo_usd(100_000, 10_000), 0.015)  # até 100 mil tokens: US$ 0,10 e 0,50 por milhão
        self.assertAlmostEqual(custo_usd(200_000, 10_000), 0.125)  # acima: US$ 0,50 e 2,50 por milhão

    def test_cliente_que_mede_repassa_o_pedido_e_guarda_os_tokens(self):
        falso, usos = falso_que_devolve(CHAMADA_OK), []
        resultado = extrair_chamada({'pdf_base64': PDF_B64}, cliente=cliente_que_mede(falso, usos))
        self.assertEqual(resultado['origem'], 'ia')
        self.assertEqual(falso.opcoes, {'timeout': 90, 'max_retries': 0})
        self.assertEqual([(uso.input_tokens, uso.output_tokens) for uso in usos], [(1, 1)])


class TestRodar(unittest.TestCase):
    def avalia(self, prazo='2025-04-09', municipio='São Borja', uf='RS', gabarito=None):
        gabarito = gabarito or {'municipio': 'São Borja', 'uf': 'RS', 'prazo_envio': '2025-04-09', 'itens': [SUCO]}
        chamada = {'itens': [SUCO], 'prazo_envio': prazo, 'municipio': municipio, 'uf': uf}
        return avaliar('a.pdf', 'ia', {'origem': 'ia', 'duracao_ms': 7, 'avisos': ['aviso'], 'chamada': chamada}, gabarito)

    def test_avaliar_monta_a_linha_do_resultado(self):
        self.assertEqual(self.avalia(municipio='SAO BORJA'), {
            'arquivo': 'a.pdf', 'modo': 'ia', 'origem': 'ia',
            'total_gabarito': 1, 'encontrados': 1, 'corretos': 1, 'valores_certos': 1,
            'prazo_envio': '2025-04-09', 'prazo_gabarito': '2025-04-09', 'prazo_correto': True,
            'municipio_uf': ['SAO BORJA', 'RS'], 'municipio_uf_correto': True,  # acento e caixa não contam
            'duracao_ms': 7, 'avisos': ['aviso'], 'itens': [SUCO],
        })

    def test_prazo_correto_so_com_a_mesma_data_do_gabarito(self):
        self.assertFalse(self.avalia(prazo='2025-04-10')['prazo_correto'])  # outra data
        self.assertFalse(self.avalia(prazo=None)['prazo_correto'])  # nenhum prazo lido

    def test_municipio_e_uf_precisam_bater_os_dois(self):
        self.assertFalse(self.avalia(municipio='Santiago')['municipio_uf_correto'])  # UF certa, município errado
        self.assertFalse(self.avalia(uf='SC')['municipio_uf_correto'])  # município certo, UF errada
        self.assertFalse(self.avalia(municipio=None)['municipio_uf_correto'])  # nenhum município lido
        # órgão estadual: o gabarito não tem município, e quem lê "Salvador" leu a sede
        estadual = {'municipio': None, 'uf': 'BA', 'prazo_envio': '2026-02-20', 'itens': [SUCO]}
        self.assertTrue(self.avalia(municipio=None, uf='BA', gabarito=estadual)['municipio_uf_correto'])
        self.assertFalse(self.avalia(municipio='Salvador', uf='BA', gabarito=estadual)['municipio_uf_correto'])

    def test_tokens_usa_o_uso_da_ultima_resposta_e_calcula_o_custo(self):
        def uso(entrada, saida):
            return SimpleNamespace(input_tokens=entrada, output_tokens=saida)
        self.assertEqual(tokens([uso(1, 1), uso(200_000, 10_000)]),
                         {'tokens_entrada': 200_000, 'tokens_saida': 10_000, 'custo_usd': 0.125})
        # sem resposta (tempo esgotado ou erro da API) não há uso informado
        self.assertEqual(tokens([]), {'tokens_entrada': None, 'tokens_saida': None, 'custo_usd': None})

    def test_markdown_traz_a_legenda_as_duas_tabelas_e_os_numeros_em_portugues(self):
        base = {'prazo_envio': '2025-04-09', 'prazo_gabarito': '2025-04-09', 'municipio_uf_correto': True}
        queda = 'IA indisponível (tempo esgotado); usei o modo de regras'
        linhas = [{**linha('a.pdf', 'regras', 'regras', 10, 8, 6, 9, True, 1500), **base},
                  {**linha('a.pdf', 'ia', 'ia', 10, 10, 9, 10, True, 27640), **base,
                   'tokens_entrada': 526217, 'tokens_saida': 4854, 'custo_usd': 0.275243},
                  {**linha('b.pdf', 'ia', 'regras', 30, 12, 6, 15, False, 90500, [queda]), **base,
                   'prazo_envio': None, 'municipio_uf_correto': False, 'tokens_entrada': None}]
        texto = markdown(resumir(linhas), linhas, 0.2752, 'claude-haiku-5-5', '2025-03-14')
        linhas_do_texto = texto.splitlines()
        self.assertEqual(linhas_do_texto[0], '# Avaliação da leitura da chamada (14/03/2025)')  # a data da medição, não a de hoje
        legenda = [texto_da_linha for texto_da_linha in linhas_do_texto if texto_da_linha.startswith('- "Encontrado')]
        self.assertEqual(len(legenda), 2)  # duas linhas: o que é encontrado e correto, e o que a medida não vê
        self.assertIn('"Correto": encontrado, com a mesma quantidade e o preço diferente em no máximo R$ 0,01', legenda[0])
        self.assertIn('é um piso', legenda[1])
        self.assertIn('"Quantidade e preço certos" não olha o nome', legenda[1])
        for esperada in [
            '| Modo | Chamadas | Itens encontrados | Itens corretos | Quantidade e preço certos | Prazo correto | Tempo médio |',
            '| regras | 1 | 80,0% | 60,0% | 90,0% | 100,0% | 1,5 s |',
            '| ia | 1 | 100,0% | 90,0% | 100,0% | 100,0% | 27,6 s |',
            f'- b.pdf: {queda}',
            '| Chamada | Modo | Itens no gabarito | Encontrados | Corretos | Quantidade e preço certos | Prazo lido '
            '| Prazo do gabarito | Município/UF certo | Tempo | Tokens (entrada / saída) | Custo (US$) |',
            '| a.pdf | regras | 10 | 8 | 6 | 9 | 2025-04-09 | 2025-04-09 | sim | 1,5 s | - | - |',
            '| a.pdf | ia | 10 | 10 | 9 | 10 | 2025-04-09 | 2025-04-09 | sim | 27,6 s | 526.217 / 4.854 | 0,2752 |',
            '| b.pdf | ia (caiu para regras) | 30 | 12 | 6 | 15 | - | 2025-04-09 | não | 90,5 s | - | - |',
            'Custo total da IA (claude-haiku-5-5): US$ 0,2752.',
        ]:
            self.assertIn(esperada, linhas_do_texto)
        # sem chave não há linha da IA nem custo
        so_regras = markdown(resumir(linhas[:1]), linhas[:1], 0.0, None, '2025-03-14')
        self.assertNotIn('| ia |', so_regras)
        self.assertNotIn('Custo total da IA', so_regras)


class TestRecontar(unittest.TestCase):
    GRAVADOS = rodar.PASTA / 'resultados'

    def test_recontar_refaz_as_metricas_dos_itens_guardados_sem_chamar_a_api(self):
        salvo = json.loads((self.GRAVADOS / 'resultados.json').read_text(encoding='utf-8'))
        for gravada in salvo['linhas']:  # estraga o que dá para refazer: a recontagem tem de recalcular tudo isso
            gravada.update(total_gabarito=0, encontrados=0, corretos=0, valores_certos=0, prazo_gabarito=None,
                           prazo_correto=None, municipio_uf_correto=None)
        salvo['resumo'] = salvo['custo_total_usd'] = None
        with tempfile.TemporaryDirectory() as pasta, \
                mock.patch.object(rodar, 'extrair_chamada', side_effect=AssertionError('leu um PDF')), \
                mock.patch.object(rodar, 'criar_cliente_claude', side_effect=AssertionError('criou o cliente')):
            pasta = Path(pasta)
            (pasta / 'resultados.json').write_text(json.dumps(salvo), encoding='utf-8')
            texto = recontar(pasta)
            # os resultados gravados no repositório são a recontagem de si mesmos: nada mudou, nem a data da medição
            for arquivo in ('resultados.json', 'resultados.md'):
                self.assertEqual((pasta / arquivo).read_text(encoding='utf-8'),
                                 (self.GRAVADOS / arquivo).read_text(encoding='utf-8'), arquivo)
        self.assertEqual(texto, (self.GRAVADOS / 'resultados.md').read_text(encoding='utf-8'))

    def test_a_opcao_recontar_nao_cria_cliente_e_opcao_desconhecida_nao_roda_nada(self):
        with mock.patch.object(rodar, 'recontar', return_value='tabelas') as recontagem, \
                mock.patch.object(rodar, 'criar_cliente_claude', side_effect=AssertionError('criou o cliente')), \
                contextlib.redirect_stdout(io.StringIO()) as saida:
            rodar.main(['--recontar'])
        recontagem.assert_called_once_with()
        self.assertEqual(saida.getvalue(), 'tabelas\n')
        # um erro de digitação na opção não pode cair no modo pago
        with mock.patch.object(rodar, 'criar_cliente_claude', side_effect=AssertionError('criou o cliente')), \
                contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            rodar.main(['--recontra'])
