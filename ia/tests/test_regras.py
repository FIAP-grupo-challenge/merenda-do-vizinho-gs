import base64
import io
import time
import unittest
from pathlib import Path

import pypdf

from ia.extrair.regras import extrair_por_regras
from ia.extrair.servico import extrair_chamada
from ia.extrair.texto_pdf import texto_do_pdf
from ia.numeros import converter_numero_br
from ia.privacidade import contem_dados_pessoais, dados_pessoais_no_texto, tem_cpf_no_texto

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

    def test_nome_da_prefeitura_com_espacos_demais_e_lido_em_tempo_linear(self):
        # o texto vem do PDF de quem sobe a chamada: 16 mil espaços no nome levavam quase 1 s, e o tempo crescia com o quadrado
        for texto in ('Prefeitura Municipal de Catalão' + ' ' * 100_000 + 'x', 'Prefeitura Municipal de Catalão' + '\t' * 100_000 + 'x',
                      'Prefeitura Municipal de' + ' ' * 100_000 + ',', 'Prefeitura Municipal de' + ' ' * 100_000):
            with self.subTest(texto=texto[:35]):
                inicio = time.perf_counter()
                extrair_por_regras(texto)
                self.assertLess(time.perf_counter() - inicio, 0.5)
        # o nome e a UF saem como antes, mesmo com a sequência longa de espaços no meio do texto
        c = extrair_por_regras('Prefeitura Municipal de Santos Dumont' + ' ' * 100_000 + '- MG, Chamada Pública nº 001/2025')
        self.assertEqual((c['municipio'], c['uf'], c['numero']), ('Santos Dumont', 'MG', '001/2025'))

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
        self.assertTrue(tem_cpf_no_texto('529 982 247 25')); self.assertTrue(tem_cpf_no_texto('529.982.247 25'))
        self.assertFalse(tem_cpf_no_texto('1.200 kg a R$ 5,40')); self.assertFalse(tem_cpf_no_texto('1200 3000'))

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


# Resposta do Haiku 5.5 na chamada real da T4 (o app reenvia as respostas do assistente na conversa)
RESPOSTA_REAL_DA_IA = (
    'Com 50 pés de alface por semana e 40 semanas de entrega, você pode oferecer 2.000 pç de alface, dentro do pedido '
    'de 2.280 pç da chamada. Pelo seu perfil, também dá para oferecer 1.600 kg de mandioca, com 40 kg por semana, bem '
    'abaixo dos 2.800 kg pedidos. A chamada não informa o período exato de entrega, então não sei em quais meses ela '
    'deve acontecer. Até 30/07/2026 você precisa enviar o projeto de venda assinado, comprovante de CPF, extrato do '
    'CAF PF ativo emitido até 60 dias antes da entrega, declaração de que os alimentos são de produção própria e '
    'documentos higiênico-sanitários. Se quiser outra quantidade por semana, me diga que eu recalculo.\n\n'
    'Vale o texto da chamada. Confirme com a prefeitura ou com a assistência técnica (Emater).'
)

