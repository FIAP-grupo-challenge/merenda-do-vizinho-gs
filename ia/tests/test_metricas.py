import unittest

from ia.avaliacao.metricas import comparar_itens, custo_usd, resumir
from ia.avaliacao.rodar import cliente_que_mede
from ia.extrair.servico import extrair_chamada
from ia.tests.test_extrair_claude import CHAMADA_OK, PDF_B64, falso_que_devolve


def linha(arquivo, modo, origem, total, encontrados, corretos, prazo_correto, duracao_ms, avisos=()):
    return {'arquivo': arquivo, 'modo': modo, 'origem': origem, 'total_gabarito': total, 'encontrados': encontrados,
            'corretos': corretos, 'prazo_correto': prazo_correto, 'duracao_ms': duracao_ms, 'avisos': list(avisos)}


class TestMetricas(unittest.TestCase):
    def test_comparar_itens_conta_encontrados_e_corretos(self):
        gab = [{'produto_id': 'alface', 'quantidade': 1200, 'preco_unitario': 5.4}, {'produto_id': 'mel', 'quantidade': 150, 'preco_unitario': 38.5}]
        ext = [{'produto_id': 'alface', 'quantidade': 1200, 'preco_unitario': 5.405}, {'produto_id': 'mel', 'quantidade': 15, 'preco_unitario': 38.5}]
        self.assertEqual(comparar_itens(ext, gab), {'total_gabarito': 2, 'encontrados': 2, 'corretos': 1})

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

    def test_resumir_conta_so_a_ia_que_respondeu_e_lista_as_quedas(self):
        queda = 'IA indisponível (tempo esgotado); usei o modo de regras'
        linhas = [linha('a.pdf', 'regras', 'regras', 10, 8, 6, True, 100),
                  linha('b.pdf', 'regras', 'regras', 30, 12, 6, False, 300),
                  linha('a.pdf', 'ia', 'ia', 10, 10, 9, True, 20000),
                  linha('b.pdf', 'ia', 'regras', 30, 12, 6, False, 90500, [queda])]
        # porcentagem sobre o total de itens (20 de 40), não a média das porcentagens de cada chamada
        self.assertEqual(resumir(linhas), {
            'regras': {'pct_encontrados': 50.0, 'pct_corretos': 30.0, 'pct_prazo_correto': 50.0, 'tempo_medio_ms': 200, 'chamadas': 2},
            'ia': {'pct_encontrados': 100.0, 'pct_corretos': 90.0, 'pct_prazo_correto': 100.0, 'tempo_medio_ms': 20000, 'chamadas': 1},
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
