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
