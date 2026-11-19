"""JSON Schema da chamada (o formato da T2), para a saída estruturada do Claude.

A API recusa com 400 mais de 16 campos com união de tipos (anyOf) num pedido. Por isso só aceita null o campo
que um edital pode não trazer: órgão, produto e unidade todo edital tem. O produto_id vem sempre null porque
quem o preenche é o catálogo (identificar_produto), nunca o modelo.
"""

TEXTO = {'type': 'string'}
TEXTO_OU_NULO = {'anyOf': [TEXTO, {'type': 'null'}]}
NUMERO_OU_NULO = {'anyOf': [{'type': 'number'}, {'type': 'null'}]}
DATA_OU_NULO = {'anyOf': [{'type': 'string', 'format': 'date'}, {'type': 'null'}]}  # AAAA-MM-DD

# Igual, palavra por palavra, à linha de data_publicacao em prompts/extrair-chamada.md (um teste confere). O campo
# decide o prazo mínimo de 20 dias e a versão da regra: a data de assinatura do edital não serve, vale o início do
# recebimento dos projetos de venda.
DEFINICAO_DATA_PUBLICACAO = (
    'a data em que o edital abre o recebimento dos projetos de venda (início do período de recebimento) e, '
    'se o edital não disser esse início, a data de publicação que o próprio edital declara; '
    'data de assinatura, de portaria ou de homologação NÃO vale; se nada disso estiver escrito, null.'
)


def _objeto(campos: dict) -> dict:
    # a saída estruturada exige additionalProperties false; todo campo é obrigatório e o ausente vem null ou []
    return {'type': 'object', 'properties': campos, 'required': list(campos), 'additionalProperties': False}


ESQUEMA_ITEM = _objeto({
    'produto': TEXTO,
    'produto_id': {'type': 'null'},
    'unidade': TEXTO,
    'quantidade': NUMERO_OU_NULO,
    'preco_unitario': NUMERO_OU_NULO,
    'valor_total': NUMERO_OU_NULO,
    'entrega': TEXTO_OU_NULO,
    'observacoes': TEXTO_OU_NULO,
})

ESQUEMA_CHAMADA = _objeto({
    'numero': TEXTO_OU_NULO,
    'orgao': TEXTO,
    'municipio': TEXTO_OU_NULO,
    'uf': TEXTO_OU_NULO,
    'data_publicacao': {**DATA_OU_NULO, 'description': DEFINICAO_DATA_PUBLICACAO},
    'prazo_envio': DATA_OU_NULO,
    'periodo_fornecimento': TEXTO_OU_NULO,
    'semanas_fornecimento': {'anyOf': [{'type': 'integer'}, {'type': 'null'}]},
    'local_entrega': TEXTO_OU_NULO,
    'documentos_exigidos': {'type': 'array', 'items': TEXTO},
    'criterios_prioridade': {'type': 'array', 'items': TEXTO},
    'contato': TEXTO_OU_NULO,
    'itens': {'type': 'array', 'items': ESQUEMA_ITEM},
})
