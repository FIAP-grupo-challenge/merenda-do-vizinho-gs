import unittest

from ia.catalogo import identificar_produto, listar_produtos, normalizar_texto


class TestCatalogo(unittest.TestCase):
    def test_identifica_produto_por_sinonimo_e_sem_acento(self):
        self.assertEqual(identificar_produto('ALFACE CRESPA, maço'), 'alface')
        self.assertEqual(identificar_produto('Mandioca descascada e congelada'), 'mandioca')
        self.assertEqual(identificar_produto('Ovos de galinha caipira (dúzia)'), 'ovo')
        self.assertEqual(identificar_produto('Banana prata'), 'banana')
        self.assertIsNone(identificar_produto('Parafuso sextavado'))
        self.assertIsNone(identificar_produto('Produto novo'))  # 'ovo' dentro de 'novo' não conta

    def test_normaliza_acentos_e_espacos(self):
        self.assertEqual(normalizar_texto('  Pão   Caseiro '), 'pao caseiro')

    def test_catalogo_tem_ids_obrigatorios_e_sinonimos(self):
        ids = {produto['id'] for produto in listar_produtos()}
        obrigatorios = {'alface', 'banana', 'mandioca', 'ovo', 'tomate', 'laranja', 'mel', 'pao-caseiro'}
        self.assertEqual(obrigatorios - ids, set())
        self.assertEqual(identificar_produto('aipim'), 'mandioca')
        self.assertEqual(identificar_produto('macaxeira'), 'mandioca')
        self.assertEqual(identificar_produto('ovos'), 'ovo')

    def test_identifica_nomes_compostos(self):
        casos = {
            'Batata doce': 'batata-doce',
            'Farinha de mandioca': 'farinha-de-mandioca',
            'Couve-flor': 'couve-flor',
            'Biscoito caseiro de queijo': 'biscoito-caseiro',
            'PAO CASEIRO': 'pao-caseiro',
            'Abóbora': 'abobora',
        }
        for texto, esperado in casos.items():
            with self.subTest(texto=texto):
                self.assertEqual(identificar_produto(texto), esperado)

    def test_hifen_vale_espaco(self):
        for texto in ('Couve- flor', 'couve-flor', 'couve flor'):
            with self.subTest(texto=texto):
                self.assertEqual(identificar_produto(texto), 'couve-flor')

    def test_catalogo_integro(self):
        produtos = listar_produtos()
        ids = [produto['id'] for produto in produtos]
        self.assertEqual(len(ids), len(set(ids)))
        for produto in produtos:
            self.assertEqual(set(produto), {'id', 'nome', 'sinonimos', 'unidade_padrao'})
            for termo in [produto['nome'], *produto['sinonimos']]:
                with self.subTest(termo=termo):
                    self.assertEqual(identificar_produto(termo), produto['id'])

    def test_identifica_os_itens_do_edital_de_catalao(self):
        # nomes como aparecem em 04-go-catalao-2026.pdf, o edital da demonstração
        itens = {
            'Abóbora Cabotiá': 'abobora',
            'Abóbora verde': 'abobora',
            'Alface': 'alface',
            'Alho': 'alho',
            'Batata Inglesa': 'batata-inglesa',
            'Brócolis': 'brocolis',
            'Cebola': 'cebola',
            'Cheiro verde': 'cheiro-verde',
            'Couve': 'couve',
            'Couve- flor': 'couve-flor',
            'Mandioca': 'mandioca',
            'Milho': 'milho-verde',
            'Pepino Branco': 'pepino',
            'Tomate': 'tomate',
            'Pão Enriquecido': 'pao-caseiro',
            'Biscoito de Queijo': 'biscoito-caseiro',
        }
        for nome, esperado in itens.items():
            with self.subTest(nome=nome):
                self.assertEqual(identificar_produto(nome), esperado)
