import base64
import io
import unittest
from pathlib import Path

import pypdf

from ia.extrair.regras import extrair_por_regras
from ia.extrair.servico import extrair_chamada
from ia.extrair.texto_pdf import texto_do_pdf
from ia.numeros import converter_numero_br
from ia.privacidade import contem_dados_pessoais, tem_cpf_no_texto

FIXTURES = Path(__file__).parent / 'fixtures'
FIXTURE = FIXTURES / 'chamada-exemplo.txt'
PDF_REAL = FIXTURES / 'chamada-real.pdf'

# Os 16 itens do edital de Catalão (04-go-catalao-2026.pdf, item 1.1), conferidos no PDF:
# produto, produto_id, unidade, quantidade e preço unitário.
ITENS_CATALAO = [
    ('Abóbora Cabotiá', 'abobora', 'unidade', 390, 7.00),
    ('Abóbora verde', 'abobora', 'kg', 1640, 6.87),
    ('Alface', 'alface', 'pç', 2280, 7.03),
    ('Alho', 'alho', 'kg', 1276, 38.16),
    ('Batata Inglesa', 'batata-inglesa', 'kg', 5218, 6.04),
    ('Brócolis', 'brocolis', 'pç', 300, 12.74),
    ('Cebola', 'cebola', 'kg', 7540, 7.05),
    ('Cheiro verde', 'cheiro-verde', 'fx', 2210, 8.10),
    ('Couve', 'couve', 'pç', 1269, 7.37),
    ('Couve- flor', 'couve-flor', 'un', 300, 15.44),
    ('Mandioca', 'mandioca', 'kg', 2800, 11.71),
    ('Milho', 'milho-verde', 'atilho', 1056, 7.69),
    ('Pepino Branco', 'pepino', 'kg', 1502, 9.25),
    ('Tomate', 'tomate', 'kg', 1768, 12.04),
    ('Pão Enriquecido', 'pao-caseiro', 'kg', 6350, 48.84),
    ('Biscoito de Queijo', 'biscoito-caseiro', 'kg', 5800, 50.09),
]