# (texto do chat, dados pessoais achados): os casos que passam, com a lista vazia, ficam ao lado dos que são barrados
CASOS_DO_TEXTO_DO_CHAT = [
    # e-mail
    ('Sou o João da Silva, meu e-mail é joao.silva@gmail.com e meu zap é (64) 99999-8888. Consigo 30 kg por semana',
     ['email', 'telefone']),
    ('joao_silva+merenda@fazenda.com.br', ['email']),
    ('JOÃO@GMAIL.COM', ['email']),
    ('preço @ 5,40 e 30kg@5.40', []),  # arroba de preço não é e-mail: falta o domínio com final em letras
    # telefone: com e sem DDD, com e sem parênteses, espaço, traço e ponto, de 10 e de 11 dígitos
    ('(64) 99999-8888', ['telefone']),
    ('64 99999-8888', ['telefone']),
    ('99999-8888', ['telefone']),
    ('99999 8888', ['telefone']),
    ('(64)999998888', ['telefone']),
    ('64.99999.8888', ['telefone']),
    ('64 9 9999-8888', ['telefone']),
    ('+55 (64) 99999-8888', ['telefone']),
    ('5564999998888', ['telefone']),
    ('(64) 3441-5555', ['telefone']),  # fixo, 10 dígitos
    ('6434415555', ['telefone']),
    ('64999998888', ['cpf', 'telefone']),  # 11 dígitos seguidos: tanto pode ser um CPF quanto um celular
    # CPF
    ('529.982.247-25', ['cpf']),
    ('52998224725', ['cpf']),
    ('529 982 247 25', ['cpf']),
    ('meu cpf é 529.982.247 25', ['cpf']),
    # dados bancários: a palavra do banco seguida do número
    ('agência 1234 conta 56789-0', ['banco']),
    ('AGENCIA: 1234-5', ['banco']),
    ('Ag. 1234', ['banco']),  # a abreviação sozinha
    ('CC: 56789-0', ['banco']),
    ('conta corrente 123456-7', ['banco']),
    ('minha conta é 56789-0', ['banco']),
    ('pix 12345678000199', ['banco']),
    ('minha chave pix é 12345678000199', ['banco']),
    ('minha chave pix e 12345678000199', ['banco']),  # sem o acento
    # quantidades, preços, datas e a fala do próprio assistente passam
    ('1200', []),
    ('1.200 kg', []),
    ('30 kg por semana', []),
    ('R$ 5,40', []),
    ('1200 3000', []),
    ('2026', []),
    ('consigo 30 kg por semana de alface', []),
    ('1.200,50 kg a R$ 5,40; 12 dz de ovos a 38,16', []),
    ('1200-3000 kg', []),
    ('2000-3000 kg e 2500 3000', []),  # parece telefone fixo, mas falta o DDD
    ('entre 1500 e 2000 kg', []),
    ('30 40 50 60 70', []),
    ('até 20/03/2026 ou 20-03-2026', []),
    ('CEP 75.701-050', []),
    ('dou conta de 5 kg de mandioca', []),  # 'conta' sem número de conta
    ('dou conta de 1200 kg de alface', []),
    ('a conta é 1200 kg; fiz a conta: 1.200 kg', []),
    ('recebo por pix', []),  # a palavra sozinha não é dado
    ('assistência técnica (Emater)', []),
    (RESPOSTA_REAL_DA_IA, []),
]


class TestTextoDoChat(unittest.TestCase):
    def test_acha_email_telefone_cpf_e_dados_bancarios_e_deixa_passar_quantidade_e_preco(self):
        for texto, achados in CASOS_DO_TEXTO_DO_CHAT:
            with self.subTest(texto=texto[:60]):
                self.assertEqual(dados_pessoais_no_texto(texto), achados)

    def test_a_chamada_real_so_tem_o_telefone_e_o_email_da_prefeitura(self):
        # um edital cheio de quantidades, preços, CEP e datas: nada além do contato do órgão (que é público) é achado
        linhas = texto_do_pdf(PDF_REAL.read_bytes()).splitlines()
        achados = {campo for i in range(len(linhas)) for campo in dados_pessoais_no_texto(' '.join(linhas[i:i + 3]))}
        self.assertEqual(achados, {'email', 'telefone'})

    def test_texto_grande_e_lido_em_tempo_linear(self):
        # o texto vem de fora: um prefixo sem limite antes do '@' levaria minutos num texto de 256 KB
        for texto in ('a' * 100_000, '1' * 100_000, 'a.' * 50_000, 'conta ' * 20_000, '64 ' * 30_000, 'a@' * 50_000):
            with self.subTest(texto=texto[:8]):
                inicio = time.perf_counter()
                dados_pessoais_no_texto(texto)
                self.assertLess(time.perf_counter() - inicio, 1)
