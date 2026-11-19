# Guia do painel no Power BI web

Este guia leva você da planilha `.xlsx` até as duas páginas do painel prontas e os prints, no Power BI do navegador (o serviço do Power BI, em app.powerbi.com), sem o Power BI Desktop. Siga na ordem. Na primeira vez, conte com cerca de 2 horas.

No fim, o painel tem:

- **Página 1, PNAE no Brasil** (dados reais do FNDE e do IBGE): percentual comprado da agricultura familiar (AF), municípios abaixo do mínimo, reais que faltaram, a simulação com 45%, a evolução por ano, o ranking por UF e por município e a verba mínima de 2023 a 2026. Filtros: ano, UF, região e faixa de cumprimento.
- **Página 2, Cooperativa** (histórico simulado e dados do app): entregas no prazo, kg e valor por produto, minutos fora da faixa de temperatura por mês, agricultores na primeira venda e renda por agricultor, só pelo pseudônimo. Filtro: produto.

## Se o tempo apertar

A versão curta ainda tem mais de três indicadores, com filtros e medidas em DAX. Faça as seções 2 a 6 inteiras (planilha, tipos, tabelas calculadas, relações e as 17 medidas) e, nos relatórios, só isto:

- **Página 1:** os filtros Ano e UF, os cartões e o gráfico de barras por UF.
- **Página 2:** três cartões: `% Entregas no prazo`, `Valor entregue (R$)` e `Minutos fora da faixa`.
- **Prints:** seção 9.

Pule os blocos marcados com **(opcional)** nas seções 7 e 8. Na página 1: os filtros Região e Faixa (o desenho prevê quatro filtros na página 1; a versão curta fica com dois), as dicas de ferramentas, a evolução por ano, a tabela por município, a verba mínima e o ajuste das interações. Na página 2: o filtro Produto, os outros três cartões, o cartão de Catalão, a tabela e os dois gráficos. Faça-os depois, se sobrar tempo.

## Antes de começar

1. Gere a planilha. Da raiz do repositório:

       PIPELINE_OFFLINE=1 .venv/bin/python -m dados.pipeline tudo

   Ela sai em `dados/datalake/refined/merenda_do_vizinho.xlsx`, com uma aba por tabela: `fato_pnae_af`, `fato_repasse_uf`, `fato_entregas`, `fato_camara_fria`, `dim_produto` e `dim_municipio`. As colunas estão descritas em `dados/datalake/README.md`.
2. Abra `dados/powerbi/medidas.dax` num editor de texto. Você vai copiar os blocos dele.
3. No navegador, entre em <https://app.powerbi.com> com a conta da FIAP (o Microsoft 365 da escola).

Bom saber:

- **Licença.** A gratuita basta. Com ela, você cria e edita o modelo e o relatório no **Meu workspace** (My workspace). Compartilhar com o grupo exigiria o Power BI Pro, mas a entrega usa os prints.
- **Nomes dos botões.** O guia mostra o nome em português e, entre parênteses, o nome em inglês da documentação da Microsoft. Se a tela estiver em inglês, ou se a tradução trocar uma palavra, procure o equivalente.
- **Salvamento.** O editor do modelo salva cada mudança na hora e não tem "desfazer". Errou uma medida? Clique nela no painel **Dados** e corrija na barra de fórmulas. O relatório, ao contrário, só fica salvo quando você clica em **Arquivo** > **Salvar**.

## 1. O que a versão web permite

Conferido na documentação da Microsoft em 18/11/2026 (as fontes estão no fim do guia).

| O painel precisa de | Na web? | Fonte |
|---|---|---|
| Subir o `.xlsx` e criar o modelo semântico | Sim, pela página **Criar** > **Obter dados**, com o conector do Excel e a opção **Carregar arquivo**. O arquivo vai para o OneDrive da conta da escola. | [1], [3], [4] |
| Editar o modelo: relações, medidas DAX, tabelas e colunas calculadas, formatos | Sim, no editor de modelo semântico do navegador. O administrador da FIAP pode ter desligado esse recurso. | [1] |
| Montar o relatório, com segmentações, filtros e interações entre visuais | Sim, no modo de edição do relatório. | [5], [6] |
| Fazer tudo isso com a licença gratuita | Sim, só no Meu workspace. | [6] |

O que **não** dá, e o que fazer no lugar:

