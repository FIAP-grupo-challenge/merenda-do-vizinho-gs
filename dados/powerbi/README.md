# Painel no Power BI

O painel do Colhe é montado no Power BI web (o serviço do Power BI, no navegador) a partir da camada refined do data lake.

| Arquivo | O que tem |
|---|---|
| `guia-do-painel.md` | o passo a passo na versão web: subir o `.xlsx`, conferir os tipos, criar as tabelas calculadas, as relações e as medidas, montar as páginas 1 e 2 e tirar os prints. Traz uma versão curta para quando o tempo apertar, as fontes da Microsoft, o plano B (Power BI Desktop no Windows) e os valores esperados |
| `medidas.dax` | as duas tabelas calculadas, a coluna calculada e as 17 medidas, cada uma com a tabela onde fica e um comentário com o porquê |

**Entrada:** `dados/datalake/refined/merenda_do_vizinho.xlsx`, gerado com `PIPELINE_OFFLINE=1 .venv/bin/python -m dados.pipeline tudo` (fica fora do Git). As colunas estão em `dados/datalake/README.md`.

**Modelo:**

- tabelas da planilha: `fato_pnae_af`, `fato_repasse_uf`, `fato_entregas`, `fato_camara_fria`, `dim_produto` e `dim_municipio`;
- tabelas calculadas: `dim_ano` (2018 a 2026), para um só filtro de ano valer na AF e nos repasses, e `dim_uf` (UF e região), para os filtros de UF e região pegarem também as secretarias estaduais, que não têm município;
- coluna calculada: `fato_camara_fria[mes]`, para os minutos fora da faixa por mês;
- seis relações muitos para um: `fato_pnae_af[cod_ibge]` com `dim_municipio`, `fato_entregas[produto_id]` com `dim_produto`, `fato_pnae_af[ano]` e `fato_repasse_uf[ano]` com `dim_ano`, e `fato_pnae_af[uf]` e `fato_repasse_uf[uf]` com `dim_uf`;
- as secretarias estaduais (esfera `ESTADUAL`) não têm `cod_ibge` e não se ligam a nenhum município: toda medida ou visual por município (ou por região imediata ou intermediária) filtra `esfera = "MUNICIPAL"`. UF e região vêm de `dim_uf`, que vale também para as secretarias.

**Medidas:**

- `fato_pnae_af`: `Repasse (R$)`, `Compra AF`, `% AF`, `Mínimo do ano`, `Faltou para o mínimo (R$)`, `Faltaria com 45% (R$)`, `Municípios abaixo do mínimo`, `Faixa de cumprimento`, `% do total nacional` e `Aviso dos dados`;
- `fato_repasse_uf`: `Verba mínima para a AF (R$)`;
- `fato_entregas`: `Kg entregues`, `Valor entregue (R$)`, `% Entregas no prazo`, `Renda por agricultor` e `Agricultores na primeira venda`;
- `fato_camara_fria`: `Minutos fora da faixa`.

As funções analíticas usadas são `CALCULATE`, `KEEPFILTERS`, `FILTER`, `ALL`, `VALUES`, `DIVIDE`, `SUMX`, `DISTINCTCOUNT`, `VAR`/`RETURN`, `IF`, `SWITCH(TRUE(), ...)`, `ISBLANK` e `ISEMPTY`.

A medida do repasse se chama `Repasse (R$)`, e não `Repasse`: o Power BI não aceita medida com o nome de uma coluna do modelo, e os nomes não diferenciam maiúsculas (a coluna `repasse` existe). `Aviso dos dados` mostra "dados preliminares" de 2020 a 2022 e "2026 parcial" em 2026.

**Números de conferência de 2022:** `% AF` 44,5%, `Municípios abaixo do mínimo` 1.531, `Faltou para o mínimo (R$)` R$ 97,1 milhões e `Faltaria com 45% (R$)` R$ 244,8 milhões. São os mesmos do teste do pipeline.

**Prints:** `entrega/prints/powerbi-1.png` (página 1, com o ano 2022) e `entrega/prints/powerbi-2.png` (página 2).
