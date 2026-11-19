# Plano de testes

Cada caso abaixo diz o que o teste confere, como, o que deve acontecer, o resultado e onde está a prova. Todos os casos
têm um teste automatizado, que roda sozinho a cada commit no Jenkins (veja o CT15).

**Resumo da última execução (19/11/2026, na versão final):** 15 casos, 15 passaram. Nos testes automatizados, 260 de 260
passaram: 131 no app, 87 na IA, 27 nos dados e 15 no simulador. O Jenkins roda tudo isso a cada commit; como subir o
Jenkins local está em [jenkins/README.md](jenkins/README.md).

## Como rodar

Da raiz do repositório, depois de preparar o `.venv` e o `npm ci` (seção 2B do README):

```bash
(cd app && npm test)                                            # app: node --test (antes, o vite build gera as telas)
.venv/bin/python -m unittest discover -s ia/tests -t . -v       # IA
.venv/bin/python -m unittest discover -s dados/tests -t . -v    # pipeline de dados
.venv/bin/python -m unittest discover -s iot -t . -v            # simulador da câmara fria
devops/smoke.sh                                                 # teste de fumaça com o Docker Compose
```

A saída completa da execução está em `devops/evidencias/testes.txt`. Os testes nunca chamam a API da Anthropic: o
Claude é trocado por um cliente falso, e sem `ANTHROPIC_API_KEY` a IA roda no modo de regras.

## Casos

### CT01: login errado, rota sem token e token falso devolvem 401

- **Objetivo:** só entra quem tem um login válido.
- **Passos:** 1) `POST /api/login` com a senha errada; 2) `GET /api/eu` sem token; 3) `GET /api/eu` com um token
  vencido, com um token de outro algoritmo e com o token certo.
- **Esperado:** 401 nos casos errados e 200 com o token certo.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt` e `devops/evidencias/seguranca.txt` (itens 1.1 a 1.4).
- **Teste automatizado:** `app/test/auth.test.js`: "cadastro com e-mail inválido devolve 400; login errado 401;
  /api/eu sem token 401 e com token 200" e "token vencido e token de outro algoritmo recebem 401; o certo recebe 200".

### CT02: papel errado devolve 403

- **Objetivo:** cada papel (agricultor, cooperativa e prefeitura) usa só as suas rotas.
- **Passos:** 1) entrar como prefeitura e chamar uma rota do agricultor; 2) entrar como agricultor e chamar uma rota
  da prefeitura; 3) conferir que o banco não mudou.
- **Esperado:** 403 nas duas chamadas, e nada gravado.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt` e `devops/evidencias/seguranca.txt` (item 1.5).
- **Teste automatizado:** `app/test/agricultor.test.js`: "prefeitura não acessa rota de agricultor (403)";
  `app/test/prefeitura-cooperativa.test.js`: "agricultor não acessa rota de prefeitura (403)";
  `app/test/auth.test.js`: "exigirPapel responde 403 para outro papel e a lista de manipuladores para ali".

### CT03: CPF inválido no cadastro do agricultor devolve 400

- **Objetivo:** o app só grava CPF com os dígitos verificadores certos, e só depois do aceite do termo de uso dos dados.
- **Passos:** 1) `PUT /api/agricultor/perfil` com um CPF de dígitos errados, com um CPF de números todos iguais e com
  um CAF fora do formato; 2) o mesmo pedido sem o aceite do termo; 3) um pedido válido.
- **Esperado:** 400 com a mensagem em português nos inválidos, sem gravar nada; 200 no válido.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt` e `devops/evidencias/seguranca.txt` (item 2.1).
- **Teste automatizado:** `app/test/agricultor.test.js`: "perfil com CPF inválido ou sem aceite devolve 400";
  `app/test/validacao.test.js`: "validarCpf".

### CT04: CPF e CAF aparecem mascarados

- **Objetivo:** a tela nunca recebe o CPF nem o CAF inteiros.
- **Passos:** 1) salvar o perfil com CPF e CAF; 2) `GET /api/agricultor/perfil`.
- **Esperado:** `"cpf":"***.456.789-**"` e `"caf":"****5CAF"`; o número inteiro não aparece na resposta.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt` e `devops/evidencias/seguranca.txt` (item 3.1).
- **Teste automatizado:** `app/test/agricultor.test.js`: "GET perfil devolve CPF e CAF mascarados; cooperativa
  inexistente devolve 400"; `app/test/validacao.test.js`: "validarCaf, validarEmail e as máscaras".