- **O quadro "Excel" da página Criar** (o mesmo caminho de Meu workspace > **Novo item** > **Modelo semântico** > **Excel**) importa só os dados formatados como tabela do Excel [2]. As abas do nosso arquivo são intervalos simples, sem tabela formatada. Por isso o guia usa **Obter dados**, que lê as abas pelo Power Query [3].
- **Uma medida chamada só "Repasse".** O Power BI não aceita medida com o nome de uma coluna do modelo, e os nomes não diferenciam maiúsculas de minúsculas [7], [8]. Como a coluna `repasse` existe, a medida se chama **Repasse (R$)**. Isso vale também para o Desktop.
- **Edição do modelo desligada pelo administrador**, ou a página Criar sem **Obter dados**: siga o **plano B** (seção 11), com o Power BI Desktop no Windows de um colega e os mesmos arquivos.

## 2. Subir a planilha e criar o modelo semântico

1. No menu da esquerda, clique em **Criar** (Create). Se o menu estiver recolhido, abra-o pelo ícone de três traços, no alto, à esquerda.
2. Clique em **Obter dados** (Get data). Não use o quadro **Excel** dessa página (veja a seção 1).
3. Na janela das fontes de dados (Choose data source), digite `Excel` na busca e clique em **Pasta de trabalho do Excel** (Excel workbook). Se a janela mostrar um quadro **Carregar** (Upload) para arrastar o arquivo, ele faz o mesmo: arraste o `.xlsx` e pule para o passo 6.
4. Em **Configurações de conexão** (Connection settings), marque **Carregar arquivo** (Upload file). A opção pode vir marcada como versão prévia (Preview).
5. Clique em **Procurar** (Browse) e escolha `dados/datalake/refined/merenda_do_vizinho.xlsx`. Espere aparecer **Carregamento bem-sucedido** (Upload successful), com o tamanho do arquivo (cerca de 3,3 MB).
6. Em **Credenciais de conexão** (Connection credentials), mude o **Tipo de autenticação** (Authentication kind) para **Conta organizacional** (Organizational account). Clique em **Entrar** (Sign in) e use a conta da FIAP. Deve aparecer **Você está conectado** (You are currently signed in).
7. Clique em **Avançar** (Next).
8. Na lista do navegador (Navigator), marque as seis abas: `fato_pnae_af`, `fato_repasse_uf`, `fato_entregas`, `fato_camara_fria`, `dim_produto` e `dim_municipio`. Se aparecer também uma lista de **Tabelas sugeridas** (Suggested tables), não marque nada nela.
9. Clique em **Transformar dados** (Transform data). Abre o editor do Power Query. Faça a seção 3 antes de criar o modelo.

## 3. Conferir nomes e tipos das colunas (Power Query)

As medidas do `medidas.dax` dependem dos nomes exatos das tabelas e do tipo de cada coluna. Confira agora: depois de criado o modelo, corrigir dá mais trabalho.

1. **Nomes das tabelas.** À esquerda, a lista de consultas (Queries) deve ter os seis nomes do passo 8, iguaizinhos. Se algum vier diferente (por exemplo, `fato_pnae_af (2)`), clique nele com o botão direito > **Renomear** (Rename).
2. **Cabeçalhos.** Clique em cada consulta. As colunas devem se chamar `ano`, `cod_ibge`, `municipio`... Se aparecerem `Column1`, `Column2` e os nomes na primeira linha de dados, use **Usar a primeira linha como cabeçalho** (Use first row as headers), na guia **Transformar** (Transform).
3. **Tipos.** O ícone à esquerda do nome da coluna mostra o tipo: `1²³` é número inteiro (Whole number), `1.2` é número decimal (Decimal number), `ABC` é texto (Text), o ✓✗ é verdadeiro/falso (True/False), um calendário é data (Date) e um calendário com relógio é data/hora (Date/Time). `ABC123` quer dizer "qualquer" (Any) e está sempre errado. Confira as colunas abaixo (o `cod_ibge` precisa ser número inteiro nas duas tabelas; senão, a relação 1 da seção 5 não fecha). As que não estão na tabela são texto (`ABC`).

   | Tabela | Número inteiro (`1²³`) | Número decimal (`1.2`) | Verdadeiro/falso | Data ou data/hora |
   |---|---|---|---|---|
   | `fato_pnae_af` | `ano`, `cod_ibge` | `repasse`, `compra_af`, `pct_af`, `minimo`, `falta_minimo_reais`, `falta_45_reais` | `preliminar`, `repasse_zero` | |
   | `fato_repasse_uf` | `ano` | `repasse`, `minimo`, `verba_minima_af_reais` | | |
   | `fato_entregas` | `quantidade` | `kg`, `valor` | `no_prazo`, `primeira_venda` | `data` (provavelmente data/hora, porque a planilha grava o dia como 00:00; pode deixar assim) |
   | `fato_camara_fria` | `minutos_fora_faixa` | `temperatura_media_c` | `porta_aberta` | `hora` (data/hora) |
   | `dim_municipio` | `cod_ibge` | | | |

   Para trocar um tipo: clique no ícone > escolha o tipo > se o Power Query perguntar, **Substituir atual** (Replace current).
