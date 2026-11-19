# Roteiro do pitch: Merenda do Vizinho

Global Solution 2026/2 (CitizenTech). Vídeo de até 3 minutos, entrega em 19/11/2026.

**Estado:** rascunho para você aprovar. O valor que a Ana vê na tela (R$ 21.082, chamada de Catalão com DATA_REFERENCIA=2026-07-15) já foi conferido no app integrado (o resultado da avaliação da IA já está na seção 6: 95,6% dos itens contra 56,1% sem IA).

## Resumo

- **Tempos do edital:** os blocos começam em 0:00 (problema), 0:30 (solução), 0:50 (demonstração), 2:10 (impacto) e 2:40 (fechamento), os mesmos marcos do edital.
- **Duração-alvo:** 2:50, com 10 segundos de folga. O edital não avalia o que passa de 3:00.
- **Fala:** 388 palavras faladas (348 escritas). Contei o que a voz diz: números, porcentagens e valores por extenso, e "Contrata+Brasil" como "Contrata Mais Brasil".
  - A 145 palavras por minuto são 2:40 de voz (2:46 a 140 e 2:35 a 150). Sobram uns 10 segundos para cliques, cortes e respiros.
  - Sem os trechos em itálico, são 355 palavras, 2:26 de voz e uns 23 segundos de sobra.
- **Vozes:** três integrantes. Com duas pessoas, o Integrante 3 vira o Integrante 2. Com uma só, ela fala tudo e o tempo não muda.
- **Fio da história:** a Ana, personagem fictícia, apresentada com "Imagine a Ana". É a mesma usuária de demonstração do app (`ana@demo.br`).
- **Método do curso (capítulo de Pitch, fase 7):**
  - abre com uma história;
  - cria um contexto de mudança: o mínimo subiu para 45% em 2026;
  - descreve o problema do jeito que a Ana sente;
  - diz a solução numa frase;
  - mostra o produto funcionando;
  - responde antes que perguntem "mas já não existe o Contrata+Brasil?";
  - fecha com a frase do projeto e um agradecimento, nunca com "era isso".
- **A tela é sempre o produto:** app, simulador, Power BI ou TinkerCad. Nenhum slide. A apresentação em `apresentacao/` serve para a banca, o PDF e o white paper, não para o vídeo.

## 1. Roteiro

Frases em *itálico* podem ser cortadas se o ensaio passar de 2:50. Os cinco cortes, do que menos pesa para o que mais pesa:

1. "já dentro do limite de 40 mil reais por ano" (10 palavras);
2. "respeita o limite de cada um" (6);
3. "pelo data lake" (3);
4. "Nenhum dado pessoal vai para a IA." (7);
5. "e IA medida em 8 chamadas reais" (7), que só vale se a avaliação da IA rodar (seção 6).

