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


# Texto livre do chat do assistente. O texto vem de fora, então o tempo de cada padrão tem de crescer em linha reta
# com o tamanho dele: o e-mail parte do '@' (um '[\w.]+' antes dele levaria tempo quadrático).
# CPF: 529.982.247-25, 529 982 247 25, 52998224725
_CPF = re.compile(r'(?<!\d)\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-]?\d{2}(?!\d)')
_EMAIL = re.compile(r'(?<=[\w.%+-])@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}')  # o final em letras deixa '30kg@5.40' passar
# DDD de verdade: as dezenas redondas (10, 20, 30...) são quantidade, não telefone.
_DDD = r'(?:1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])'
_CELULAR = r'9[\s.-]?\d{4}[\s.-]?\d{4}'  # 9xxxx-xxxx
_FIXO = r'[2-5]\d{3}[\s.-]?\d{4}'  # xxxx-xxxx, só com DDD: sozinho, '1200-3000' é uma faixa de quantidade
_TELEFONE = re.compile(  # (64) 99999-8888, 64 99999-8888, 99999-8888, 64999998888, +55 64 99999-8888, (64) 3441-5555
    rf'(?<!\d)(?:\+?55[\s.-]*)?(?:(?:\(\s*{_DDD}\s*\)|{_DDD})[\s.-]*(?:{_CELULAR}|{_FIXO})|{_CELULAR})(?!\d)')
# Palavra do banco e, logo depois, o número: 'agência 1234', 'conta 56789-0', 'pix 12345678000199'. Conta e pix pedem
# 5 dígitos (ou o dígito verificador com hífen): 'dou conta de 1200 kg' e 'a conta é 1200 kg' são quantidade.
_SEPARADOR = r'(?:\W|é|e|n[º°]|n[uú]mero){0,5}'  # ': ', ' é ', ' e ', ' nº '
_BANCO = re.compile(
    rf'\b(?:ag[eê]ncia|ag){_SEPARADOR}\d{{4}}'
    rf'|\b(?:conta(?:[\s-]+(?:corrente|poupan[cç]a))?|c/?c|pix){_SEPARADOR}(?:\d{{5}}|\d{{3,}}-\d)',
    re.IGNORECASE)


def tem_cpf_no_texto(texto: str) -> bool:
    """True quando há 11 dígitos no formato de CPF, com ou sem pontos, traços e espaços."""
    return _CPF.search(texto) is not None


def dados_pessoais_no_texto(texto: str) -> list[str]:
    """O que o texto livre do chat tem de dado pessoal, sem repetir e em ordem alfabética: 'banco', 'cpf', 'email' e
    'telefone'. Nome não dá para achar: isso fica com o aviso da tela. Onze dígitos seguidos valem como CPF e,
    se começam por um DDD e um 9, também como telefone."""
    padroes = {'banco': _BANCO, 'cpf': _CPF, 'email': _EMAIL, 'telefone': _TELEFONE}
    return sorted(campo for campo, padrao in padroes.items() if padrao.search(texto))
