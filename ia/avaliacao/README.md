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

# só refaz as contas dos resultados gravados: não lê PDF, não usa a chave e não chama a API
.venv/bin/python -m ia.avaliacao.rodar --recontar
```

Sem `ANTHROPIC_API_KEY`, o script avisa "modo IA ignorado: sem ANTHROPIC_API_KEY" e grava só a linha de regras. Cada execução regrava os dois arquivos de saída:

- `resultados/resultados.md`: as tabelas;
- `resultados/resultados.json`: tudo, inclusive os itens que cada modo leu, para conferir caso a caso sem pagar outra chamada.

Os resultados com IA desta entrega estão no Git. Se uma execução sem chave regravar os arquivos só com as regras, `git checkout -- ia/avaliacao/resultados` traz os resultados com IA de volta.

O `--recontar` serve para quando muda uma métrica ou um gabarito: ele lê os itens que cada modo leu em `resultados.json`, compara de novo com os gabaritos e regrava os dois arquivos. Ficam como foram medidos a data, o modelo, o tempo, os avisos, os tokens e o custo.

## O que se mede

- **Item encontrado:** a leitura trouxe um item com o mesmo `produto_id` (o id do catálogo) ou, para produto fora do catálogo, com o mesmo nome normalizado (sem acentos e sem diferença de maiúsculas). Cada item lido vale para um item do gabarito só.
- **Item correto:** encontrado, com a mesma quantidade e com o preço unitário diferente em no máximo R$ 0,01.
- **Quantidade e preço certos:** o item do gabarito conta se a leitura trouxe um item com a mesma quantidade e o preço diferente em no máximo R$ 0,01, seja qual for o nome. Cada item lido vale para um item do gabarito só. Como não olha o nome, mede se os números foram bem lidos mesmo quando o nome saiu diferente ("Vagem fresca" no lugar de "Vagem").
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
  - Manfrinópolis, queijo (lote 5): 100 kg × R$ 61,67 dá R$ 6.167,00, mas o edital escreve R$ 6.151,00 na linha e no total do lote. Não dá para saber qual dos três números está errado; o gabarito segue a quantidade e o preço impressos (100 e R$ 61,67);
  - Santos Dumont, item 05: o total da linha na tabela 1.1 (R$ 7.901,54) está errado, porque 1.835 × R$ 7,23 dá R$ 13.267,05, o valor do Anexo I. A quantidade e o preço são os mesmos nas duas tabelas, então aqui o erro é só do total.
- **Nome do produto:** o nome curto do item, como o edital o escreve, sem a especificação de qualidade, tamanho ou embalagem ("Vagem", "Banana prata", "Bolo de trigo"). É o que o prompt pede ao Claude.
- **produto_id:** o que o catálogo dá a esse nome (`identificar_produto`), que é como o sistema preenche o campo nos dois modos. O gabarito segue o catálogo mesmo onde ele erra: "Doce de leite" fica com `leite` e "Flocão de milho" com `milho-verde`.
- **Prazo de envio:** o último dia para entregar a documentação e o projeto de venda. Quando o edital só marca a sessão de entrega dos envelopes, vale a data da sessão (Santos Dumont e Aparecida de Goiânia).
- **Ambiguidades anotadas:**
  - Bahia: o órgão é estadual e não tem município. O gabarito deixa `municipio` null; quem ler "Salvador" leu a sede.
  - Manfrinópolis: é um credenciamento "permanentemente aberto"; o gabarito usa a única data de entrega escrita.

**Limite da medida:** 70 dos 228 itens (31%) não estão no catálogo e só casam pelo nome. Uma leitura com os números certos e o nome um pouco diferente ("Vagem fresca" no lugar de "Vagem") conta como item não encontrado. A porcentagem de encontrados é, então, um piso, nos dois modos. A coluna "Quantidade e preço certos" não tem esse limite, porque não olha o nome.

## O que a medição de 19/11/2026 mostrou

As tabelas completas estão em `resultados/resultados.md`. Resumo:

| Modo | Chamadas | Itens encontrados | Itens corretos | Quantidade e preço certos | Prazo correto | Tempo médio |
|---|---|---|---|---|---|---|
| regras | 8 | 66,7% | 56,1% | 61,4% | 37,5% | 1,4 s |
| ia | 8 | 95,6% | 95,6% | 100,0% | 100,0% | 27,6 s |

**Uma execução só (n = 1).** Cada chamada foi lida uma vez por modo. O modo de regras dá sempre os mesmos itens e o mesmo prazo (só o tempo varia), mas a IA não: outra execução pode dar números um pouco diferentes (itens lidos, tempo e tokens). Não há média de várias execuções nem intervalo de confiança; trate os números da IA como uma amostra, não como uma garantia.

- A IA respondeu nas 8 chamadas, sem cair para as regras, entre 18 e 41 segundos cada, abaixo do tempo-limite de 90 s. Isso vale também para a de 194 páginas (Bahia) e a de 99 (Aparecida de Goiânia).
- A IA leu certo a quantidade e o preço dos 228 itens: 100,0% em "Quantidade e preço certos", que não olha o nome. Os 10 itens que a medida por nome conta como não encontrados diferem do gabarito só no nome, e em 6 deles o nome da IA é exatamente o que o edital imprime (foi o gabarito que escolheu outro nome):
  - Aparecida de Goiânia: "Vagem fresca" (gabarito: "Vagem"), "Bolo de trigo sabor coco, laranja, milho e fubá" ("Bolo de trigo") e "Iogurte de polpa de fruta 115 g" ("Iogurte de polpa de fruta");
  - Iraquara: "Iogurte diversos sabores" ("Iogurte");
  - Bahia: "Cacau em pó 100%" ("Cacau em pó") e "Farinha". Aqui "FARINHA" é o título do item no edital, e o gabarito usou "Farinha de mandioca", que vem da descrição.
  - Nos outros 4 a IA cortou ou reescreveu um pouco o nome impresso: "Nectarina" (corrigiu o "Nactarina" do edital), "Carne em cubos congelada (IQF)" (o edital escreve "Carne in natura em cubos congelada (IQF) - Patinho"), "Polpa de frutas natural integral congelada" (sem os sabores entre parênteses) e "SUCO INTEGRAL DE UVA" (o edital escreve "SUCO INTEGRAL – (de uva)").
- A IA não inventou nem repetiu item: leu 228 itens, inclusive em Aparecida de Goiânia, que repete a tabela três vezes.
- Nas duas contradições de número dos editais, a IA leu o valor impresso na tabela principal, como o gabarito.
- O modo de regras:
  - não achou a tabela em Bahia e Goiânia;
  - leu as colunas trocadas em Manfrinópolis, onde a quantidade vem antes da unidade;
  - leu a tabela de Aparecida de Goiânia três vezes (161 itens);
  - acertou o prazo em 3 das 8 chamadas.
- Município e UF: a IA acertou 7 das 8. Na chamada estadual da Bahia, leu "Salvador", a sede (ver as ambiguidades acima).

## Limite de tokens de saída

A IA responde com no máximo 16.000 tokens (`max_tokens` em `ia/extrair/claude.py`). Se a resposta chega a esse limite, ela vem cortada: o `extrair_chamada` descarta a leitura da IA, cai para o modo de regras e a chamada vai para a lista de quedas.

Nas 8 chamadas isso não aconteceu. A maior saída foi a de Aparecida de Goiânia, com 11.407 tokens para 54 itens (71% do limite). A saída cresce com o número de itens: uma reta ajustada aos 8 pontos dá cerca de 3.600 tokens fixos mais cerca de 130 por item, e os editais se afastam da reta em até cerca de 1.200 tokens. Isso põe o limite perto de 90 itens, e um edital com uns 80 itens ou mais já corre o risco de a resposta vir cortada. É uma estimativa feita com 8 pontos: para um edital desse tamanho, teste antes.

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

Para comparar, cronometre uma leitura feita à mão e compare com o tempo da IA no mesmo edital (coluna "Tempo da IA", da medição de 19/11/2026). Não compare com a média de 27,6 s: o tempo da IA vai de 18 s a 41 s, conforme o edital. Abra o edital de `chamadas/`, copie para uma planilha os itens (produto, unidade, quantidade e preço) e o prazo de envio e anote o tempo na linha dele:

| Edital | Páginas | Itens | Tempo da IA | Tempo da leitura manual | Data | Quem leu |
|---|---|---|---|---|---|---|
| 01-ba-estado-bahia-2026 | 194 | 16 | 26,3 s | min | | |
| 02-ba-iraquara-2025 | 30 | 49 | 29,9 s | min | | |
| 03-go-aparecida-de-goiania-2025 | 99 | 54 | 40,9 s | min | | |
| 04-go-catalao-2026 | 15 | 16 | 18,1 s | min | | |
| 05-go-goiania-2026 | 39 | 16 | 27,9 s | min | | |
| 06-mg-santos-dumont-2025 | 21 | 24 | 23,9 s | min | | |
| 08-pr-manfrinopolis-2026 | 41 | 43 | 33,9 s | min | | |
| 10-rs-sao-borja-2025 | 21 | 10 | 20,2 s | min | | |