| Tempo | Bloco do edital | Quem fala | Fala exata | O que aparece na tela | Palavras |
|---|---|---|---|---|---|
| 0:00–0:30 | Problema e cidadão | Integrante 1 | Imagine a Ana, agricultora familiar. Desde 2026, a lei manda gastar pelo menos 45% da verba federal da merenda com gente como ela. Antes era 30%. Em 2022, 1.531 municípios nem chegaram a isso. A Ana não sabe quando a prefeitura compra, não entende o edital e sozinha não fecha o pedido. | Power BI web, página 1 (PNAE no Brasil), filtro Ano = 2022. O cursor só para no cartão "Municípios abaixo do mínimo" (1.531) quando a voz diz "1.531" e depois desce para o ranking por município. A página mostra a fonte e o rótulo "dados preliminares". Sem cartela de abertura (seção 4); no máximo o nome do projeto, pequeno, no canto, nos 3 primeiros segundos. | 73 |
| 0:30–0:50 | Solução | Integrante 1 | A Merenda do Vizinho leva a chamada pública da prefeitura até o sítio. A IA lê o edital, a Ana vê quanto pode ganhar e a cooperativa junta os vizinhos. Sensores cuidam da qualidade, e um painel mostra quanto falta para a cidade chegar à meta. | App em `http://localhost:3000`, aba "Entrar". Login com `prefeitura@demo.br` e `demo1234`. Chega à tela da prefeitura (Chamadas), onde a chamada de Catalão já está publicada. | 44 |
| 0:50–1:06 | Demonstração: IA | Integrante 2 | Como prefeitura, subimos uma chamada pública real, de Catalão. O Claude lê o PDF e devolve a tabela. A nutricionista confere e corrige antes de publicar. | Tela da prefeitura: "Enviar PDF" e escolha de `04-go-catalao-2026.pdf`. A espera da leitura é cortada na edição. Surge a tabela de itens, com a origem "IA" e os avisos. O cursor passa pelos itens e clica num campo para editar. Não clicar em "Publicar": a chamada de Catalão já está publicada pela semente. | 26 |
| 1:06–1:20 | Demonstração: app | Integrante 2 | Agora a Ana, no celular. Em Oportunidades, ela vê quanto pode ganhar: R$ 21.082, *já dentro do limite de 40 mil reais por ano*. | Janela da Ana em modo celular (390 × 844), tela "Oportunidades". Cartão da chamada de Catalão com a quantidade e a unidade do edital, o ganho estimado em reais e o botão "Ouvir" (sem tocar). O cartão traz "seleção anterior, sem RITS": é esperado, não comente. | 27 |
| 1:20–1:32 | Demonstração: IA | Integrante 2 | Na dúvida, ela pergunta ao assistente, que explica o edital em frases curtas e lista os documentos que faltam. *Os dados do cadastro não vão para a IA.* | Toque em "Ver a chamada e o assistente": abre o assistente. A primeira resposta explica o prazo e os itens. A Ana digita quanto entrega por semana (por exemplo, "50 de alface por semana") e a resposta traz a sugestão e a lista de documentos. Toque em "Quero participar". | 26 |
| 1:32–1:48 | Demonstração: app | Integrante 2 | Agora a cooperativa. O app divide o pedido entre os vizinhos, *respeita o limite de cada um* e mostra o que falta. Um clique gera o projeto de venda, no modelo do FNDE. | Janela da cooperativa (`cooperativa@demo.br`). Na chamada de Catalão, "Proposta conjunta": a divisão entre os cooperados e o que falta. Clique em "Gerar projeto de venda" e rolagem lenta até o valor total (aparece "seleção anterior, sem RITS": esperado). | 33 |
| 1:48–1:57 | Demonstração: IoT | Integrante 3 | Um Arduino mede temperatura, peso e porta da câmara fria. Com a porta aberta, a temperatura sobe e o alerta aparece. | TinkerCad com a simulação rodando: abra a chave da porta e leve o sensor TMP36 acima de 10 °C. O LED acende e o buzzer toca (3 s). Corte para o terminal com o comando do simulador (seção 2) e as leituras saindo. Corte para a tela "Câmara fria", na janela da cooperativa: a faixa vermelha de alerta. | 21 |
| 1:57–2:01 | Demonstração: DevOps | Integrante 3 | Tudo isso sobe com um comando no Docker. | Terminal: `docker compose ps`, com app e ia no ar. Se o Jenkins rodar, 3 segundos na aba dele, com o último build verde (ver a nota abaixo da tabela). | 8 |
| 2:01–2:10 | Demonstração: dados | Integrante 3 | Os dados do app, dos sensores e do FNDE chegam ao Power BI *pelo data lake*. Ele mostra quem está abaixo do mínimo. | Power BI web, página 1, filtro UF = GO. Ranking por município com a faixa de cumprimento. | 23 |
| 2:10–2:40 | Impacto | Integrante 3 | Quem ganha? A Ana vende perto de casa, os alunos comem comida fresca e a prefeitura cumpre a lei. Se a regra de 45% valesse em 2022, faltariam R$ 244,8 milhões nas prefeituras abaixo dela. A solução atende aos ODS 2, 4 e 10: fome zero, educação de qualidade e menos desigualdade. | Power BI: limpe o filtro de UF e deixe Ano = 2022. O cartão "Faltaria com 45% (R$)" mostra 244,8 mi. Depois, a página 2 "Cooperativa", com o selo "dados simulados": renda por agricultor e entregas no prazo. | 68 |
| 2:40–2:55 | Fechamento | Integrante 1 | O Contrata+Brasil, do governo, só trata chamadas criadas nele. A gente completa, com quatro áreas integradas *e IA medida em 8 chamadas reais*. Merenda do Vizinho: a merenda da escola pode vir do sítio do vizinho. Obrigado! | Volta à janela da Ana, tela "Oportunidades", com o cartão do ganho. Opcional: cartela de fechamento só no "Obrigado!" (2 s). | 39 |
| **Total** | | | | | **388** |