class TestRegras(unittest.TestCase):
    def test_converter_numero_br(self):
        self.assertEqual(converter_numero_br('1.200'), 1200)
        self.assertEqual(converter_numero_br('1.200,50'), 1200.5)
        self.assertEqual(converter_numero_br('R$ 5,40'), 5.4)
        self.assertIsNone(converter_numero_br('abc'))

    def test_regras_extraem_itens_da_chamada_de_exemplo(self):
        c = extrair_por_regras(FIXTURE.read_text(encoding='utf-8'))
        self.assertEqual(len(c['itens']), 5)
        alface = next(i for i in c['itens'] if i['produto_id'] == 'alface')
        self.assertEqual((alface['unidade'], alface['quantidade'], alface['preco_unitario']), ('kg', 1200, 5.4))
        self.assertEqual(next(i for i in c['itens'] if i['produto_id'] == 'ovo')['unidade'], 'dz')
        self.assertEqual((c['municipio'], c['uf'], c['prazo_envio']), ('Vale Verde', 'SP', '2026-03-20'))

    def test_acentos_decompostos_nao_derrubam_itens(self):
        # 'Pç' também chega como 'c' + U+0327 (cedilha solta), comum em texto copiado de PDF e de Word
        texto = ('Alface Pc\u0327 2.280 7,03 16.028,40\nCheiro verde Mac\u0327o 100 2,00 200,00\n'
                 'Ovos du\u0301zia 600 12,00 7.200,00')
        itens = extrair_por_regras(texto)['itens']
        self.assertEqual([(i['produto_id'], i['unidade']) for i in itens],
                         [('alface', 'pç'), ('cheiro-verde', 'maço'), ('ovo', 'dúzia')])

    def test_texto_sem_tabela_devolve_itens_vazios_e_aviso(self):
        r = extrair_chamada({'texto': 'Edital sem tabela de itens.'})
        self.assertEqual(r['origem'], 'regras'); self.assertEqual(r['chamada']['itens'], [])
        self.assertTrue(any('tabela' in a for a in r['avisos']))

    def test_texto_do_pdf_le_chamada_real(self):
        self.assertIn('chamada', texto_do_pdf(PDF_REAL.read_bytes()).lower())

    def test_contem_dados_pessoais_acha_chaves_em_qualquer_nivel(self):
        self.assertEqual(contem_dados_pessoais({'perfil': {'cpf': '1', 'produtos': []}}), ['cpf'])

    def test_tem_cpf_no_texto(self):
        self.assertTrue(tem_cpf_no_texto('meu cpf é 529.982.247-25')); self.assertTrue(tem_cpf_no_texto('52998224725'))
        self.assertFalse(tem_cpf_no_texto('1.200 kg a R$ 5,40'))

    def test_regras_leem_os_16_itens_da_chamada_real_de_catalao(self):
        r = extrair_chamada({'pdf_base64': base64.b64encode(PDF_REAL.read_bytes()).decode()})
        c = r['chamada']
        self.assertEqual((r['origem'], r['modelo'], r['avisos']), ('regras', None, []))
        self.assertIsInstance(r['duracao_ms'], int)
        self.assertEqual(
            (c['numero'], c['municipio'], c['uf'], c['prazo_envio']), ('003/2026', 'Catalão', 'GO', '2026-07-30')
        )
        campos = ('produto', 'produto_id', 'unidade', 'quantidade', 'preco_unitario')
        self.assertEqual([tuple(item[campo] for campo in campos) for item in c['itens']], ITENS_CATALAO)
        self.assertEqual(c['itens'][2]['valor_total'], 16028.40)

    def test_pdf_sem_texto_avisa_que_talvez_seja_escaneado(self):
        escritor = pypdf.PdfWriter()
        escritor.add_blank_page(width=200, height=200)
        pdf = io.BytesIO()
        escritor.write(pdf)
        r = extrair_chamada({'pdf_base64': base64.b64encode(pdf.getvalue()).decode()})
        self.assertEqual(r['chamada']['itens'], [])
        self.assertIn('PDF sem texto (talvez escaneado)', r['avisos'])

    def test_chamada_real_nao_tem_cpf_nem_falso_positivo(self):
        # telefone, CEP e valores em reais do edital não podem parecer CPF
        self.assertFalse(tem_cpf_no_texto(texto_do_pdf(PDF_REAL.read_bytes())))


class TestPrivacidade(unittest.TestCase):
    def test_acha_dados_de_identificacao(self):
        self.assertEqual(
            contem_dados_pessoais({'perfil': {'nome': 'Ana', 'caf': '123', 'nis': '9', 'uf': 'GO'}}),
            ['caf', 'nis', 'nome'],
        )

    def test_acha_dados_de_contato(self):
        corpo = {'mensagens': [{'texto': 'oi', 'email': 'a@b.c'}], 'perfil': {'celular': '1', 'endereco': 'Rua A'}}
        self.assertEqual(contem_dados_pessoais(corpo), ['celular', 'email', 'endereco'])

    def test_acha_dados_bancarios(self):
        corpo = {'pagamento': {'banco': '001', 'agencia': '1', 'conta': '2', 'pix': 'x'}}
        self.assertEqual(contem_dados_pessoais(corpo), ['agencia', 'banco', 'conta', 'pix'])

    def test_acha_criterios_do_rits(self):
        perfil = {'grupo_prioritario': 'indigena', 'mulher_titular': True, 'jovem': False,
                  'produtos': [{'produto_id': 'alface', 'quilombola': True}]}
        self.assertEqual(
            contem_dados_pessoais({'perfil': perfil}), ['grupo_prioritario', 'jovem', 'mulher_titular', 'quilombola']
        )

    def test_contato_da_chamada_nao_e_conta(self):
        corpo = {'chamada': {'contato': 'Secretaria Municipal de Educação', 'itens': []},
                 'perfil': {'municipio': 'Catalão', 'uf': 'GO', 'prioridade_rits': True}}
        self.assertEqual(contem_dados_pessoais(corpo), [])
