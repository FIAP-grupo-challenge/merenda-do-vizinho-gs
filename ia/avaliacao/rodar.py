"""Avaliação da leitura da chamada em editais reais. Da raiz do repositório: .venv/bin/python -m ia.avaliacao.rodar

Lê cada PDF de chamadas/ no modo de regras e, com ANTHROPIC_API_KEY, também com o Claude (uma chamada à API por PDF).
Compara com gabarito/<mesmo nome>.json e grava resultados/resultados.json e resultados/resultados.md.

Com --recontar não lê PDF nem chama a API: refaz as métricas de resultados.json (os itens que cada modo leu) com os
gabaritos e regrava os dois arquivos."""
import argparse
import base64
import json
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from ia.avaliacao.metricas import comparar_itens, custo_usd, resumir, valores_certos
from ia.catalogo import normalizar_texto
from ia.cliente_claude import criar_cliente_claude
from ia.config import MODELO_PADRAO
from ia.extrair.servico import extrair_chamada

PASTA = Path(__file__).resolve().parent
CAMPOS_DO_ITEM = ('produto', 'produto_id', 'unidade', 'quantidade', 'preco_unitario')
ANDAMENTO = ('modo', 'origem', 'encontrados', 'corretos', 'valores_certos', 'total_gabarito', 'prazo_correto',
             'duracao_ms', 'tokens_entrada', 'tokens_saida', 'avisos')
CONSUMO = ('tokens_entrada', 'tokens_saida', 'custo_usd')  # o que tokens() acrescenta à linha do modo IA


def main(argv=None):
    analisador = argparse.ArgumentParser(prog='python -m ia.avaliacao.rodar',
                                         description='Avalia a leitura da chamada em editais reais.')
    analisador.add_argument('--recontar', action='store_true',
                            help='refaz as métricas de resultados.json com os gabaritos, sem ler PDF nem chamar a API')
    if analisador.parse_args(argv).recontar:
        print(recontar())
        return
    cliente = criar_cliente_claude()
    if cliente is None:
        print('modo IA ignorado: sem ANTHROPIC_API_KEY')
    linhas = []
    for pdf in sorted((PASTA / 'chamadas').glob('*.pdf')):
        gabarito = _gabarito(pdf.name)
        entrada = {'pdf_base64': base64.b64encode(pdf.read_bytes()).decode()}
        novas = [avaliar(pdf.name, 'regras', extrair_chamada(entrada), gabarito)]
        if cliente is not None:
            usos = []  # os parâmetros da produção (tempo-limite de 90 s, sem novas tentativas): mede o que o app faz
            resultado = extrair_chamada(entrada, cliente=cliente_que_mede(cliente, usos))
            novas.append({**avaliar(pdf.name, 'ia', resultado, gabarito), **tokens(usos)})
        linhas += novas
        # o andamento leva os números: se a execução cair no meio, o que a API já cobrou fica registrado na saída
        print(pdf.name, *[{campo: linha.get(campo) for campo in ANDAMENTO} for linha in novas], flush=True)
    print(gravar(PASTA / 'resultados', date.today().isoformat(), MODELO_PADRAO if cliente else None, linhas))


