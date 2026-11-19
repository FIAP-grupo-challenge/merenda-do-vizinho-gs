"""Roteiro do assistente sem IA: regras se-então sobre a chamada já extraída. É também a queda quando a IA falha."""
import json
from pathlib import Path

from ia.catalogo import identificar_produto
from ia.numeros import converter_numero_br

REGRAS_PNAE = Path(__file__).resolve().parents[2] / 'compartilhado' / 'regras-pnae.json'
# 200 dias letivos ÷ 5 dias da semana (LDB, art. 24, I): o mesmo padrão das contas do app (T7)
SEMANAS_PADRAO = json.loads(REGRAS_PNAE.read_text(encoding='utf-8'))['semanas_padrao']

# Habilitação do fornecedor individual (CAF PF, fora de grupo): Res. CD/FNDE 4/2026, art. 35, redação da
# Res. 17/2026 (fatos-pnae.md, seção 2c). A prefeitura só pode exigir estes; valem quando a chamada não traz a lista.
DOCUMENTOS_FORNECEDOR_INDIVIDUAL = [
    'Comprovante de CPF.',
    'Extrato do CAF PF ativo, emitido até 60 dias antes da entrega dos documentos.',
    'Projeto de venda assinado.',
    'Declaração de que os alimentos são de produção própria.',
    'Documentos higiênico-sanitários do alimento (arts. 40 a 42).',
]


def semanas_de_entrega(chamada: dict) -> float:
    semanas = chamada.get('semanas_fornecimento')
    return SEMANAS_PADRAO if semanas is None else semanas


def checklist(chamada: dict) -> list[str]:
    return list(chamada.get('documentos_exigidos') or DOCUMENTOS_FORNECEDOR_INDIVIDUAL)


def itens_compativeis(chamada: dict, perfil: dict) -> list[dict]:
    """Itens da chamada que o agricultor produz e que têm quantidade pedida, na ordem do edital (como na T7)."""
    meus = {produto.get('produto_id') for produto in perfil['produtos']} - {None}
    return [item for item in chamada['itens'] if item.get('produto_id') in meus and item.get('quantidade')]


def responder_por_roteiro(chamada: dict, perfil: dict, mensagens: list[dict]) -> dict:
    """Primeira resposta: prazo, itens compatíveis e a pergunta da quantidade por semana. Depois: o número da
    última mensagem do agricultor é a quantidade por semana de um item, e a sugestão, min(número × semanas, pedido)."""
    compativeis = itens_compativeis(chamada, perfil)
    do_agricultor = [mensagem['texto'] for mensagem in mensagens if mensagem['papel'] == 'agricultor']
    itens = []
    if not compativeis:
        texto = 'Esta chamada não pede nenhum dos produtos do seu cadastro.'
    elif not do_agricultor:
        pedidos = ', '.join(f"{item['produto']} ({_br(item['quantidade'])} {item['unidade']})" for item in compativeis)
        texto = f'{_prazo(chamada)} A chamada pede o que você produz: {pedidos}. {_pergunta(compativeis[0])}'
    else:
        ultima = do_agricultor[-1]
        numero = converter_numero_br(ultima)
        # shortcut: um produto por mensagem (com dois, vale o nome mais longo do catálogo); ler pares número e
        # produto quando o roteiro precisar de várias quantidades na mesma mensagem
        citado = identificar_produto(ultima)
        item = next((item for item in compativeis if item['produto_id'] == citado), compativeis[0])
        if not numero:
            texto = f'Não achei o número na sua mensagem. {_pergunta(item)}'
        else:
            semanas, unidade = semanas_de_entrega(chamada), item['unidade']
            total = round(numero * semanas, 2)
            quantidade = min(total, item['quantidade'])
            itens = [{'produto_id': item['produto_id'], 'quantidade': quantidade}]
            texto = (f"Com {_br(numero)} {unidade} por semana, em {_br(semanas)} semanas de entrega, dá {_br(total)} "
                     f"{unidade} de {item['produto']}. A chamada pede {_br(item['quantidade'])} {unidade}. "
                     f'Sugestão: oferecer {_br(quantidade)} {unidade}.')
    return {'origem': 'regras', 'resposta': texto, 'sugestao': {'itens': itens}, 'checklist': checklist(chamada)}


def _prazo(chamada):
    prazo = chamada.get('prazo_envio')  # AAAA-MM-DD, o formato da chamada
    if not prazo:
        return 'A chamada não diz o prazo para entregar o projeto de venda.'
    return f"O prazo para entregar o projeto de venda vai até {'/'.join(reversed(prazo.split('-')))}."


def _pergunta(item):
    return (f"Quanto você consegue entregar por semana de {item['produto']}? "
            f"Responda com o número, em {item['unidade']}.")


def _br(numero) -> str:
    """Número no formato brasileiro, sem zeros à toa: 1200.0 -> '1.200'; 12.5 -> '12,5'."""
    texto = f'{numero:,.2f}'.replace(',', '_').replace('.', ',').replace('_', '.')
    return texto.rstrip('0').rstrip(',')
