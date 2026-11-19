# Avaliação da leitura da chamada

Mede, em 8 editais reais do PNAE, o quanto a leitura automática da chamada acerta, nos dois modos do sistema: o modo de regras (sem IA) e o modo IA (Claude Haiku 5.5). Os dois passam pelo mesmo `extrair_chamada` que o servidor da IA usa.

## Como rodar

Da raiz do repositório:

```bash
# só o modo de regras: não chama a API e não custa nada
.venv/bin/python -m ia.avaliacao.rodar

# regras + IA: carrega a chave do .env sem imprimir e faz uma chamada à API por PDF (8 no total)
set -a; . ./.env; set +a
.venv/bin/python -m ia.avaliacao.rodar
```

Sem `ANTHROPIC_API_KEY`, o script avisa "modo IA ignorado: sem ANTHROPIC_API_KEY" e grava só a linha de regras. Cada execução regrava os dois arquivos de saída:

- `resultados/resultados.md`: as tabelas;
- `resultados/resultados.json`: tudo, inclusive os itens que cada modo leu, para conferir caso a caso sem pagar outra chamada.

Os resultados com IA desta entrega estão no Git. Se uma execução sem chave regravar os arquivos só com as regras, `git checkout -- ia/avaliacao/resultados` traz os resultados com IA de volta.

## O que se mede

- **Item encontrado:** a leitura trouxe um item com o mesmo `produto_id` (o id do catálogo) ou, para produto fora do catálogo, com o mesmo nome normalizado (sem acentos e sem diferença de maiúsculas). Cada item lido vale para um item do gabarito só.
- **Item correto:** encontrado, com a mesma quantidade e com o preço unitário diferente em no máximo R$ 0,01.
- **Prazo correto:** o `prazo_envio` lido é igual ao do gabarito.
- **Tempo:** a duração da leitura (`duracao_ms`), na média das chamadas.

Como ler os números:

- As porcentagens de itens são sobre o total de itens dos gabaritos. Cada item pesa igual, então a chamada de 54 itens pesa mais que a de 10.
- A linha "ia" só conta as chamadas em que o Claude respondeu. Quando a IA falha (erro da API, tempo esgotado, resposta cortada no limite de tokens), o `extrair_chamada` cai para o modo de regras. Essa chamada vai para a lista de quedas, com o aviso, e fica fora da linha "ia".
- A IA roda com os parâmetros da produção, os de `ia/extrair/claude.py`: modelo `claude-haiku-5-5`, esforço `medium`, até 16.000 tokens de saída, tempo-limite de 90 s e nenhuma nova tentativa. A medida é do que o app faz de verdade.
- A tabela por chamada também diz se o município e a UF lidos batem com o gabarito.

## As chamadas

| Arquivo | UF | Páginas | Itens no gabarito |
|---|---|---|---|
| 01-ba-estado-bahia-2026.pdf | BA | 194 | 16 |
| 02-ba-iraquara-2025.pdf | BA | 30 | 49 |
| 03-go-aparecida-de-goiania-2025.pdf | GO | 99 | 54 |
| 04-go-catalao-2026.pdf | GO | 15 | 16 |
| 05-go-goiania-2026.pdf | GO | 39 | 16 |
| 06-mg-santos-dumont-2025.pdf | MG | 21 | 24 |
| 08-pr-manfrinopolis-2026.pdf | PR | 41 | 43 |
| 10-rs-sao-borja-2025.pdf | RS | 21 | 10 |

São 228 itens, de 5 estados e 4 regiões. Os PDFs são cópias dos baixados na pesquisa do projeto, com os links de origem no índice das chamadas.

Duas chamadas da pesquisa ficaram fora do repositório porque o contrato-modelo traz o CPF de um agente público: Santarém/PA (07) e Carnaúba dos Dantas/RN (09). Antes de copiar um PDF novo para `chamadas/`, rode `pdftotext arquivo.pdf - | grep -E '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}'` e não copie o PDF se aparecer um CPF. O edital de Goiânia traz o CPF da secretária já mascarado pelo Diário Oficial, com asteriscos no lugar dos primeiros e dos últimos dígitos, e essa busca não o acha.

## Como os gabaritos foram montados

Há um `gabarito/<mesmo nome do PDF>.json` por chamada, com `municipio`, `uf`, `prazo_envio`, `notas` e os `itens` (`produto`, `produto_id`, `unidade`, `quantidade` e `preco_unitario`).

- **Leitura:** cada PDF foi lido à mão com `pdftotext -layout`. O Anexo I da Bahia, de colunas estreitas, também foi lido com `pdftotext -raw`.
- **Conferência:** em cada linha, quantidade × preço tem de dar o total impresso no edital, e a soma das linhas tem de dar o valor total declarado. Dos 228 itens, só não passam 4 linhas em que o próprio edital se contradiz.
- **Contradições do edital:** o gabarito segue a quantidade e o preço impressos na tabela principal de itens e anota a contradição nas `notas`:
  - Bahia, item 01: a quantidade é 666.766 na tabela e 665.766 no total da linha e no Anexo VI;
  - Santos Dumont, item 01: o preço é R$ 6,48 na tabela 1.1 e R$ 6,84 no total da linha e no Anexo I;
  - Santos Dumont, item 05, e Manfrinópolis, queijo: o total da linha não confere, mas a quantidade e o preço não têm contradição.
