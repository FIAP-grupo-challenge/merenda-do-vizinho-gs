"""Etapa gerar-simulado: o histórico que o app ainda não tem, de uma cooperativa fictícia de Catalão (GO), com
25 agricultores, 12 escolas, 12 meses de entregas e uma leitura por hora da câmara fria. Os dados ficam no mesmo
formato da exportação do app. A mesma semente gera sempre os mesmos dados."""

import datetime
import json
import random
from pathlib import Path

CATALOGO = Path(__file__).resolve().parents[2] / 'compartilhado' / 'catalogo-produtos.json'
INICIO = datetime.date(2025, 7, 1)  # 12 meses, de julho de 2025 a junho de 2026: antes dos dados reais do app
DIAS = 365
ESCOLAS = [f'Escola {numero:02d}' for numero in range(1, 13)]
# A cooperativa fictícia vende uma lista fixa: os 43 produtos que o catálogo tinha quando o histórico foi gerado, na
# ordem de então. Com o catálogo inteiro, cada produto novo mudaria o sorteio da semente e os números do guia do painel.
PRODUTOS_SIMULADOS = [
    'alface', 'couve', 'couve-flor', 'repolho', 'cenoura', 'beterraba', 'chuchu', 'abobora', 'abobrinha',
    'quiabo', 'pepino', 'pimentao', 'cebola', 'alho', 'batata-inglesa', 'batata-doce', 'mandioca', 'tomate',
    'cebolinha', 'salsa', 'coentro', 'banana', 'laranja', 'mexerica', 'mamao', 'melancia', 'abacaxi',
    'maracuja', 'goiaba', 'limao', 'manga', 'feijao', 'arroz', 'milho-verde', 'fuba', 'farinha-de-mandioca',
    'pao-caseiro', 'biscoito-caseiro', 'mel', 'ovo', 'leite', 'queijo', 'frango',
]


def gerar_simulado(raw: Path, semente: int = 42) -> Path:
    aleatorio = random.Random(semente)
    catalogo = {produto['id']: produto for produto in json.loads(CATALOGO.read_text(encoding='utf-8'))}
    produtos = [catalogo[id_produto] for id_produto in PRODUTOS_SIMULADOS]  # a unidade_padrao vem do catálogo
    precos = {produto['id']: round(aleatorio.uniform(3, 15), 2) for produto in produtos}  # R$ por unidade_padrao
    agricultores = [
        {'pseudonimo': f'{aleatorio.getrandbits(48):012x}', 'municipio': 'Catalão', 'uf': 'GO',
         'organico': aleatorio.random() < 0.3, 'ja_vendeu_pnae': aleatorio.random() < 0.6}
        for _ in range(25)]
    entregas = []
    for dia in range(DIAS):
        data = INICIO + datetime.timedelta(days=dia)
        if data.weekday() >= 5:  # só em dia útil
            continue
        for escola in aleatorio.sample(ESCOLAS, 3):
            produto = aleatorio.choice(produtos)
            quantidade = aleatorio.randint(5, 40)
            entregas.append({
                'data': data.isoformat(), 'escola': escola, 'produto_id': produto['id'],
                'agricultor_pseudonimo': aleatorio.choice(agricultores)['pseudonimo'],
                'quantidade': quantidade, 'unidade': produto['unidade_padrao'],
                'valor': round(quantidade * precos[produto['id']], 2), 'no_prazo': aleatorio.random() < 0.9})
    meia_noite = datetime.datetime.combine(INICIO, datetime.time(3), datetime.UTC)  # 0 h em Brasília (UTC-3)
    leituras = []
    for hora in range(DIAS * 24):
        porta_aberta = aleatorio.random() < 0.02  # porta esquecida aberta: a câmara passa de 10 °C naquela hora
        leituras.append({
            'dispositivo': 'camara-01',
            'momento': (meia_noite + datetime.timedelta(hours=hora)).isoformat(timespec='seconds'),
            'temperatura_c': round(aleatorio.uniform(10.5, 14) if porta_aberta else aleatorio.uniform(4, 7), 1),
            'peso_kg': round(aleatorio.uniform(150, 210), 1),
            'porta_aberta': porta_aberta})
    destino = raw / 'simulado' / 'simulado.json'
    destino.parent.mkdir(parents=True, exist_ok=True)
    simulado = {'semente': semente, 'agricultores': agricultores, 'entregas': entregas, 'leituras': leituras}
    destino.write_text(json.dumps(simulado, ensure_ascii=False), encoding='utf-8')
    return destino