### CT05: sem a chave da Anthropic, a IA lê a chamada pelas regras

- **Objetivo:** a leitura da chamada funciona sem a IA paga, e a resposta diz que veio das regras.
- **Passos:** 1) subir o servidor da IA sem `ANTHROPIC_API_KEY`; 2) `POST /extrair-chamada` com o texto da chamada de
  exemplo (`ia/tests/fixtures/chamada-exemplo.txt`); 3) ler o PDF da chamada real de Catalão.
- **Esperado:** 200 com `origem: "regras"` e os 5 itens da chamada de exemplo (alface: 1.200 kg a R$ 5,40), com
  município e UF; os 16 itens da chamada de Catalão.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt`.
- **Teste automatizado:** `ia/tests/test_servidor.py`: `test_extrair_chamada_por_texto`, `test_saude_no_modo_de_regras`
  e `test_sem_chave_nao_ha_cliente`; `ia/tests/test_regras.py`: `test_regras_extraem_itens_da_chamada_de_exemplo` e
  `test_regras_leem_os_16_itens_da_chamada_real_de_catalao`.

### CT06: a chamada aparece para quem produz o item e some para quem não produz

- **Objetivo:** o agricultor vê só as chamadas abertas da UF dele com algum item que ele produz.
- **Passos:** 1) chamadas de outra UF, vencida e só com itens que ele não produz; 2) uma chamada publicada da mesma UF
  com alface; 3) uma chamada ainda em rascunho.
- **Esperado:** só a chamada publicada da mesma UF com alface aparece, com ganho = mínimo entre a capacidade e o pedido,
  vezes o preço.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt`.
- **Teste automatizado:** `app/test/casamento.test.js`: "chamada de outra UF, vencida ou só com itens que ele não
  produz não aparece" e "mesma cidade primeiro e ganho = min(capacidade, pedido) × preço";
  `app/test/agricultor.test.js`: "oportunidades mostra chamada publicada da mesma UF com alface".

### CT07: a proposta conjunta nunca passa do pedido, da capacidade nem do limite anual

- **Objetivo:** a divisão da cooperativa respeita as regras do PNAE e avisa o que falta.
- **Passos:** 1) dividir um pedido entre agricultores; 2) 500 sorteios de pedidos, capacidades e limites; 3) um pedido
  que ninguém consegue atender.
- **Esperado:** nenhuma divisão passa do pedido, da capacidade de cada um nem do limite de R$ 40 mil por agricultor no
  ano; a falta aparece quando falta.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt`.
- **Teste automatizado:** `app/test/agrupamento.test.js`: "nunca passa do pedido, da capacidade nem do limite em reais
  (500 sorteios)", "informa falta quando ninguém tem capacidade" e "o limite anual vale para a soma dos itens";
  `app/test/prefeitura-cooperativa.test.js`: "proposta conjunta nunca passa do pedido" e "alocação acima do teto, ou
  total do agricultor acima do limite restante, devolve 400".

### CT08: o projeto de venda tem os totais certos

- **Objetivo:** o projeto de venda soma quantidade vezes preço, em centavos, com os campos que a prefeitura exige.
- **Passos:** gerar o projeto de venda da cooperativa e o individual do agricultor.
- **Esperado:** cada linha é a quantidade vezes o preço, arredondada ao centavo; o total é a soma das linhas; aviso
  quando a família não tem mulher titular.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt`.
- **Teste automatizado:** `app/test/projeto-venda.test.js`: "projeto de venda soma quantidade × preço", "cada linha
  sai em centavos e os totais somam as linhas arredondadas" e "projeto de venda avisa quando a família não tem mulher
  titular"; `app/test/prefeitura-cooperativa.test.js`: "projeto de venda tem totais certos" e "agricultor gera o
  projeto de venda individual a partir do interesse".