4. Clique no botão de concluir, no canto inferior direito (**Avançar**/Next ou **Criar**/Create).
5. Na tela final, dê o nome `Merenda do Vizinho`, deixe o local em **Meu workspace** e escolha **Criar apenas um modelo semântico** (Create a semantic model only). Espere carregar (um ou dois minutos). Abre o editor do modelo, no navegador.

## 4. Tabelas calculadas e coluna `mes`

O editor do modelo tem uma faixa de botões em cima, o diagrama das tabelas no meio e os painéis **Dados** (Data) e **Propriedades** (Properties) à direita.

1. Se aparecer **Modo de exibição** (Viewing mode) no alto, à direita, troque para **Modo de edição** (Editing mode).

   Para voltar ao editor outro dia: Meu workspace > ao lado do modelo `Merenda do Vizinho`, **Mais opções** (...) > **Abrir modelo semântico** (Open semantic model).
2. Clique em **Nova tabela** (New table). Na barra de fórmulas, apague o texto que aparecer, cole o bloco `dim_ano = ...` (seção 1 do `medidas.dax`) e tecle Enter. A tabela `dim_ano` aparece no painel Dados, com a coluna `ano` (2018 a 2026).
3. Repita com o bloco `dim_uf = ...`. Aparece `dim_uf`, com as colunas `uf` e `regiao` (as 27 UFs).
4. No painel Dados, clique na tabela `fato_camara_fria` e depois em **Nova coluna** (New column). Cole o bloco `mes = ...` (seção 2 do `medidas.dax`) e tecle Enter.
5. Clique na coluna `ano` de `dim_ano`. Em **Propriedades**, desligue o **Separador de milhar** (Thousands separator), para o ano aparecer como 2022 e não como 2.022, e em **Resumir por** (Summarize by) escolha **Nenhum** (None).

Por que essas duas tabelas: `dim_ano` faz um só filtro de ano valer para a AF (2018 a 2022) e para os repasses (2023 a 2026); `dim_uf` faz os filtros de UF e região valerem também para as secretarias estaduais, que não têm município.

## 5. Relações

1. Clique em **Gerenciar relações** (Manage relationships). O Power BI pode já ter criado algumas sozinho.
2. O modelo precisa destas seis. Todas são **muitos para um** (*:1), com direção do filtro **única** (Single), e ficam **ativas**:

   | # | De (lado "muitos") | Para (lado "um") |
   |---|---|---|
   | 1 | `fato_pnae_af[cod_ibge]` | `dim_municipio[cod_ibge]` |
   | 2 | `fato_entregas[produto_id]` | `dim_produto[produto_id]` |
   | 3 | `fato_pnae_af[ano]` | `dim_ano[ano]` |
   | 4 | `fato_repasse_uf[ano]` | `dim_ano[ano]` |
   | 5 | `fato_pnae_af[uf]` | `dim_uf[uf]` |
   | 6 | `fato_repasse_uf[uf]` | `dim_uf[uf]` |