**Se o Jenkins rodar (T16):** troque o bloco 1:57 por "Tudo isso sobe com um comando no Docker, e o Jenkins testa a cada mudança." (15 palavras, 7 a mais). Sem o Jenkins rodando, não diga isso.

**Palavras por parte do edital** (voz a 145 palavras por minuto):

| Parte | Tempo | Palavras | Voz | Janela |
|---|---|---|---|---|
| Problema | 0:00–0:30 | 73 | 30 s | 30 s |
| Solução | 0:30–0:50 | 44 | 18 s | 20 s |
| Demonstração | 0:50–2:10 | 164 | 68 s | 80 s |
| Impacto | 2:10–2:40 | 68 | 28 s | 30 s |
| Fechamento | 2:40–2:55 | 39 | 16 s | 15 s |
| **Total** | **2:55** | **388** | **2:40** | **2:55** |

- **Como contei:** com um script, bloco a bloco. Escritas são as palavras separadas por espaço (348). Faladas são as que a voz diz (388): "2026" vira "dois mil e vinte e seis", "R$ 244,8 milhões" vira "duzentos e quarenta e quatro vírgula oito milhões de reais", e "R$ 21.082" vira "vinte e um mil e oitenta e dois reais" (três palavras a mais que a estimativa anterior).
- **Onde aperta:** o Problema (30 de 30 s) e o Fechamento (16 de 15 s). A Solução e o Impacto têm uns 2 segundos de sobra cada um e a Demonstração, uns 12. Se o Problema passar de 0:30, a Solução absorve.
- **Ficaram fora da fala, de propósito:**
  - o modelo de negócio, que não pontua no vídeo e está no slide 9 e no white paper;
  - os números de 2019, trocados pelos de 2022, que o painel do projeto calcula;
  - "edital" não tem definição na fala do Problema. Se quem ouvir nos ensaios não entender, troque "o edital" por "as regras da compra" (+2 palavras).

## 2. Sequência exata da demonstração

### Antes de gravar

1. **Preparar o `.env`:** copiar `.env.example` para `.env` e preencher `ANTHROPIC_API_KEY`, `JWT_SEGREDO`, `CHAVE_SERVICO` e `CHAVE_DISPOSITIVO`. Acrescentar `DATA_REFERENCIA=2026-07-15`.
   - Essa data é o "hoje" do app nas oportunidades. A chamada de Catalão recebeu projetos de venda de 09/07 a 30/07/2026 e já fechou; sem a data, a Ana não veria nenhuma oportunidade (T6, T8, T9, T15).
   - O app não mostra aviso de "data de demonstração" no topo da tela. Isso não está no plano.
2. **Subir o sistema:** na raiz do repositório, `docker compose up --build`. O app fica em `http://localhost:3000`. A IA fica só na rede interna do Docker: a porta 3001 não é aberta no computador, de propósito (T15).
   - Conferir `docker compose exec app wget -qO- http://ia:3001/saude`. Tem de responder `"modo": "ia"`, sinal de que a chave está no `.env`. Se responder `"regras"`, não grave: a fala do bloco 0:50 diz que o Claude lê o PDF e a etiqueta da tabela mostraria "regras".
3. **Começar com o banco limpo:** `docker compose down -v` e subir de novo. Isso apaga só o banco de demonstração. A semente (T6 e T9) recria:
   - a prefeitura, a cooperativa e os seis agricultores, todos em Catalão (GO), os seis como cooperados da `cooperativa@demo.br`;
   - a chamada de Catalão, já publicada, com o interesse de cada um. A Ana planta alface e mandioca, que estão nela.
   - A chamada que a prefeitura envia ao vivo (passo 3 abaixo) entra como rascunho. Por isso não se clica em "Publicar": a lista da Ana não fica com a chamada repetida.