- **Nome do produto:** o nome curto do item, como o edital o escreve, sem a especificação de qualidade, tamanho ou embalagem ("Vagem", "Banana prata", "Bolo de trigo"). É o que o prompt pede ao Claude.
- **produto_id:** o que o catálogo dá a esse nome (`identificar_produto`), que é como o sistema preenche o campo nos dois modos. O gabarito segue o catálogo mesmo onde ele erra: "Doce de leite" fica com `leite` e "Flocão de milho" com `milho-verde`.
- **Prazo de envio:** o último dia para entregar a documentação e o projeto de venda. Quando o edital só marca a sessão de entrega dos envelopes, vale a data da sessão (Santos Dumont e Aparecida de Goiânia).
- **Ambiguidades anotadas:**
  - Bahia: o órgão é estadual e não tem município. O gabarito deixa `municipio` null; quem ler "Salvador" leu a sede.
  - Manfrinópolis: é um credenciamento "permanentemente aberto"; o gabarito usa a única data de entrega escrita.

**Limite da medida:** 70 dos 228 itens (31%) não estão no catálogo e só casam pelo nome. Uma leitura com os números certos e o nome um pouco diferente ("Vagem fresca" no lugar de "Vagem") conta como item não encontrado. A porcentagem de encontrados é, então, um piso, nos dois modos.

## O que a medição de 19/11/2026 mostrou

As tabelas completas estão em `resultados/resultados.md`. Resumo:

| Modo | Chamadas | Itens encontrados | Itens corretos | Prazo correto | Tempo médio |
|---|---|---|---|---|---|
| regras | 8 | 66,7% | 56,1% | 37,5% | 1,4 s |
| ia | 8 | 95,6% | 95,6% | 100,0% | 27,6 s |

- A IA respondeu nas 8 chamadas, sem cair para as regras, entre 18 e 41 segundos cada, abaixo do tempo-limite de 90 s. Isso vale também para a de 194 páginas (Bahia) e a de 99 (Aparecida de Goiânia).
- A IA leu certo a quantidade e o preço dos 228 itens. Os 10 itens que a medida conta como não encontrados têm só o nome diferente do gabarito: "Vagem fresca" no lugar de "Vagem", "Farinha" no lugar de "Farinha de mandioca", "Nectarina" no lugar de "Nactarina" (a IA corrigiu o erro de digitação do edital).
- A IA não inventou nem repetiu item: leu 228 itens, inclusive em Aparecida de Goiânia, que repete a tabela três vezes.
- Nas duas contradições de número dos editais, a IA leu o valor impresso na tabela principal, como o gabarito.
- O modo de regras:
  - não achou a tabela em Bahia e Goiânia;
  - leu as colunas trocadas em Manfrinópolis, onde a quantidade vem antes da unidade;
  - leu a tabela de Aparecida de Goiânia três vezes (161 itens);
  - acertou o prazo em 3 das 8 chamadas.
- Município e UF: a IA acertou 7 das 8. Na chamada estadual da Bahia, leu "Salvador", a sede (ver as ambiguidades acima).

## Custo

O Claude Haiku 5.5 cobra US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída quando o prompt tem até 100 mil tokens. Acima disso, a chamada inteira custa US$ 0,50 e US$ 2,50 por milhão. O PDF vai inteiro para a API, com o texto e a imagem de cada página: deu cerca de 2.800 tokens de entrada por página.

Custo medido em 19/11/2026, uma chamada por PDF:

| Chamada | Páginas | Tokens de entrada | Tokens de saída | Custo (US$) |
|---|---|---|---|---|
| 01-ba-estado-bahia-2026 | 194 | 526.217 | 4.854 | 0,2752 |
| 02-ba-iraquara-2025 | 30 | 81.907 | 8.934 | 0,0127 |
| 03-go-aparecida-de-goiania-2025 | 99 | 230.576 | 11.407 | 0,1438 |
| 04-go-catalao-2026 | 15 | 45.158 | 4.914 | 0,0070 |
| 05-go-goiania-2026 | 39 | 153.282 | 6.904 | 0,0939 |
| 06-mg-santos-dumont-2025 | 21 | 57.371 | 6.361 | 0,0089 |
| 08-pr-manfrinopolis-2026 | 41 | 127.559 | 9.510 | 0,0876 |
| 10-rs-sao-borja-2025 | 21 | 51.769 | 5.409 | 0,0079 |
| **Total** | **460** | **1.273.839** | **58.293** | **0,6369** |

Custo estimado de uma nova execução com IA: cerca de US$ 0,64.

- A Bahia (194 páginas) custa cerca de US$ 0,28 e Aparecida de Goiânia (99 páginas), cerca de US$ 0,14.
- Um edital de até uns 35 páginas fica abaixo de 100 mil tokens e custa cerca de US$ 0,01.
- Acima disso, o preço por token fica 5 vezes maior. Os 4 editais acima de 100 mil tokens (Bahia, Aparecida de Goiânia, Goiânia e Manfrinópolis) somam 94% do custo.

## Tempo de uma leitura manual

Para comparar com os 27,6 s da IA, cronometre uma leitura feita à mão. Abra um edital de `chamadas/`, copie para uma planilha os itens (produto, unidade, quantidade e preço) e o prazo de envio e anote o tempo aqui:

| Edital | Páginas | Itens | Tempo da leitura manual | Data | Quem leu |
|---|---|---|---|---|---|
| | | | min | | |