3. Para cada uma que faltar: **Novo relacionamento** (New relationship) > na primeira tabela, escolha a tabela da coluna "De" e clique na coluna; na segunda, a tabela da coluna "Para" e a coluna > confira **Muitos para um** (Many to one) e **Única** (Single) > **Salvar**/**OK**.
4. Se a lista tiver alguma relação que não está na tabela acima (por exemplo, entre `dim_municipio` e `dim_uf`), selecione-a e clique em **Excluir** (Delete). Uma ligação a mais abre dois caminhos até `fato_pnae_af` e confunde os filtros.

As secretarias estaduais (esfera `ESTADUAL`) ficam sem `cod_ibge` e não se ligam a nenhum município. Por isso as medidas em reais, a contagem de municípios e o ranking por município usam só a esfera `MUNICIPAL`.

## 6. Medidas

Crie na ordem do arquivo: algumas medidas usam as de cima.

1. No painel Dados, clique na tabela do título da seção do `medidas.dax` (por exemplo, `fato_pnae_af` para a seção 3).
2. Clique em **Nova medida** (New measure).
3. Apague o texto da barra de fórmulas, cole o bloco (do nome da medida até a linha em branco, sem as linhas que começam com `//`) e tecle Enter. A medida aparece na tabela, com o ícone de calculadora.
4. Com a medida selecionada, em **Propriedades** > **Formatação** (Formatting), escolha o formato da tabela abaixo.

| Tabela | Medida | Formato |
|---|---|---|
| `fato_pnae_af` | Repasse (R$) | Moeda (Currency) R$, 0 casas decimais |
| | Compra AF | Moeda R$, 0 casas |
| | % AF | Porcentagem (Percentage), 1 casa |
| | Mínimo do ano | Porcentagem, 0 casas |
| | Faltou para o mínimo (R$) | Moeda R$, 0 casas |
| | Faltaria com 45% (R$) | Moeda R$, 0 casas |
| | Municípios abaixo do mínimo | Número inteiro (Whole number), com separador de milhar |
| | Faixa de cumprimento | texto, nada a formatar |
| | % do total nacional | Porcentagem, 1 casa |
| | Aviso dos dados | texto, nada a formatar |
| `fato_repasse_uf` | Verba mínima para a AF (R$) | Moeda R$, 0 casas |
| `fato_entregas` | Kg entregues | Número decimal, 0 casas, com separador de milhar |
| | Valor entregue (R$) | Moeda R$, 2 casas |
| | % Entregas no prazo | Porcentagem, 1 casa |
| | Renda por agricultor | Moeda R$, 2 casas |
| | Agricultores na primeira venda | Número inteiro |
| `fato_camara_fria` | Minutos fora da faixa | Número inteiro, com separador de milhar |

## 7. Página 1: PNAE no Brasil

1. No editor do modelo, clique em **Novo relatório** (New report). Abre uma aba nova do navegador com uma página em branco, já em edição.
2. Salve logo: **Arquivo** (File) > **Salvar** (Save), com o nome `Painel Merenda do Vizinho`, no Meu workspace. Salve de novo no fim de cada página.
3. Embaixo, dê dois cliques em **Página 1** e escreva `PNAE no Brasil`.

**Como pôr um visual na página.** Clique numa área vazia da página, clique no ícone do visual no painel **Visualizações** (Visualizations) e arraste os campos do painel **Dados** para as caixas indicadas (Campo, Eixo X, Eixo Y, Colunas...). Ajuste o tamanho e a posição pelas bordas. O título e as opções ficam no ícone de pincel, **Formatar visual** (Format visual). Para repetir um visual, selecione-o e use Ctrl+C e Ctrl+V.

Sugestão de arrumação: filtros e aviso na faixa de cima; os cinco cartões logo abaixo; embaixo, à esquerda, a evolução e a verba; à direita, os dois rankings.

**Filtros.** Para cada linha: visual **Segmentação de dados** (Slicer), com o campo na caixa **Campo** (Field). Depois, no pincel > **Configurações da segmentação** (Slicer settings) > **Opções** (Options) > **Estilo** (Style), escolha **Lista suspensa** (Dropdown).

| Filtro | Campo | Ajuste |
|---|---|---|
| Ano | `dim_ano` > `ano` | em **Seleção** (Selection), ligue **Seleção única** (Single select) e escolha 2022 |
| UF | `dim_uf` > `uf` | |
| Região **(opcional)** | `dim_uf` > `regiao` | |
| Faixa de cumprimento **(opcional)** | `fato_pnae_af` > `faixa` | |

Use `dim_uf` para UF e região, não as colunas de `dim_municipio`: as secretarias estaduais não têm município e sumiriam do filtro.

**Cartões.** Visual **Cartão** (Card), uma medida em cada, na caixa **Campos** (Fields). Se o seu Power BI tiver o cartão novo, que aceita várias medidas, pode pôr todas num só.

- `Aviso dos dados`: mostra "dados preliminares" de 2020 a 2022 e "2026 parcial" em 2026; nos outros anos, fica vazio.
- `% AF`, `Mínimo do ano`, `Municípios abaixo do mínimo`, `Faltou para o mínimo (R$)` e `Faltaria com 45% (R$)`.

**Evolução por ano (opcional).** Visual **Gráfico de linhas** (Line chart): **Eixo X** = `dim_ano` > `ano`; **Eixo Y** = `% AF` e `Mínimo do ano`. No pincel > **Eixo X** (X-axis) > **Tipo** (Type), escolha **Categórico** (Categorical). Título: `% comprado da AF e mínimo da lei, por ano (2020 a 2022: dados preliminares)`. A linha do mínimo vai até 2026 e sobe para 45%; a do % AF para em 2022, o último ano publicado pelo FNDE.

**Ranking por UF.** Visual **Gráfico de barras clusterizado** (Clustered bar chart): **Eixo Y** = `dim_uf` > `uf`; **Eixo X** = `Faltou para o mínimo (R$)`; **(opcional)** **Dicas de ferramentas** (Tooltips) = `% do total nacional` e `Municípios abaixo do mínimo`. Título: `Quanto faltou para o mínimo, por UF`. As barras já vêm da maior para a menor.

**Ranking por município (opcional).** Visual **Tabela** (Table). Na caixa **Colunas** (Columns), nesta ordem: `dim_municipio` > `municipio`, `dim_municipio` > `uf`, `% AF`, `Faixa de cumprimento`, `Faltou para o mínimo (R$)` e `% do total nacional`. Depois:

1. No painel **Filtros** (Filters), arraste `fato_pnae_af` > `esfera` para **Filtros neste visual** (Filters on this visual) e marque só **MUNICIPAL**. Sem isso, aparece uma linha sem nome, com as secretarias estaduais.
2. Clique no título da coluna `Faltou para o mínimo (R$)` até a tabela ficar do maior para o menor.
3. Título: `Ranking por município: quanto faltou para o mínimo`.

**Verba mínima de 2023 a 2026 (opcional).** Visual **Gráfico de colunas clusterizado** (Clustered column chart): **Eixo X** = `dim_ano` > `ano`; **Eixo Y** = `Verba mínima para a AF (R$)`. No pincel > **Eixo X** > **Tipo**, escolha **Categórico**. Título: `Verba mínima para a AF por ano (2026 parcial: repasses até 08/04/2026)`.

**O filtro de ano não mexe na evolução nem na verba**, que mostram todos os anos **(opcional, só se você fez esses dois gráficos)**:

1. Clique no filtro **Ano** para selecioná-lo.
2. Na barra de menus do relatório, abra **Interações visuais** (Visual interactions) e ligue **Editar interações** (Edit interactions). Aparecem ícones no canto de cada visual.
3. No gráfico de linhas e no gráfico da verba, clique no ícone **Nenhum** (None), o círculo cortado.
4. Desligue **Editar interações**.

**Confira os números.** Com Ano = 2022 e os outros filtros vazios:

| Cartão | Deve mostrar |
|---|---|
| Aviso dos dados | dados preliminares |
| % AF | 44,5% |
| Mínimo do ano | 30% |
| Municípios abaixo do mínimo | 1.531 |
| Faltou para o mínimo (R$) | R$ 97,1 mi (R$ 97.123.151) |
| Faltaria com 45% (R$) | R$ 244,8 mi (R$ 244.783.654), o número do pitch |

Os cartões abreviam os valores (Mi quer dizer milhões) e podem mostrar mais casas, como R$ 97,12 Mi. Se o `% AF` der 45,2%, a medida perdeu o filtro de `pct_af`; se o `Faltaria com 45% (R$)` der R$ 461,3 mi, perdeu o filtro de esfera. Confira o bloco colado. Há mais valores para conferir no fim do guia.

Salve (**Arquivo** > **Salvar**).

## 8. Página 2: Cooperativa

1. Clique no **+** ao lado da aba da página, embaixo, e renomeie a página nova para `Cooperativa`.
2. **Filtro Produto (opcional):** **Segmentação de dados** com `dim_produto` > `nome`, estilo **Lista suspensa**.
3. **Cartões:** `% Entregas no prazo`, `Valor entregue (R$)` e `Minutos fora da faixa`. **(opcional)** Mais três: `Kg entregues`, `Renda por agricultor` e `Agricultores na primeira venda`.
4. **Comparação com o FNDE (opcional):** mais um **Cartão**, com `Compra AF`. No painel **Filtros**, em **Filtros neste visual**, arraste `dim_municipio` > `municipio` e marque **Catalão** (use a busca do filtro); arraste também `dim_ano` > `ano` e marque **2022**. Título: `Compra da AF em Catalão (GO) em 2022, segundo o FNDE`. É o último dado publicado da cidade da cooperativa, para comparar com o valor entregue.
5. **Kg e valor por produto (opcional):** **Tabela** com `dim_produto` > `nome`, `Kg entregues`, `Valor entregue (R$)` e `% Entregas no prazo`. Clique no título `Valor entregue (R$)` até ordenar do maior para o menor. Produtos vendidos por maço ou por unidade ficam sem kg.
6. **Minutos fora da faixa por mês (opcional):** **Gráfico de linhas** com **Eixo X** = `fato_camara_fria` > `mes` e **Eixo Y** = `Minutos fora da faixa`. Se os meses saírem fora de ordem: **Mais opções** (...) do visual > **Classificar eixo** (Sort axis) > `mes`, e de novo em **Classificar eixo** > **Classificar em ordem crescente** (Sort ascending). Título: `Minutos acima de 10 °C na câmara fria, por mês`.
7. **Renda por agricultor (opcional):** **Gráfico de barras clusterizado** com **Eixo Y** = `fato_entregas` > `agricultor_pseudonimo` e **Eixo X** = `Renda por agricultor`. Título: `Renda por agricultor (pseudônimo)`. Confira: são 25 barras diferentes, da menor, R$ 4.172,75, à maior, R$ 8.740,96. Se todas as barras mostrarem o mesmo valor, R$ 6.415,18, a medida `Renda por agricultor` está sem o `KEEPFILTERS`: confira o bloco colado com o do `medidas.dax`.
8. Salve.

O filtro Produto muda os cartões, a tabela e a renda das entregas, mas não a câmara fria nem o cartão do FNDE. Essas tabelas não têm ligação com produto, e está certo: a temperatura da câmara não é de um produto.

## 9. Prints

1. No alto, troque para **Modo de leitura** (Reading view) e use **Exibir** (View) > **Ajustar à página** (Fit to page).
2. Deixe a página 1 com Ano = 2022 e os outros filtros vazios.
3. Capture só a área do relatório:
   - no Firefox: Ctrl+Shift+S, arraste sobre o relatório e clique em **Baixar** (Download);
   - no GNOME, a tecla Print Screen abre a captura (escolha a área); no KDE, ela abre o Spectacle.
4. Da raiz do repositório, crie a pasta com `mkdir -p entrega/prints` e salve a captura como `entrega/prints/powerbi-1.png`.
5. Faça o mesmo com a página 2 e salve como `entrega/prints/powerbi-2.png`.

A tarefa do pacote de entrega usa esses dois arquivos, com esses nomes, no PDF de evidências.

## 10. Se algo der errado

- **"Abrir modelo semântico" apagado, ou sem "Modo de edição":** passe o mouse sobre o botão **Abrir modelo semântico**, na página de detalhes do modelo, para ver o motivo [1]. Se for uma configuração do administrador, siga o plano B.
- **"Carregar arquivo" não aparece ou falha** (uma conta sem OneDrive, por exemplo): envie o `.xlsx` ao seu OneDrive (<https://www.office.com> > OneDrive > **Carregar**). No passo 4 da seção 2, use **Vincular ao arquivo** (Link to file) > **Procurar no OneDrive** (Browse OneDrive).
- **A janela de entrar na conta não abre:** libere as janelas pop-up para app.powerbi.com no navegador.
- **A lista do passo 8 da seção 2 (Navigator) não mostra as abas:** siga o plano B.
- **`DataFormat.Error` ao criar o modelo:** clique em **Transformar dados** (Transform data), selecione a coluna que a mensagem cita > **Substituir erros** (Replace errors) > `null` > **OK** e salve. Confira também o tipo dessa coluna na seção 3.
- **Erro ao criar uma relação, com tipos diferentes:** a coluna (`cod_ibge` ou `ano`) não tem o mesmo tipo nas duas tabelas. No editor do modelo, clique em **Transformar dados** (Transform data), corrija o tipo como na seção 3 e salve, para a mudança chegar ao modelo [1].
- **Erro na medida, "não encontra a tabela ou a coluna":** o nome da tabela não está igual ao da aba (seção 3, passo 1), ou o bloco foi colado pela metade.
- **Erro de sintaxe em toda medida com vírgula** (no Desktop): **Arquivo** > **Opções e configurações** > **Opções** > **Configurações regionais**, e use os separadores do DAX recomendados (vírgula entre argumentos e ponto nos decimais).
- **O ano aparece como 2.022:** veja a seção 4, passo 5.
- **Os cartões da AF em branco ao escolher de 2023 a 2026** (`% AF`, `Municípios abaixo do mínimo`, `Faltou para o mínimo (R$)` e `Faltaria com 45% (R$)`): é o esperado. O FNDE ainda não publicou a compra da AF desses anos. O `Mínimo do ano` mostra 30% (45% em 2026), o `Aviso dos dados` mostra "2026 parcial" em 2026, e só o gráfico da verba mostra os repasses.

## 11. Plano B: Power BI Desktop no Windows de um colega

O Power BI Desktop só roda no Windows. Leve os mesmos arquivos, `merenda_do_vizinho.xlsx` e `medidas.dax`, num pen drive ou por e-mail.

1. Instale o Power BI Desktop (gratuito, na Microsoft Store) e abra.
2. **Página Inicial** (Home) > **Obter dados** (Get data) > **Pasta de trabalho do Excel** (Excel workbook) > escolha o arquivo.
3. No Navegador, marque as seis abas > **Transformar dados** (Transform data). Confira nomes e tipos como na seção 3 e clique em **Fechar e aplicar** (Close & Apply).
4. Tabelas calculadas, coluna e medidas: guia **Modelagem** (Modeling) > **Nova tabela**, **Nova coluna** e **Nova medida**, com os mesmos blocos e na mesma ordem (seções 4 e 6). O formato das medidas fica na guia **Ferramentas de medida** (Measure tools).
5. Relações: **Exibição de modelo** (Model view), nos ícones da esquerda > **Gerenciar relações** (Manage relationships). São as mesmas seis da seção 5.
6. Páginas: as mesmas das seções 7 e 8. No Desktop, as interações ficam em **Formatar** (Format) > **Editar interações** (Edit interactions) [5].
7. Prints com Win+Shift+S, salvos com os nomes da seção 9. Não é preciso publicar nem versionar o arquivo `.pbix`.

## Valores esperados

Calculados com pandas a partir do `merenda_do_vizinho.xlsx` gerado com `PIPELINE_OFFLINE=1`, com a mesma lógica das medidas. Os de 2022 são os números de referência que o teste do pipeline também confere.

**Página 1, por ano** (filtro Ano em cada valor):

| Ano | Aviso dos dados | % AF | Municípios abaixo do mínimo | Faltou para o mínimo (R$) | Faltaria com 45% (R$) |
|---|---|---|---|---|---|
| 2018 | (vazio) | 35,4% | 1.461 | R$ 107,7 mi | R$ 319,2 mi |
| 2019 | (vazio) | 37,2% | 1.849 | R$ 159,8 mi | R$ 393,1 mi |
| 2020 | dados preliminares | 16,7% | 4.168 | R$ 471,5 mi | R$ 869,2 mi |
| 2021 | dados preliminares | 19,0% | 3.864 | R$ 441,3 mi | R$ 796,5 mi |
| 2022 | dados preliminares | 44,5% | 1.531 | R$ 97,1 mi | R$ 244,8 mi |
| 2026 | 2026 parcial | (vazio) | (vazio) | (vazio) | (vazio) |

Mais conferências de 2022:

- `Repasse (R$)`: R$ 3.552,8 mi; `Compra AF`: R$ 1.604,3 mi.
- `Mínimo do ano`: 30% de 2018 a 2025 e 45% em 2026 (no gráfico de evolução).
- Filtro Faixa de cumprimento: com **abaixo do mínimo**, o cartão `Municípios abaixo do mínimo` mostra 1.043; com **sem compra**, 488. Os dois somam os 1.531. As outras faixas têm 2.958 prefeituras (acima do mínimo), 854 (no mínimo) e 41 (sem repasse).
- Ranking por UF (`Faltou para o mínimo (R$)` e `% do total nacional`): SP R$ 23,3 mi (24,0%); MA R$ 8,2 mi (8,4%); BA R$ 8,0 mi (8,3%); MG R$ 7,5 mi (7,8%); PI R$ 7,3 mi (7,5%).
- Ranking por município: Goiânia (GO) R$ 3,9 mi (4,0%), São Luís (MA) R$ 2,7 mi (2,8%), Recife (PE) R$ 2,4 mi (2,5%), Barueri (SP) R$ 2,4 mi (2,4%) e Belo Horizonte (MG) R$ 1,75 mi (1,8%).

**Verba mínima para a AF (R$)**, Brasil: 2023, R$ 1.584,1 mi; 2024, R$ 1.598,2 mi; 2025, R$ 1.654,4 mi; 2026, R$ 734,9 mi (parcial: 45% dos repasses até 08/04/2026).

**Página 2** (só o histórico simulado: rodando o pipeline com o app no ar, as entregas do app somam a estes números):

| Cartão | Deve mostrar |
|---|---|
| % Entregas no prazo | 88,6% (694 de 783 entregas) |
| Kg entregues | 12.799 |
| Valor entregue (R$) | R$ 160.379,40 |
| Renda por agricultor | R$ 6.415,18 (a média dos 25 agricultores) |
| Agricultores na primeira venda | 12 |
| Minutos fora da faixa | 12.660 |
| Compra da AF em Catalão (GO), 2022 | R$ 312.740,30 (34,3% de um repasse de R$ 912.752) |

- Gráfico `Renda por agricultor`: 25 barras diferentes, da menor, R$ 4.172,75, à maior, R$ 8.740,96; a média delas é o R$ 6.415,18 do cartão. Todas as barras iguais a R$ 6.415,18 quer dizer que a medida está sem o `KEEPFILTERS`.
- Produtos com maior valor entregue: Cenoura (R$ 8.868,16; 749 kg), Mamão (R$ 8.780,94; 606 kg) e Manga (R$ 7.309,44; 576 kg).
- Minutos fora da faixa por mês, de 2025-07 a 2026-06: 960, 900, 1.080, 1.080, 960, 960, 1.260, 1.080, 900, 1.320, 1.140 e 1.020.

## Fontes

Consultadas em 18/11/2026.

1. Microsoft Learn, [Editar modelos semânticos no serviço do Power BI](https://learn.microsoft.com/pt-br/power-bi/transform-model/service-edit-data-models) ([em inglês](https://learn.microsoft.com/en-us/power-bi/transform-model/service-edit-data-models)): criar o modelo pela página Criar > Obter dados, com a opção "Criar apenas um modelo semântico"; abrir com "Abrir modelo semântico"; criar medidas, relações, tabelas e colunas calculadas e mudar propriedades no navegador; salvamento automático, sem desfazer; o administrador pode desligar o recurso.
2. Microsoft Learn, [Get data from Excel workbook files](https://learn.microsoft.com/en-us/power-bi/connect-data/service-excel-workbook-files): Novo item > Modelo semântico > Excel importa os dados que estão em tabelas e o modelo de dados da pasta de trabalho; o botão Carregar de um workspace só mostra a pasta no Excel Online, sem modelo semântico.
3. Microsoft Learn, [Power Query Excel connector](https://learn.microsoft.com/en-us/power-query/connectors/excel): no Power Query Online, o navegador lista as planilhas inteiras e as tabelas sugeridas.
4. Microsoft Learn, [Upload a file in Power Query Online](https://learn.microsoft.com/en-us/power-query/upload-file): a opção Carregar arquivo no conector do Excel; o arquivo fica no OneDrive da conta de trabalho ou de estudante; entrar com conta organizacional.
5. Microsoft Learn, [Change how visuals interact in a report](https://learn.microsoft.com/en-us/power-bi/create-reports/service-reports-visual-interactions): no serviço, Interações visuais > Editar interações; no Desktop, Formatar > Editar interações.
6. Microsoft Learn, [Power BI features available to free users](https://learn.microsoft.com/en-us/power-bi/fundamentals/end-user-features): com a licença gratuita, criar e editar modelo semântico e relatório, só no Meu workspace.
7. SQLBI, [Duplicated names in DAX](https://www.sqlbi.com/articles/duplicated-names-in-dax/): uma medida não pode ter o nome de outra medida nem de nenhuma coluna do modelo.
8. Microsoft Learn, [DAX syntax](https://learn.microsoft.com/en-us/dax/dax-syntax-reference): os nomes de objetos não diferenciam maiúsculas de minúsculas (SALES e Sales são a mesma tabela).