4. **Três perfis do navegador, um por papel.** O login fica guardado no navegador, então o mesmo perfil não segura dois papéis ao mesmo tempo. Por exemplo:
   - `chromium --user-data-dir=/tmp/demo-prefeitura http://localhost:3000`
   - `chromium --user-data-dir=/tmp/demo-ana http://localhost:3000`
   - `chromium --user-data-dir=/tmp/demo-cooperativa http://localhost:3000`
5. **Usuários de demonstração**, todos com a senha `demo1234`:
   - `prefeitura@demo.br`: o login aparece no vídeo;
   - `ana@demo.br`: já logada antes de gravar;
   - `cooperativa@demo.br`: já logada antes de gravar, com a tela "Câmara fria" aberta numa segunda aba.
6. **Janela da Ana em modo celular:** abrir as ferramentas do navegador (F12), ligar a barra de dispositivo e escolher 390 × 844. Nas outras janelas, zoom de 125%.
7. **PDF à mão:** `ia/avaliacao/chamadas/04-go-catalao-2026.pdf` (T5), a Chamada Pública nº 003/2026 de Catalão (GO). Tem 15 páginas, uma tabela padrão de 16 itens e cita a Res. CD/FNDE 4/2026. É a mesma chamada de `ia/tests/fixtures/chamada-real.pdf`.
8. **Nome de pessoa na tela:** o edital de Catalão cita uma servidora pelo nome, como contato. Se a extração trouxer esse nome no campo de contato, troque por "Departamento de Licitação e Contratos" na conferência, ou deixe o campo fora do quadro. Nenhum nome de pessoa aparece no vídeo.
9. **Terminal:** fonte grande (20 pt ou mais), aberto na raiz do repositório. Antes, carregar a chave do dispositivo com `set -a; source .env; set +a`. O `.env` nunca aparece na tela. Deixar o comando do simulador já digitado, sem rodar.
10. **TinkerCad:** circuito da câmara fria aberto, com a simulação já iniciada (T10).
11. **Power BI web:**
    - relatório aberto na página 1, filtros limpos;
    - a página 1 tem uma caixa de texto com a fonte ("Fonte: FNDE, dados abertos. Cálculo do grupo.") e mostra "dados preliminares" em 2022;
    - a página 2 tem uma caixa de texto "Dados simulados" e fica numa segunda aba (T14).
12. **Limpar a área de trabalho:** modo "não perturbe", outras abas e programas fechados, barra de favoritos escondida.

### Conferir antes de gravar

- **Power BI, Ano = 2022, sem filtro de UF:**
  - "Municípios abaixo do mínimo" tem de mostrar 1.531, o mesmo número da fala;
  - "Faltaria com 45% (R$)" tem de mostrar 244,8 milhões;
  - "% AF" mostra 44,5%.
  - Se o seu painel mostrar outro número, acerte o pipeline antes de gravar. Não troque a fala sem conferir.
- **Por que 1.531 e não 1.604:** o 1.531 conta só prefeituras e deixa de fora as linhas com repasse zero (42) ou valor não numérico. O painel do FNDE conta 1.604. A diferença é de 73. As 42 linhas com repasse zero são uma causa provável, mas 42 é menos que 73, então não explicam tudo (`pesquisa/dados-abertos.md`, seção 6).
- **Por que 44,5% e não 45,15%:** o 44,5% é o cálculo do grupo e o 45,15% é o que o painel do FNDE mostra. A diferença vem, provavelmente, das mesmas linhas com repasse zero, que o cálculo do grupo deixa de fora (`dados-abertos.md`, seção 6).
- **O que cada número conta:** o 44,5% é o percentual nacional, sobre todas as entidades (prefeituras e secretarias estaduais). O 1.531, o R$ 97,1 milhões e o R$ 244,8 milhões contam só prefeituras.
- **Ana:** a tela "Oportunidades" mostra o cartão de Catalão e, na tela da chamada, o botão "Quero participar" está ligado (ele fica desligado se o perfil não tem cooperativa).

### Passo a passo durante a gravação

