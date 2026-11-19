import re

# Dados do agricultor que nunca vão para a IA: identificação, contato, banco e critérios do RITS
# (origem étnica é dado sensível, LGPD art. 5º, II). O edital é documento público e fica de fora.
# Casa pelo nome exato da chave: 'contato' (da chamada) não é 'conta'.
CHAVES_PROIBIDAS = {
    'nome', 'cpf', 'caf', 'nis',
    'email', 'e_mail', 'telefone', 'celular', 'endereco',
    'banco', 'agencia', 'conta', 'conta_bancaria', 'pix',
    'grupo_prioritario', 'mulher_titular', 'jovem', 'assentado', 'indigena', 'quilombola',
}


def contem_dados_pessoais(obj) -> list[str]:
    """Chaves proibidas achadas em qualquer nível do JSON, sem repetir e em ordem alfabética."""
    if isinstance(obj, dict):
        achadas, filhos = [chave for chave in obj if chave in CHAVES_PROIBIDAS], obj.values()
    elif isinstance(obj, list):
        achadas, filhos = [], obj
    else:
        return []
    for filho in filhos:
        achadas += contem_dados_pessoais(filho)
    return sorted(set(achadas))


def tem_cpf_no_texto(texto: str) -> bool:
    """True quando há 11 dígitos no formato de CPF, com ou sem pontos e traço (para o chat do assistente)."""
    return re.search(r'(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)', texto) is not None
