# Data lake do Merenda do Vizinho

Pipeline em Python (pandas e openpyxl) que junta dados públicos do PNAE, a exportação do app e um histórico simulado em três camadas: **raw** (os arquivos como chegaram), **trusted** (limpos e tipados) e **refined** (as tabelas do painel do Power BI).

## Como rodar

Da raiz do repositório:

    .venv/bin/pip install -r dados/requirements.txt
    set -a; . ./.env; set +a       # traz a CHAVE_SERVICO, para ler o app (opcional)
    .venv/bin/python -m dados.pipeline tudo

As etapas também rodam sozinhas, nesta ordem: `baixar-fontes`, `ingerir-app`, `gerar-simulado`, `tratar` e `refinar`. No fim, o pipeline mostra quantas linhas tem cada arquivo de cada camada.

| Variável | Para quê |
|---|---|
| `PIPELINE_OFFLINE=1` | não baixa nada e usa a cópia versionada das fontes públicas |
| `APP_URL` | endereço do app (padrão `http://localhost:3000`) |
| `CHAVE_SERVICO` | chave do cabeçalho `X-Chave-Servico` da exportação do app |

Sem o app (fora do ar, sem chave ou com chave recusada, o 401), o pipeline avisa e segue só com os dados públicos e o simulado.

Testes: `.venv/bin/python -m unittest discover -s dados/tests -t .`

## Camadas e pastas

| Pasta | Conteúdo | No Git? |
|---|---|---|
| `raw/publicos/` | as fontes públicas, como baixadas | sim (6,8 MB) |
| `raw/app/` | uma exportação do app por execução (`exportacao-<data e hora UTC>.json`) | não |
| `raw/simulado/simulado.json` | o histórico simulado | não |
| `trusted/` | `pnae_af`, `repasses`, `municipios`, `agricultores`, `entregas` e `leituras`, em CSV | não |
| `refined/` | as seis tabelas do painel, em CSV, e `merenda_do_vizinho.xlsx`, com uma aba por tabela | não |

Com rede, `baixar-fontes` baixa cada arquivo de novo e só troca a cópia de `raw/publicos/` se o arquivo baixado começar como o tipo esperado (`.xlsx`, `.gz` ou JSON); assim, uma página de erro nunca substitui o dado. Se a fonte oficial mudar, o `git status` mostra o arquivo alterado.

## Fontes públicas (`raw/publicos/`)

Os arquivos e os problemas de cada um vêm da pesquisa de dados abertos do grupo, feita em 18/11/2026.