| Passo | Tempo | Onde | Ação | O que tem de aparecer | Tarefa do plano |
|---|---|---|---|---|---|
| 1 | 0:00 | Power BI, página 1 | Filtrar Ano = 2022 | Cartões de % da agricultura familiar e de municípios abaixo do mínimo (1.531) | T13, T14 |
| 2 | 0:30 | App, perfil da prefeitura | Aba "Entrar": `prefeitura@demo.br` e `demo1234` | Tela da prefeitura (Chamadas), com a chamada de Catalão já publicada | T6, T9 |
| 3 | 0:50 | App, prefeitura | Enviar `04-go-catalao-2026.pdf`, conferir e editar um campo. Não clicar em "Publicar" | Tabela de itens com a origem "IA"; corte na espera | T3, T9 |
| 4 | 1:06 | App, perfil da Ana | Abrir "Oportunidades" | Cartão de Catalão com o ganho estimado e o aviso "seleção anterior, sem RITS" | T7, T8 |
| 5 | 1:20 | App, Ana | Tocar no cartão, digitar quanto entrega por semana, tocar em "Quero participar" | Resposta curta, sugestão e lista de documentos | T4, T8 |
| 6 | 1:32 | App, perfil da cooperativa | "Proposta conjunta" da chamada de Catalão, depois "Gerar projeto de venda" | Divisão entre os cooperados, o que falta e a página do projeto de venda | T7, T9 |
| 7 | 1:48 | TinkerCad | Abrir a chave da porta e levar o TMP36 acima de 10 °C | LED e buzzer ligados | T10 |
| 8 | 1:51 | Terminal | `python3 iot/simulador.py --cenario porta-aberta --quantidade 15 --intervalo 1` | Leituras saindo, uma por segundo, com o status 201 | T10 |
| 9 | 1:54 | App, cooperativa | Tela "Câmara fria" | Faixa vermelha de alerta de temperatura | T11 |
| 10 | 1:57 | Terminal | `docker compose ps` | app e ia no ar | T15 |
| 11 | 2:01 | Power BI, página 1 | Filtrar UF = GO | Ranking por município e faixa de cumprimento | T14 |
| 12 | 2:10 | Power BI | Limpar o filtro de UF, Ano = 2022, cartão "Faltaria com 45% (R$)"; depois a página 2 | 244,8 mi; renda por agricultor e entregas no prazo, com o selo "dados simulados" | T14 |
| 13 | 2:40 | App, Ana | Voltar a "Oportunidades" | Cartão com o ganho | T8 |

### O que a demonstração pede do plano técnico

Estes pontos do plano existem por causa do vídeo. Confira cada um quando o app estiver de pé:

| O que o vídeo precisa | Onde está no plano | Como conferir |
|---|---|---|
| O alerta de temperatura aparece. | T10 e T11 (passo 4): `--quantidade 15 --intervalo 1`. O cenário começa em 5 °C e sobe 0,4 °C por leitura, então a 14ª leitura chega a 10,2 °C, acima do limite de 10 °C. | Rodar uma vez antes e ver a faixa vermelha. O alerta de porta (2 minutos aberta) não aparece nessa demonstração curta. No TinkerCad, o LED também só acende com temperatura acima de 10 °C ou porta aberta por mais de 2 minutos; por isso o roteiro manda subir o TMP36. |
| A chamada de Catalão aparece como aberta. | `DATA_REFERENCIA` (T6, T8, T9 e T15). | `.env` com `DATA_REFERENCIA=2026-07-15`; a Ana vê o cartão. |
| Todos os usuários em Catalão, a Ana planta alface e mandioca, a chamada semeada está publicada. | Semente da T6 e da T9. | Entrar como a Ana e como a cooperativa. |
| O cartão de 244,8 milhões e o de 1.531. | T13 (números de 2022 nos testes) e T14 (`Faltaria com 45% (R$)` e `Municípios abaixo do mínimo`, só da esfera municipal). | Seção "Conferir antes de gravar". |
| O aviso "seleção anterior, sem RITS". | T7, T8 e T9. O edital de Catalão é anterior a 23/10/2026. | Aparece no cartão e no projeto de venda. É esperado. Não fale de RITS no vídeo. |

**O que o plano não entrega, e o roteiro não usa:**
- aviso de "data de demonstração" no topo da tela;
- tempo de leitura da IA na tela da prefeitura. O serviço de IA mede `duracao_ms`, mas a rota e a tela da T9 só trazem a origem e os avisos. Se quiser mostrar "lido em X s", acrescente isso à T9;
- linha da meta de 45% no ranking do Power BI. Depende do guia da T14; o roteiro usa a faixa de cumprimento;
- a caixa de fonte na página 1 e o selo "dados simulados" na página 2 do Power BI: são caixas de texto que você põe no relatório.