def gravar(saida: Path, data: str, modelo: str | None, linhas: list) -> str:
    """Grava resultados.json e resultados.md na pasta saida e devolve o texto do .md."""
    resumo = resumir(linhas)
    custo = round(sum(linha.get('custo_usd') or 0 for linha in linhas), 4)
    saida.mkdir(exist_ok=True)
    (saida / 'resultados.json').write_text(json.dumps({
        'data': data, 'modelo': modelo, 'resumo': resumo, 'custo_total_usd': custo, 'linhas': linhas,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    texto = markdown(resumo, linhas, custo, modelo, data)
    (saida / 'resultados.md').write_text(texto, encoding='utf-8')
    return texto


def recontar(saida: Path = PASTA / 'resultados') -> str:
    """Refaz as métricas de resultados.json com os itens que cada modo leu e os gabaritos, sem ler PDF nem chamar a API.
    Regrava os dois arquivos; a data, o modelo, a duração, os avisos, os tokens e o custo ficam como foram medidos."""
    salvo = json.loads((saida / 'resultados.json').read_text(encoding='utf-8'))
    return gravar(saida, salvo['data'], salvo['modelo'], [_recontar_linha(linha) for linha in salvo['linhas']])


def _recontar_linha(linha: dict) -> dict:
    chamada = {'itens': linha['itens'], 'prazo_envio': linha['prazo_envio'],
               'municipio': linha['municipio_uf'][0], 'uf': linha['municipio_uf'][1]}
    resultado = {'origem': linha['origem'], 'duracao_ms': linha['duracao_ms'], 'avisos': linha['avisos'],
                 'chamada': chamada}
    return {**avaliar(linha['arquivo'], linha['modo'], resultado, _gabarito(linha['arquivo'])),
            **{campo: linha[campo] for campo in CONSUMO if campo in linha}}


def _gabarito(arquivo: str) -> dict:
    return json.loads((PASTA / 'gabarito' / f'{Path(arquivo).stem}.json').read_text(encoding='utf-8'))


def cliente_que_mede(cliente, usos: list):
    """Repassa o pedido ao cliente de verdade e guarda o usage de cada resposta: extrair_chamada não devolve tokens."""
    def com_opcoes(**opcoes):
        mensagens = cliente.with_options(**opcoes).messages

        def criar(**pedido):
            resposta = mensagens.create(**pedido)
            usos.append(resposta.usage)
            return resposta
        return SimpleNamespace(messages=SimpleNamespace(create=criar))
    return SimpleNamespace(with_options=com_opcoes)


def avaliar(arquivo: str, modo: str, resultado: dict, gabarito: dict) -> dict:
    chamada = resultado['chamada']
    return {
        'arquivo': arquivo, 'modo': modo, 'origem': resultado['origem'],
        **comparar_itens(chamada['itens'], gabarito['itens']),
        'valores_certos': valores_certos(chamada['itens'], gabarito['itens']),
        'prazo_envio': chamada['prazo_envio'], 'prazo_gabarito': gabarito['prazo_envio'],
        'prazo_correto': chamada['prazo_envio'] == gabarito['prazo_envio'],
        'municipio_uf': [chamada['municipio'], chamada['uf']],
        'municipio_uf_correto': (normalizar_texto(chamada['municipio'] or ''), chamada['uf'])
                                == (normalizar_texto(gabarito['municipio'] or ''), gabarito['uf']),
        'duracao_ms': resultado['duracao_ms'], 'avisos': resultado['avisos'],
        # o que foi lido fica guardado: dá para conferir (e recontar) sem pagar outra chamada à API
        'itens': [{campo: item[campo] for campo in CAMPOS_DO_ITEM} for item in chamada['itens']],
    }


def tokens(usos: list) -> dict:
    if not usos:  # a API não devolveu resposta (tempo esgotado ou erro): não há uso informado
        return {'tokens_entrada': None, 'tokens_saida': None, 'custo_usd': None}
    uso = usos[-1]
    return {'tokens_entrada': uso.input_tokens, 'tokens_saida': uso.output_tokens,
            'custo_usd': round(custo_usd(uso.input_tokens, uso.output_tokens), 6)}


def markdown(resumo: dict, linhas: list, custo: float, modelo: str | None, data: str) -> str:
    md = [f'# Avaliação da leitura da chamada ({date.fromisoformat(data):%d/%m/%Y})', '',
          'Itens encontrados, corretos e com quantidade e preço certos: porcentagem sobre o total de itens dos '
          'gabaritos das chamadas de cada linha. A linha "ia" só conta as chamadas em que o Claude respondeu.', '',
          '- "Encontrado": a leitura trouxe um item com o mesmo `produto_id` de um item do gabarito (ou, para produto '
          'fora do catálogo, com o mesmo nome, sem acento nem diferença de maiúsculas). "Correto": encontrado, com a '
          'mesma quantidade e o preço diferente em no máximo R$ 0,01.',
          '- "Encontrados" é um piso: o produto fora do catálogo só casa pelo nome exato, e "Vagem fresca" no lugar '
          'de "Vagem" conta como não encontrado. "Quantidade e preço certos" não olha o nome: conta o item do '
          'gabarito para o qual a leitura trouxe um item com a mesma quantidade e o mesmo preço (R$ 0,01), com '
          'qualquer nome.', '',
          '| Modo | Chamadas | Itens encontrados | Itens corretos | Quantidade e preço certos | Prazo correto '
          '| Tempo médio |',
          '|---|---|---|---|---|---|---|']
    for modo in ('regras', 'ia'):
        m = resumo[modo]
        if m:
            md.append(f"| {modo} | {m['chamadas']} | {_br(m['pct_encontrados'], 1)}% | {_br(m['pct_corretos'], 1)}% "
                      f"| {_br(m['pct_valores_certos'], 1)}% | {_br(m['pct_prazo_correto'], 1)}% "
                      f"| {_br(m['tempo_medio_ms'] / 1000, 1)} s |")
    if resumo['falhas_ia']:
        md += ['', 'Chamadas em que a IA caiu para as regras (fora da linha "ia"):', '']
        md += [f"- {falha['arquivo']}: {'; '.join(falha['avisos'])}" for falha in resumo['falhas_ia']]
    md += ['', '## Por chamada', '',
           '| Chamada | Modo | Itens no gabarito | Encontrados | Corretos | Quantidade e preço certos | Prazo lido '
           '| Prazo do gabarito | Município/UF certo | Tempo | Tokens (entrada / saída) | Custo (US$) |',
           '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for linha in linhas:
        modo = linha['modo'] if linha['modo'] == linha['origem'] else 'ia (caiu para regras)'
        consumo = ('-', '-') if linha.get('tokens_entrada') is None else (
            f"{_br(linha['tokens_entrada'])} / {_br(linha['tokens_saida'])}", _br(linha['custo_usd'], 4))
        md.append(f"| {linha['arquivo']} | {modo} | {linha['total_gabarito']} | {linha['encontrados']} "
                  f"| {linha['corretos']} | {linha['valores_certos']} | {linha['prazo_envio'] or '-'} "
                  f"| {linha['prazo_gabarito']} "
                  f"| {'sim' if linha['municipio_uf_correto'] else 'não'} | {_br(linha['duracao_ms'] / 1000, 1)} s "
                  f"| {consumo[0]} | {consumo[1]} |")
    if modelo:
        md += ['', f'Custo total da IA ({modelo}): US$ {_br(custo, 4)}.']
    return '\n'.join(md) + '\n'


def _br(numero: float, casas: int = 0) -> str:
    """1234.5 -> '1.234,5': milhar com ponto e decimal com vírgula."""
    return f'{numero:,.{casas}f}'.translate(str.maketrans(',.', '.,'))


if __name__ == '__main__':
    main()