| Pasta | Arquivos | O que é | Origem e licença |
|---|---|---|---|
| `fnde-af/` | `DadosAF2018.xlsx`, `ExtracaoAF_201910322_paraenvio.xlsx` (2019), `Planilha2020_04_3_24.xlsx`, `Planilha2021_04_3_24.xlsx` e `Planilha2022_04_3_24.xlsx` | valor transferido e valor comprado da agricultura familiar (AF) por entidade executora, de 2018 a 2022 | FNDE, [Dados Agricultura Familiar - Planilhas](https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pnae/consultas/dados-agricultura-familiar-planilhas); CC BY-ND 3.0, citar "FNDE" |
| `repasses/` | `PNAE_Repasses_Alunos_Escolas_Atendidas.txt.gz` | repasses, alunos e escolas do PNAE por entidade, de 2009 a 2026 (2026 parcial: o arquivo é de 08/04/2026) | FNDE, [Plataforma Antonieta de Barros, produto 82](https://www.fnde.gov.br/plataforma-antonieta-de-barros/dados/produtos-de-dados/visualizar/82), no dados.gov.br; CC-BY |
| `ibge/` | `municipios_ibge_nivelado.json` | os 5.571 municípios, com UF, região, região intermediária e região imediata | [API de localidades do IBGE](https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado); uso livre citando o IBGE |

Ficam de fora:

- **Opcionais não mapeados:** `af_2013_dados.xlsx`, `af_2014_dados.xlsx`, `DadosAF_2015.xlsx` e `af_2016_aquisicoes.xlsx` (formato B, de 2013 a 2016). A série começa em 2018.
- **Sem uso possível agora:** 2011 e 2012, que não têm código IBGE; 2017, em `.xls`, que exigiria o pacote `xlrd`; `DadosAF2019.xlsx`, versão de 2019 que soma R$ 1 bi a mais que os repasses; as versões "aquisicoes" de 2013 e 2014; e o demonstrativo de receitas e despesas, que não tem a compra da AF.

## Tratamento (raw → trusted)

**Planilhas da AF** (`trusted/pnae_af.csv`), na ordem em que o código trata:

1. A aba de dados é a primeira. O cabeçalho é a primeira linha com o texto "Entidade", sem diferenciar maiúsculas: linha 11 em 2018 e 2019 (formato C) e linha 2 de 2020 a 2022 (formato D).
2. As colunas são mapeadas por formato (`COLUNAS_AF` em `etapas/tratar.py`), com o cabeçalho em maiúsculas e sem acento, inclusive com os erros de digitação do formato C ("TRANFERIDO", "AQUSIÇÃO").
3. A linha de total, sem entidade, sai.
4. Número gravado como texto no formato brasileiro (`"\xa069.234,48"`) vira número. O que não é número (célula vazia, por exemplo) fica vazio. A coluna `Percentual` da planilha não é usada: ela mistura fração, pontos percentuais e textos como "100% ou mais".
5. Linha repetida por inteiro sai (São João Evangelista, MG, aparece duas vezes em 2022).
6. **Código IBGE conferido com a UF.** Sem UF, a UF vem do código (Guaratinguetá, SP, em 2022). Quando a UF da linha não é a do código, o código é refeito pelo nome da prefeitura e pela UF. Isso corrige 13 homônimos de 2022 que vinham com o código da cidade de mesmo nome em outro estado (por exemplo, Sítio Novo, TO, vinha com o código de Sítio Novo, MA). O nome que o FNDE abrevia ("SITIO NOVO", TO, que no IBGE é "Sítio Novo do Tocantins") fica numa pequena tabela de correspondência (`NOME_NO_IBGE`).
7. **Esfera.** De 2020 a 2022, vem da coluna `ESFERA`. Em 2018 e 2019, que não têm essa coluna, vem do nome da entidade: é `MUNICIPAL` quando o nome começa com "PREF" ou "PM", ou tem "MUN" ou "MUNIC" ("SEC MUN DE EDUC DE NATAL", "MUNICIPIO DE MARIANA"); o resto (secretarias e governos de estado) é `ESTADUAL`. Essa regra dá o mesmo resultado que a coluna `ESFERA` em todas as linhas de 2020 a 2022. A regra mais simples, só "PREF...", tomaria sete prefeituras por estaduais em 2018, e a secretaria municipal de Natal repetiria a chave da secretaria estadual do RN.
8. `repasse_zero` marca o repasse igual a 0 (42 linhas em 2022). `pct_af = compra_af / repasse` é recalculado e fica vazio quando o repasse é 0 ou está em branco, ou quando um dos dois valores não é número (em 2022, Carrasco Bonito, TO, com a compra em branco).
9. `preliminar` marca 2020 a 2022, que a planilha chama de "DADOS PRELIMINARES - PASSÍVEIS DE REVISÃO".
10. A chave é (ano, código IBGE, esfera). O código sozinho não serve, porque as secretarias estaduais usam o código da capital.

**Repasses** (`trusted/repasses.csv`): separador `;`, UTF-8 com BOM. As 921 linhas sem `Valor_Repasse` saem. A chave é (ano, CNPJ da entidade).

**Municípios** (`trusted/municipios.csv`): região, região intermediária e região imediata do IBGE. Micro e mesorregião ficam de fora, porque Boa Esperança do Norte (MT) não tem.

**App e simulado** (`trusted/agricultores.csv`, `entregas.csv` e `leituras.csv`, com a coluna `origem`, que vale `app` ou `simulado`):

- Do app, entra só a última exportação, que é a foto completa.
- Cada tabela passa por uma lista fechada de colunas. Dos agricultores, só passam `pseudonimo`, `municipio`, `uf`, `organico` e `ja_vendeu_pnae`. Nome, CPF, CAF, e-mail ou o id do agricultor, se viessem, ficam no raw e não chegam ao trusted. O teste confere isso com uma exportação de controle que traz esses dados.
- Cada entrega do app ganha a `unidade` do item da proposta (a do edital), em minúsculas.
- O `momento` das leituras fica em UTC.

## Tabelas do painel (refined)

Relações para o Power BI: `fato_pnae_af[cod_ibge]` com `dim_municipio[cod_ibge]` e `fato_entregas[produto_id]` com `dim_produto[produto_id]`.

**`fato_pnae_af`**: uma linha por (ano, `cod_ibge`, `esfera`), de 2018 a 2022.

| Coluna | O que é |
|---|---|
| `ano` | ano do repasse |
| `cod_ibge` | código IBGE de 7 dígitos. Nas secretarias estaduais, o da capital |
| `municipio` | nome do município no IBGE. Nas secretarias estaduais, a capital |
| `entidade` | entidade executora, como o FNDE escreve |
| `esfera` | `MUNICIPAL` ou `ESTADUAL` |
| `uf` | sigla da UF |
| `regiao` | região do IBGE (Norte, Nordeste, Sudeste, Sul ou Centro-Oeste), pelo código |
| `repasse` | valor transferido pelo FNDE no ano, em R$ |
| `compra_af` | valor comprado da agricultura familiar, em R$ |
| `pct_af` | `compra_af / repasse`. Vazio com repasse 0 ou em branco, ou com valor não numérico |
| `minimo` | mínimo do ano: 0,30 até 2025 e 0,45 a partir de 2026 |
| `falta_minimo_reais` | `max(0, minimo × repasse − compra_af)`. Vazio quando `pct_af` é vazio |
| `falta_45_reais` | a mesma conta com 45%: a simulação da regra de 2026 |
| `faixa` | faixa de cumprimento (abaixo) |
| `preliminar` | verdadeiro de 2020 a 2022 |
| `repasse_zero` | verdadeiro quando o repasse foi 0 |

**`fato_repasse_uf`**: o FNDE ainda não publicou a compra da AF de 2023 em diante, então esta tabela mostra o mercado mínimo da AF por UF, de 2023 a 2026 (2026 parcial), sem precisar ligar nomes de municípios.

| Coluna | O que é |
|---|---|
| `ano` | 2023 a 2026 |
| `uf` | sigla da UF |
| `repasse` | soma dos repasses do PNAE na UF, em R$ |
| `minimo` | 0,30 até 2025 e 0,45 em 2026 |
| `verba_minima_af_reais` | `minimo × repasse`: o que a UF deve comprar da AF, no mínimo, em R$ |

**`fato_entregas`**: uma linha por entrega.

| Coluna | O que é |
|---|---|
| `data` | dia da entrega |
| `origem` | `app` ou `simulado` |
| `escola` | escola que recebeu. Só no simulado |
| `produto_id` | produto do catálogo (`dim_produto`) |
| `agricultor_pseudonimo` | agricultor, só pelo pseudônimo. Só no simulado: o app registra a entrega da proposta, não a de cada cooperado |
| `quantidade` | quantidade, na `unidade` |
| `unidade` | unidade do edital, em minúsculas (`kg`, `pç`, `maço`...) |
| `kg` | igual à `quantidade` quando a unidade é `kg`. Vazio nas outras unidades |
| `valor` | valor da entrega, em R$ |
| `no_prazo` | verdadeiro se a entrega foi no prazo |
| `primeira_venda` | verdadeiro se o agricultor nunca tinha vendido ao PNAE (`ja_vendeu_pnae` falso). Vazio sem agricultor, como nas linhas do app |

**`fato_camara_fria`**: uma linha por hora, dispositivo e origem.

| Coluna | O que é |
|---|---|
| `hora` | início da hora, no horário de Brasília |
| `origem` | `app` ou `simulado` |
| `dispositivo` | a câmara fria (`camara-01`) |
| `temperatura_media_c` | média das leituras da hora, em °C |
| `minutos_fora_faixa` | minutos acima de `LIMITE_TEMP_C` (10 °C, o mesmo limite do app e do Arduino). Cada leitura vale até a próxima, por no máximo 60 minutos; a última de cada série não soma minutos |
| `porta_aberta` | verdadeiro se a porta estava aberta em alguma leitura da hora |

**`dim_produto`** (do `compartilhado/catalogo-produtos.json`, que vai direto ao refined por ser um arquivo do projeto): `produto_id`, `nome` e `unidade_padrao`.

**`dim_municipio`** (do IBGE): `cod_ibge`, `municipio`, `uf`, `regiao`, `regiao_intermediaria` e `regiao_imediata`.

### Faixas de cumprimento

Os rótulos e os limites são constantes de `dados/regras.py`. A medida "Faixa de cumprimento" do Power BI deve usar os mesmos textos.

| Rótulo | Quando | Constante |
|---|---|---|
| `sem repasse` | `pct_af` vazio: repasse 0 ou em branco, ou valor não numérico | `SEM_REPASSE` |
| `sem compra` | `pct_af` igual a 0 | `SEM_COMPRA` |
| `abaixo do mínimo` | `pct_af` maior que 0 e menor que o mínimo do ano | `ABAIXO_DO_MINIMO` |
| `no mínimo` | do mínimo até menos de 10 pontos percentuais acima dele (de 0,30 a menos de 0,40, até 2025) | `NO_MINIMO` |
| `acima do mínimo` | 10 pontos percentuais ou mais acima do mínimo | `ACIMA_DO_MINIMO` |

O mínimo vem de `minimo_do_ano(ano)` e os 10 pontos, de `MARGEM_NO_MINIMO = 0.10`. A faixa `sem compra` também está abaixo do mínimo: a contagem de municípios abaixo do mínimo usa `pct_af < minimo`, que inclui as duas faixas.

### Números de referência de 2022

A pesquisa de dados abertos calculou estes números direto das planilhas, com outro código, e o teste confere que o pipeline chega a eles:

- **% nacional da AF: 44,50%.** É a soma de `compra_af` dividida pela soma de `repasse`, de todas as esferas, só nas linhas com `pct_af` preenchido (sem repasse 0 e sem valor não numérico). Com as 42 linhas de repasse 0, o resultado iria a 45,2%.
- **1.531 prefeituras abaixo de 30%:** esfera `MUNICIPAL` com `pct_af < minimo`. São 1.531 códigos IBGE distintos, já com os homônimos corrigidos.
- **R$ 97,1 milhões faltaram para 30%:** a soma de `falta_minimo_reais` das prefeituras.
- **R$ 244,8 milhões faltariam para 45%:** a soma de `falta_45_reais` das prefeituras. Somando as secretarias estaduais, seriam R$ 461,3 milhões.

## Dados simulados (`raw/simulado/`)

O app é novo e ainda não tem histórico. Para o painel de entregas e da câmara fria, `gerar-simulado` cria um ano de uma cooperativa fictícia de Catalão (GO), sempre igual para a mesma semente (42):

- 25 agricultores, só com pseudônimo: 30% orgânicos e 60% que já venderam ao PNAE;
- 12 escolas ("Escola 01" a "Escola 12");
- 12 meses de entregas, de julho de 2025 a junho de 2026, antes dos dados reais do app: três escolas por dia útil, produtos do catálogo na `unidade_padrao`, preços simulados e 90% no prazo;
- uma leitura por hora da câmara fria: de 4 a 7 °C, com a porta esquecida aberta em 2% das horas, quando a temperatura vai a 10,5 a 14 °C.

Toda linha simulada tem `origem = simulado` no trusted e no refined.

## Exportação do app (`raw/app/`)

`ingerir-app` chama `GET <APP_URL>/api/exportar?desde=2000-01-01T00:00:00Z` com o cabeçalho `X-Chave-Servico` e grava a resposta: `{ gerado_em, agricultores, chamadas, propostas, entregas, leituras }`. O formato está em `dados/tests/fixtures/exportacao-app.json`, e a exportação do app (T12) segue as mesmas chaves. Os agricultores vêm só com `pseudonimo`, `municipio`, `uf`, `organico` e `ja_vendeu_pnae`.
