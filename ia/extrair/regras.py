"""Modo de regras: lê a chamada sem IA, por heurística de tabela. É também a queda quando a IA falha."""
import re
from datetime import date

from ia.catalogo import identificar_produto
from ia.numeros import converter_numero_br

# Uma linha de item é uma unidade conhecida seguida de 2 ou 3 números: quantidade, preço unitário e valor total.
# O IGNORECASE e as classes [cç] e [uú] comparam sem diferenciar maiúsculas e acentos ('Pç' no edital de Catalão).
UNIDADES = r'kg|g|l|litro|un|unid|unidade|ma[cç]o|dz|d[uú]zia|pct|pacote|bandeja|cx|p[cç]|pe[cç]a|fx|feixe|atilho'
NUMERO = r'(?:R\$\s*)?\d[\d.]*(?:,\d+)?'
LINHA_ITEM = re.compile(rf'^(.*?)\b({UNIDADES})\.?\s+({NUMERO}(?:\s+{NUMERO}){{1,2}})\s*$', re.IGNORECASE)
NUMERO_DO_ITEM = re.compile(r'\s*\d{1,3}\b')
PREFEITURA = re.compile(r'(?i:prefeitura municipal de)\s+([^\n,.;]+?)(?:\s*[-–/]\s*([A-Z]{2})\b|\s*(?:[\n,.;]|$))')
NUMERO_CHAMADA = re.compile(r'(?i:chamada p[uú]blica\s*n[º°o.]*)\s*(\d+/\d{4})')
PRAZO = re.compile(r'(?i:at[eé]\s+(?:o\s+)?(?:dia\s+)?)(\d{1,2})/(\d{1,2})/(\d{4})')


def extrair_por_regras(texto: str) -> dict:
    municipio, uf = _municipio_e_uf(texto)
    numero = NUMERO_CHAMADA.search(texto)
    # o que a heurística não procura fica None ou []: a prefeitura confere e completa o rascunho
    return {
        'numero': numero[1] if numero else None,
        'orgao': f'Prefeitura Municipal de {municipio}' if municipio else None,
        'municipio': municipio,
        'uf': uf,
        'data_publicacao': None,
        'prazo_envio': _prazo(texto),
        'periodo_fornecimento': None,
        'semanas_fornecimento': None,
        'local_entrega': None,
        'documentos_exigidos': [],
        'criterios_prioridade': [],
        'contato': None,
        'itens': _itens(texto.splitlines()),
    }


def _municipio_e_uf(texto):
    casa = PREFEITURA.search(texto)
    if not casa:
        return None, None
    municipio, uf = casa[1], casa[2]
    if not uf:  # 'Prefeitura Municipal de Catalão, Estado de Goiás': a UF sai de 'Catalão - GO', no cabeçalho
        ao_lado = re.search(rf'(?i:{re.escape(municipio)})\s*[-–/]\s*([A-Z]{{2}})\b', texto)
        uf = ao_lado[1] if ao_lado else None
    return (municipio.title() if municipio.isupper() else municipio), uf


def _prazo(texto):
    casa = PRAZO.search(texto)  # 'recebidos até 20/03/2026'; em Catalão, 'no período de 09/07/2026 até 30/07/2026'
    if not casa:
        return None
    try:
        return date(int(casa[3]), int(casa[2]), int(casa[1])).isoformat()
    except ValueError:  # data impossível, como 31/02
        return None


def _itens(linhas):
    itens, inicio_do_item = [], 0
    for i, linha in enumerate(linhas):
        casa = LINHA_ITEM.match(linha)
        if not casa:
            continue
        produto = _nome(casa[1]) or _nome_nas_linhas_de_cima(linhas[inicio_do_item:i])
        quantidade, preco, total = ([converter_numero_br(n) for n in re.findall(NUMERO, casa[3])] + [None])[:3]
        itens.append({
            'produto': produto,
            'produto_id': identificar_produto(produto) if produto else None,
            'unidade': casa[2].lower(),
            'quantidade': quantidade,
            'preco_unitario': preco,
            'valor_total': total,
            'entrega': None,
            'observacoes': None,
        })
        inicio_do_item = i + 1
    return itens


def _nome(texto):
    """'1 Alface crespa ' -> 'Alface crespa'; 'Couve- flor: fresco, de primeira' -> 'Couve- flor'."""
    sem_numero_do_item = re.sub(r'^[\s\d.]+', '', texto)
    return ' '.join(re.split(r':|,|\s[-–]\s', sem_numero_do_item, maxsplit=1)[0].split())


def _nome_nas_linhas_de_cima(linhas):
    """Tabela em várias linhas, como a de Catalão: '3', 'Alface: fresca, ...', a descrição e 'Pç 2.280 R$ 7,03'."""
    for i in reversed(range(len(linhas))):
        if NUMERO_DO_ITEM.match(linhas[i]):
            return next(filter(None, map(_nome, linhas[i:])), None)
    return None