## 3. Números usados

Os números de 2022 saem de `planejamento/pesquisa/dados-abertos.md`, seção 6. Os outros saem de `planejamento/pesquisa/fatos-pnae.md`.

| Número | O que é | Ano | Fonte | Onde aparece |
|---|---|---|---|---|
| 45% | Mínimo da verba federal do PNAE para a compra direta da agricultura familiar | desde 01/01/2026 | Lei 11.947/2009, art. 14, redação da Lei 15.226/2025 | Fala 0:00 e 2:10; slides 2, 5, 8, 9 |
| 30% | Mínimo anterior | até 2025 | Lei 11.947/2009, redação original e da Lei 14.660/2023 | Fala 0:00; slides 2 e 8 |
| 1.531 | Prefeituras abaixo de 30%. Conta só prefeituras e deixa de fora as linhas com repasse zero ou valor não numérico. O painel do FNDE conta 1.604 | 2022 | Cálculo do grupo com dados abertos do FNDE, 2022, dados preliminares | Fala 0:00; Power BI; slide 2 |
| 44,5% | Percentual nacional da verba do PNAE gasto com a agricultura familiar, sobre todas as entidades (prefeituras e secretarias estaduais) | 2022 | Cálculo do grupo com dados abertos do FNDE, 2022, dados preliminares (o painel do FNDE mostra 45,15%) | Power BI; slide 2 |
| R$ 244,8 milhões | Quanto faltaria para as prefeituras abaixo de 45% chegarem lá, se a regra nova valesse em 2022 (simulação; só prefeituras) | 2022 | Cálculo do grupo com dados abertos do FNDE, 2022, dados preliminares | Fala 2:10; Power BI; slide 8 |
| R$ 97,1 milhões | Quanto faltou para as prefeituras chegarem a 30% (só prefeituras) | 2022 | Cálculo do grupo com dados abertos do FNDE, 2022, dados preliminares | Só no Power BI ("Faltou para o mínimo (R$)") |
| Sul 69,4%, Norte 51,0%, Sudeste 41,4%, Centro-Oeste 39,0%, Nordeste 38,6% | Parte da verba gasta com a agricultura familiar, por região. São os valores do painel (69,43%, 51,04%, 41,39%, 38,96% e 38,64%) com uma casa decimal | 2022 | Painel do FNDE "Aquisição da Agricultura Familiar no PNAE – 2011 a 2022", dados preliminares (`dados-abertos.md`, seção 6, "Outros números do painel") | Slide 8 |
| 76,8% (3.897.408 de 5.073.324) | Estabelecimentos agropecuários da agricultura familiar | 2017 | IBGE, Censo Agropecuário 2017, SIDRA tabela 6778 | Slide 2 |
| R$ 40 mil | Limite de venda por agricultor, por ano civil, para cada entidade executora | 2026 | Res. CD/FNDE 4/2026, art. 38, redação da Res. 17/2026 | Fala 1:06 (itálico); app |
| 05/05/2026 | Entrada do PNAE no Contrata+Brasil, com uso opcional | 2026 | Res. CD/FNDE 6/2026; release do MEC reproduzido pela Fenacon | Slide 4 |
| R$ 6,7 bilhões | Orçamento do PNAE | 2026 | Agência Gov, 19/02/2026, com dados do FNDE | Slide 9 |
| Cerca de 38 milhões | Alunos atendidos pelo PNAE | 2025 | FNDE, Relatório de Gestão 2025, p. 163 | Slide 9 |
| 8 chamadas reais, 5 estados, 4 regiões | Conjunto de avaliação da IA | 2025 e 2026 | `ia/avaliacao/chamadas/` (T5); origem de cada chamada em `pesquisa/chamadas/indice.md`. Só vale depois que a avaliação rodar | Fala 2:40 (itálico); slide 7 |

