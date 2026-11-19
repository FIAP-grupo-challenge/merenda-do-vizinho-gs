import re


def converter_numero_br(texto: str) -> float | None:
    """Primeiro número do texto, no formato brasileiro: '1.200' -> 1200, '1.200,50' -> 1200.5, 'R$ 5,40' -> 5.4."""
    casa = re.search(r'\d[\d.,]*', texto)
    if not casa:
        return None
    numero = casa.group().rstrip('.,')  # pontuação de fim de frase, como em 'são 30.'
    numero = re.sub(r'\.(?=\d{3}(?!\d))', '', numero)  # ponto seguido de exatamente 3 dígitos separa o milhar
    try:
        return float(numero.replace(',', '.'))
    except ValueError:  # sobrou mais de um separador decimal, como em '1,200.50'
        return None