### CT09: leitura inválida da câmara fria devolve 400, e calor ou porta aberta geram alerta

- **Objetivo:** o app recusa leitura sem a chave ou absurda e avisa quando a câmara esquenta ou a porta fica aberta.
- **Passos:** 1) `POST /api/leituras` com a chave errada; 2) com temperatura de 999 °C e porta "sim"; 3) leituras
  acima de 10 °C; 4) porta aberta por mais de 2 minutos; 5) o simulador no cenário porta-aberta.
- **Esperado:** 401; 400 sem alerta; alerta de temperatura; alerta de porta; o alerta não se repete e fecha quando a
  leitura volta ao normal; no simulador, a temperatura passa de 10 °C no passo 13.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt`, `devops/evidencias/seguranca.txt` (itens 2.4 e 2.5) e
  `devops/evidencias/smoke.txt` (5 leituras com resposta 201).
- **Teste automatizado:** `app/test/iot.test.js`: "chave errada devolve 401", "leitura absurda devolve 400 e não
  alerta", "temperatura acima de 10 °C gera alerta de temperatura", "porta aberta por mais de 2 minutos gera alerta de
  porta" e "alerta não se repete a cada leitura e é resolvido quando volta ao normal"; `iot/test_simulador.py`:
  `test_porta_aberta_cruza_o_limite_de_10_graus_no_passo_13` e `test_sai_com_1_se_algum_status_nao_for_201`.

### CT10: o pipeline de dados gera as três camadas, com os números do FNDE e sem dado pessoal

- **Objetivo:** o pipeline monta raw, trusted e refined; os números batem com os do FNDE; o trusted não tem CPF, CAF
  nem nome.
- **Passos:** rodar `python -m dados.pipeline tudo` sem internet (com a cópia versionada das fontes públicas) e com uma
  exportação do app que traz dados pessoais de propósito.
- **Esperado:** 6 tabelas no trusted e 6 abas no `.xlsx`; em 2022, 44,50% de compra da agricultura familiar no país e
  1.531 prefeituras abaixo de 30% (os números de referência de `dados/datalake/README.md`); nenhuma coluna `cpf`, `caf`,
  `nome`, `email` ou `agricultor_id` no trusted.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt` e `devops/evidencias/smoke.txt` (o pipeline rodando no Docker).
- **Teste automatizado:** `dados/tests/test_pipeline.py`:
  `test_tudo_offline_cria_as_tres_camadas_e_o_xlsx_com_as_seis_abas`, `test_numeros_de_referencia_de_2022`,
  `test_trusted_sem_cpf_caf_nome` e `test_minimo_de_30_ate_2025_e_de_45_a_partir_de_2026`.

### CT11: a exportação para o data lake exige a chave de serviço e não leva dado pessoal

- **Objetivo:** só o pipeline, com a chave de serviço, lê a exportação, e o agricultor sai como pseudônimo.
- **Passos:** 1) `GET /api/exportar` sem a chave e com chaves erradas (do mesmo tamanho, mais curta, mais longa e
  vazia); 2) com a chave certa, com nome, e-mail, CPF, CAF e grupo prioritário no banco.
- **Esperado:** 401 sem a chave certa; com ela, 200 sem nome, CPF, CAF, e-mail, telefone, grupo prioritário nem id do
  agricultor, que aparece só como um pseudônimo (HMAC-SHA256 do id).
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt` e `devops/evidencias/seguranca.txt` (itens 3.3 e 3.4).
- **Teste automatizado:** `app/test/exportacao.test.js`: "GET /api/exportar: 401 sem a chave ou com outra (igual, mais
  curta, mais longa ou vazia); com a certa, 200", "a exportação não traz nome, CPF, CAF, e-mail, telefone, grupo
  prioritário nem id de agricultor" e "pseudonimo: 12 hexadecimais do HMAC-SHA256 do id; estável, e diferente por id e
  por segredo".

### CT12: a IA não recebe os dados cadastrados, e o chat barra dado pessoal digitado

- **Objetivo:** para a IA vão só município, UF, produtos, orgânico e se há prioridade; CPF, e-mail, telefone ou dados
  do banco escritos no chat são barrados.
- **Passos:** 1) uma agricultora com CPF, CAF e grupo prioritário salvos pergunta ao assistente, e a IA falsa guarda
  o que recebeu; 2) uma mensagem com CPF ou e-mail; 3) no servidor da IA, um texto com CPF, e-mail, telefone ou banco.
- **Esperado:** a IA recebe só o perfil mínimo; 400 antes de chamar a IA quando há dado pessoal; quantidade e preço
  passam.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt` e `devops/evidencias/seguranca.txt` (item 3.2).