- **Não usei:**
  - os percentuais de 2019 (36,9% e 37,3% do Ipea), trocados pelos de 2022;
  - o R$ 1,60 bilhão comprado em 2022, para não encher de números;
  - o R$ 461,3 milhões, que é a falta para 45% somando também as secretarias estaduais em 2022. Está no plano (T13 e T14), conferi por script e não está em `dados-abertos.md`. Se perguntarem, a resposta é que o R$ 244,8 milhões conta só as prefeituras.
- **Fora desta conta:** valores técnicos do plano, como 10 °C, 2 minutos e as 15 leituras do simulador. Não são fatos do PNAE.

### ODS de cada parte

| Parte da solução | ODS | Por quê |
|---|---|---|
| IA lê a chamada e o assistente explica o edital | 10, redução das desigualdades | O pequeno produtor entende e alcança a compra pública, que antes ficava com quem sabe ler edital |
| Oportunidades e "quanto pode ganhar" | 2, fome zero e agricultura sustentável | Renda para a agricultura familiar perto de casa |
| Cooperativa junta vizinhos e gera o projeto de venda | 2 e 10 | Quem planta pouco vende junto, e a venda chega a mais famílias |
| Câmara fria com sensores | 2 e 4, educação de qualidade | Alimento conservado e seguro na merenda dos alunos |
| Painel do mínimo de 45% | 4 e 10 | A prefeitura vê onde a merenda local não chega e corrige; o estado vê quais municípios apoiar |

## 4. Como gravar

**Imagem**
- 1920 × 1080, 30 quadros por segundo, em MP4.
- O OBS Studio grava a tela inteira e é gratuito no Linux.
- Zoom de 125% nas telas de computador e modo celular na janela da Ana, para ler no celular de quem assiste.

**Áudio**
- Microfone de fone ou USB, a um palmo da boca, em sala silenciosa.
- Grave 10 segundos de teste e ouça antes.
- O mais fácil é gravar a tela primeiro e a voz depois, cada integrante no seu bloco, e juntar na edição. O tempo fica mais fácil de acertar.
- Volume parecido entre as vozes, sem música por baixo.
- Ritmo calmo, de 140 a 150 palavras por minuto. Nos blocos da demonstração, pare um instante depois de cada resultado, para quem assiste ver a tela.

**O que deixar aberto**
- As três janelas do navegador (prefeitura, Ana, cooperativa).
- O Power BI com as páginas 1 e 2.
- O TinkerCad com a simulação rodando.
- O terminal com o comando do simulador já digitado.
- O PDF de Catalão numa pasta fácil de achar.
- Nada com dado pessoal: nem `.env`, nem e-mail, nem conversa. Se o canto do Power BI ou do TinkerCad mostrar o seu nome, corte na edição se não quiser aparecer.

**Ensaio cronometrado**
- Faça três passadas com o app rodando:
  1. para pegar o ritmo;
  2. com cronômetro, conferindo cada bloco contra a coluna "Tempo";
  3. já gravando.
- Se a segunda passar de 2:50, corte os itálicos na ordem da seção 1.
- Decore as ideias, não as palavras. O capítulo de Pitch avisa que quem decora palavra por palavra trava quando esquece uma.

**Edição**
- Corte as esperas: a leitura da IA e as leituras do simulador. Não acelere as telas.
- Se a tela da prefeitura mostrar o tempo de leitura da IA, deixe visível. O plano só garante a origem e os avisos.
- Duração final de até 2:55.

**Cartelas de abertura e fechamento: vale a pena?**
- A regra do edital é "nada de vídeo em formato de slides ou leitura de texto da tela".
- **A favor:** uma cartela de até 3 segundos só com o nome e a frase de efeito é comum em vídeo e não transforma o vídeo em slides.
- **Riscos:**
  - um avaliador rígido pode ver qualquer tela parada como slide;
  - cada cartela gasta segundos do tempo que pontua;
  - se a voz ler o texto da cartela, cai exatamente em "leitura de texto da tela".
- **Recomendação:**
  - Abertura: sem cartela. O vídeo começa no painel, com a voz. Se quiser o nome, ponha o nome pequeno no canto sobre o painel nos 3 primeiros segundos.
  - Fechamento: a cartela pode entrar por 2 segundos, só no "Obrigado". A frase do projeto já foi dita antes, então a voz não lê a cartela.
  - Nunca leia o texto da cartela.
