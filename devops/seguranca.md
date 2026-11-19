# Segurança

O Merenda do Vizinho guarda dados de agricultores (CPF, CAF, renda da venda) e fala com uma IA paga. Por isso, três
práticas de segurança, cada uma com a prova abaixo: a saída dos comandos está em `devops/evidencias/seguranca.txt`, e
os testes automatizados de cada uma estão no `devops/plano-de-testes.md` (CT01 a CT04 e CT09 a CT13).

## Como gerar a evidência

1. Suba o app com um banco novo (a semente cria os usuários de demonstração e publica a chamada de Catalão, a de id 1):
   `docker compose up -d` ou `cd app && npm start`.
2. Na raiz do repositório, carregue o `.env` no shell e diga onde está o app:
   `set -a; . ./.env; set +a` e `APP=http://localhost:3000`.
3. Rode os comandos de cada prática, na ordem (o 1.4 guarda o token que os seguintes usam).

## 1. Autenticação e autorização

- A senha é guardada com `scrypt` (do `node:crypto`), com sal aleatório de 16 bytes, e conferida em tempo constante
  (`app/src/auth.js`).
- O login devolve um JWT HS256 que vale 8 horas. O app só aceita HS256: um token sem assinatura (`alg: none`), de outra
  chave ou vencido dá 401.
- Cada rota diz quais papéis a usam (`exigirPapel`): papel errado dá 403.

```bash
# 1.1 senha errada: 401
curl -s -w ' -> HTTP %{http_code}\n' -X POST $APP/api/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@demo.br","senha":"senha-errada"}'
# 1.2 rota protegida sem token: 401
curl -s -w ' -> HTTP %{http_code}\n' $APP/api/eu
# 1.3 token forjado, sem assinatura (alg "none"): 401
curl -s -w ' -> HTTP %{http_code}\n' $APP/api/eu \
  -H 'Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpZCI6MywicGFwZWwiOiJhZ3JpY3VsdG9yIn0.'
# 1.4 login certo da agricultora de demonstração (o token fica na variável e não aparece aqui): 200
TOKEN=$(curl -s -X POST $APP/api/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@demo.br","senha":"demo1234"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -s -w ' -> HTTP %{http_code}\n' $APP/api/eu -H "Authorization: Bearer $TOKEN"
# 1.5 papel errado, a agricultora numa rota da prefeitura: 403
curl -s -w ' -> HTTP %{http_code}\n' $APP/api/prefeitura/chamadas -H "Authorization: Bearer $TOKEN"
```

## 2. Validação de entrada

- O servidor confere cada campo antes de gravar: CPF pelos dígitos verificadores, UF, datas e números
  (`app/src/validacao.js` e as rotas). O CAF só é conferido por tamanho (5 a 30 caracteres) e por caracteres (letras sem
  acento, números, ponto, barra e hífen), porque não há formato oficial publicado do número. Erro é 400 com a mensagem
  em português.
- JSON quebrado dá 400. Envio acima de 256 KB dá 413, e o servidor para de ler; só o envio do PDF da chamada aceita até
  10 MB.
- A leitura da câmara fria só entra com a chave do dispositivo e dentro das faixas físicas dos sensores.
- O SQL é sempre parametrizado (`db.prepare` com `?`): nenhum texto digitado vira comando no banco.

```bash
# 2.1 CPF com os dígitos verificadores errados: 400
curl -s -w ' -> HTTP %{http_code}\n' -X PUT $APP/api/agricultor/perfil -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"municipio":"Catalão","uf":"GO","cpf":"123.456.789-00","vendido_no_ano_reais":0,"produtos":[],'\
'"aceite_termo":true}'
# 2.2 JSON quebrado: 400
curl -s -w ' -> HTTP %{http_code}\n' -X POST $APP/api/login -H 'Content-Type: application/json' -d '{"email":'
# 2.3 envio de 300 KB, acima do limite de 256 KB: 413
head -c 300000 /dev/zero | tr '\0' 'a' \
  | curl -s -w ' -> HTTP %{http_code}\n' -X POST $APP/api/login -H 'Content-Type: application/json' --data-binary @-
# 2.4 leitura da câmara fria sem a chave do dispositivo: 401
curl -s -w ' -> HTTP %{http_code}\n' -X POST $APP/api/leituras -H 'Content-Type: application/json' \
  -d '{"dispositivo":"camara-01","temperatura_c":5,"peso_kg":180,"porta_aberta":false}'
# 2.5 leitura absurda, com a chave certa: 400
curl -s -w ' -> HTTP %{http_code}\n' -X POST $APP/api/leituras -H "X-Chave-Dispositivo: $CHAVE_DISPOSITIVO" \
  -H 'Content-Type: application/json' \
  -d '{"dispositivo":"camara-01","temperatura_c":999,"peso_kg":-5,"porta_aberta":"sim"}'
```