- **Teste automatizado:** `app/test/agricultor.test.js`: "assistente não envia dados pessoais para a IA", "assistente:
  CPF ou e-mail no texto e mensagens fora do formato dão 400 sem chamar a IA; chamada não publicada 404" e
  "perfilParaIa: só município, UF, produtos, orgânico e se há prioridade, sem dado pessoal nem critério do RITS";
  `ia/tests/test_assistente.py`:
  `test_post_assistente_com_dado_pessoal_no_texto_devolve_400_e_quantidade_ou_preco_passa` e
  `test_pedido_leva_esforco_baixo_a_conversa_e_so_o_perfil_minimo`.

### CT13: envio grande demais devolve 413, e JSON quebrado devolve 400

- **Objetivo:** o app recusa um envio acima do limite sem ler tudo, e recusa JSON quebrado.
- **Passos:** 1) `POST` com mais de 256 KB; 2) `Content-Length` declarado acima do limite; 3) corpo em pedaços acima
  do limite; 4) JSON quebrado ou que não é objeto; 5) na IA, um corpo de mais de 10 MB.
- **Esperado:** 413 e a conexão fechada; 400 no JSON quebrado; 413 na IA.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/testes.txt` e `devops/evidencias/seguranca.txt` (itens 2.2 e 2.3).
- **Teste automatizado:** `app/test/roteador.test.js`: "corpo acima do limite devolve 413 e JSON quebrado devolve
  400", "Content-Length declarado acima do limite devolve 413 na hora, sem ler o corpo, e a conexão fecha" e "corpo:
  256 KB por padrão, e só POST /api/prefeitura/chamadas aceita até 10 MB"; `ia/tests/test_servidor.py`:
  `test_corpo_de_mais_de_10_mb_devolve_413`.

### CT14: teste de fumaça com o Docker Compose

- **Objetivo:** as imagens sobem juntas e conversam umas com as outras.
- **Passos:** `devops/smoke.sh`: 1) build e subida do app e da IA; 2) app e IA respondem 200; 3) a Ana entra e pergunta
  ao assistente (o app chama a IA); 4) o simulador manda 5 leituras com a porta aberta; 5) o pipeline de dados roda com
  a exportação do app; 6) os serviços descem.
- **Esperado:** 200 nos dois serviços, 200 do assistente com a origem `regras` (`ia` também vale, se houver chave),
  5 respostas 201, o pipeline com as três camadas e `SMOKE OK`.
- **Resultado:** passou, numa cópia limpa do repositório e em cada execução do Jenkins.
- **Evidência:** `devops/evidencias/smoke.txt`.
- **Teste automatizado:** `devops/smoke.sh` (a etapa "Smoke" do `Jenkinsfile`).

### CT15: pipeline de ponta a ponta no Jenkins

- **Objetivo:** um commit novo dispara, sem passo manual, os testes, o build das imagens e o smoke.
- **Passos:** 1) subir o Jenkins (`devops/jenkins/README.md`); 2) fazer um commit no ramo do job; 3) esperar até 2
  minutos.
- **Esperado:** uma execução iniciada pela mudança no repositório ("Started by an SCM change"), com as seis etapas
  verdes: Checkout, Testes Node (app), Testes Python (ia, dados e iot), Build das imagens, Smoke e Arquivar evidências.
- **Resultado:** passou.
- **Evidência:** `devops/evidencias/jenkins.png`.
- **Teste automatizado:** `Jenkinsfile`.