- Os arquivos estão em `apresentacao/cartela-abertura.png` e `apresentacao/cartela-fechamento.png`.

## 5. Checklist de publicação

- [ ] O vídeo tem até 3:00 no player (meta: 2:50 a 2:55).
- [ ] O link está aberto:
  - YouTube: "Não listado" ou "Público", nunca "Privado";
  - Google Drive: "Qualquer pessoa com o link" como leitor;
  - Vimeo: "Qualquer pessoa".
- [ ] O processamento terminou: a qualidade 1080p já aparece no player. No Drive, o vídeo novo leva alguns minutos para tocar.
- [ ] Testado numa aba anônima, sem login, do começo ao fim e com som. Testado também no celular, fora do Wi-Fi de casa.
- [ ] O link está em `entrega/grupo.txt`, no campo "Link do pitch:".
- [ ] O link está no `README.md`, na seção "Link do pitch".
- [ ] O link do `.txt` e o do README são iguais: copie de cada arquivo e cole na aba anônima.
- [ ] Depois de enviar, ninguém apaga, troca ou fecha o vídeo até sair a nota.

## 6. Por que merece vencer

### Os 4 critérios de nota do pitch (5 pontos)

| Critério | Pontos | Onde o roteiro cobre |
|---|---|---|
| Problema e cidadão | 1 | 0:00: a Ana, a lei de 45% (contexto de mudança) e um dado real, os 1.531 municípios de 2022. |
| Demonstração das áreas | 2 | 0:50 a 2:10, com o app rodando e sem slide: IA (leitura da chamada e assistente), app (a Ana e a cooperativa), IoT (TinkerCad, simulador e alerta), dados (Power BI) e DevOps (Docker). |
| Impacto e diferencial | 1 | 2:10: quem ganha, o R$ 244,8 milhões e os ODS 2, 4 e 10. 2:40: o que o Contrata+Brasil não cobre e o que a gente completa. |
| Clareza e tempo | 1 | Meta de 2:50, ritmo de 145 palavras por minuto, frases curtas e poucos números por frase, com a Ana de fio da história. |

### Os 4 diferenciais do edital

Eles não somam pontos, mas pesam na escolha do vencedor.

| Diferencial | Como aparece no vídeo | Estado |
|---|---|---|
| Áreas integradas | A mesma chamada de Catalão passa pela IA, pela Ana e pela cooperativa; as leituras da câmara fria e as entregas do app vão para o data lake e chegam ao Power BI (T12, T13). | Para o painel mostrar as leituras da gravação de verdade, rode o pipeline depois do simulador e suba o novo `.xlsx` (T15, passo 4). Sem isso, a página 2 é simulada e fica marcada assim. |
| Pipeline ponta a ponta | "Tudo sobe com um comando no Docker." Com o Jenkins rodando, soma-se "e o Jenkins testa a cada mudança". | O Jenkins é da T16 e entra só se couber no tempo. |
| IA medida | O trecho em itálico do fechamento: 8 chamadas reais, de 5 estados e 4 regiões (sem o Norte), contra um gabarito conferido com o texto de cada PDF, comparando o Claude com o modo de regras. | Resultado medido (T5, 228 itens): o Claude acerta 95,6% dos itens contra 56,1% no modo de regras, 100% das quantidades e preços (61,4% nas regras) e 100% dos prazos (37,5% nas regras). Fala sugerida: "IA que acerta 95,6% dos itens em 8 chamadas reais". |
| Validado com gente real | **SÓ SE O GRUPO FIZER DE VERDADE:** "Conversamos com (papel, sem nome) e ouvimos (uma frase)." Entra no fechamento no lugar do trecho da IA medida, com uma frase de tamanho parecido. | Se o grupo não conversar, apague esta linha. Nada aqui pode ser inventado, nem a pessoa nem a frase. |

Por fim, o projeto parte de uma regra nova (45% desde 2026) e se posiciona como complemento do Contrata+Brasil, que é opcional e só trata as chamadas criadas nele. O projeto cobre o que a plataforma federal não faz, pelo que li dos tutoriais e do edital dela (`fatos-pnae.md`, seção 4): ler chamadas em PDF, juntar vizinhos, gerar o projeto de venda no modelo do FNDE, cuidar da câmara fria e mostrar o mínimo legal.