## 3. Proteção de dados (LGPD)

- Os segredos (`JWT_SEGREDO`, `CHAVE_SERVICO`, `CHAVE_DISPOSITIVO` e `ANTHROPIC_API_KEY`) ficam só no `.env`, que o
  `.gitignore` deixa fora do Git e o `.dockerignore` deixa fora das imagens. Sem os três primeiros, o app não sobe; a
  `ANTHROPIC_API_KEY` é opcional (sem ela, a IA responde pelas regras).
- O agricultor aceita o termo de uso dos dados antes de salvar o perfil. CPF e CAF aparecem mascarados na tela.
- Os dados cadastrados do agricultor (nome, CPF, CAF, e-mail, telefone, dados bancários e os critérios do RITS)
  nunca vão para a IA: o app manda só município, UF, produtos, orgânico e se há prioridade. No chat, o serviço recusa
  CPF, e-mail, telefone e dados bancários digitados. Um nome digitado não dá para detectar, e por isso a tela pede para
  não escrevê-lo.
- A exportação para o data lake exige a chave de serviço e troca o agricultor por um pseudônimo (HMAC-SHA256 do id).

```bash
# 3.1 a agricultora salva CPF e CAF (números de exemplo): a tela recebe os dois mascarados
curl -s -o /dev/null -w 'perfil salvo: HTTP %{http_code}\n' -X PUT $APP/api/agricultor/perfil \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"municipio":"Catalão","uf":"GO","cpf":"123.456.789-09","caf":"GO052025.01.000012345CAF",'\
'"vendido_no_ano_reais":0,"aceite_termo":true,'\
'"produtos":[{"produto_id":"alface","quantidade_semana":25,"meses_safra":[1,2,3,4,5,6,7,8,9,10,11,12]}]}'
curl -s $APP/api/agricultor/perfil -H "Authorization: Bearer $TOKEN" | grep -o -E '"(cpf|caf)":"[^"]*"'
# 3.2 CPF escrito no chat do assistente: o app barra antes de chamar a IA: 400
curl -s -w ' -> HTTP %{http_code}\n' -X POST $APP/api/agricultor/chamadas/1/assistente \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mensagens":[{"papel":"agricultor","texto":"Meu CPF é 123.456.789-09. Posso vender alface?"}]}'
# 3.3 exportação para o data lake sem a chave de serviço: 401
curl -s -w ' -> HTTP %{http_code}\n' $APP/api/exportar
# 3.4 com a chave: os agricultores saem como pseudônimo, sem nome, e-mail, CPF nem CAF (0 ocorrências), embora o app
#     tenha o nome e o e-mail da Ana (2 ocorrências no /api/eu)
curl -s $APP/api/exportar -H "X-Chave-Servico: $CHAVE_SERVICO" | grep -o -E '"agricultores":\[\{[^}]*\}'
curl -s $APP/api/exportar -H "X-Chave-Servico: $CHAVE_SERVICO" \
  | grep -o -E 'Ana Souza|ana@demo\.br|12345678909|000012345CAF|"(nome|email|cpf|caf)"' | wc -l
curl -s $APP/api/eu -H "Authorization: Bearer $TOKEN" | grep -o -E 'Ana Souza|ana@demo\.br' | wc -l
# 3.5 o .env fica fora do Git (ignorado, fora do índice e em nenhum commit) e fora das imagens do Docker
git check-ignore -v .env
git ls-files --error-unmatch .env
git log --all --oneline -- .env | wc -l
grep -n -x '\*\*/\.env' .dockerignore
```
