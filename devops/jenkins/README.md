# Jenkins local: o pipeline de ponta a ponta

O `Jenkinsfile` da raiz do repositório roda sozinho a cada commit, sem nenhum passo manual. O Jenkins confere o
repositório a cada 2 minutos (`pollSCM`) e, quando há commit novo no ramo do job, roda as seis etapas:

1. **Checkout:** pega o código do commit.
2. **Testes Node (app):** `npm ci` e `npm test` num contêiner `node:24-alpine`.
3. **Testes Python (ia, dados e iot):** instala os `requirements.txt` e roda o `unittest` das três pastas num contêiner
   `python:3.12-slim`.
4. **Build das imagens:** `docker compose build`, as quatro imagens do `docker-compose.yml`.
5. **Smoke:** `devops/smoke.sh`, o teste de fumaça (app, IA, leituras do simulador e pipeline de dados).
6. **Arquivar evidências:** guarda `devops/evidencias/` como artefatos da execução, com a saída dos testes
   (`testes.txt`) e do smoke (`smoke.txt`) daquela execução. Numa execução vermelha, o `post { always }` do
   `Jenkinsfile` arquiva também, e a saída do que falhou fica à mão.

Uma execução verde está em `devops/evidencias/jenkins.png`.

## Como subir

Precisa de Linux com o Docker e o plugin Compose (testado com o Docker 29), de um clone com a pasta `.git` (não serve
worktree nem zip sem `.git`) e de um usuário com uid 1000 (`id -u`): o `jenkins` do contêiner é o uid 1000, e com outro
uid ele não grava na pasta do workspace. Da raiz do repositório:

```bash
mkdir -p /tmp/merenda-jenkins
export DOCKER_GID=$(stat -c %g /var/run/docker.sock)
docker compose -f devops/jenkins/docker-compose.yml up -d --build
docker compose -f devops/jenkins/docker-compose.yml exec jenkins cat /var/jenkins_home/secrets/senha-admin
```

O `export` vale só para o terminal em que você o rodou, e **todo** comando que usa esse `docker-compose.yml` precisa do
`DOCKER_GID`: o Compose confere o arquivo inteiro a cada comando, e sem a variável até o `ps`, o `logs`, o `exec` e o
`down` falham com "required variable DOCKER_GID is missing a value". Em outro terminal, rode o `export` de novo antes.

Abra http://localhost:8080 e entre com o usuário `admin` e a senha que o último comando mostrou. O job
`merenda-do-vizinho` já vem criado e roda pela primeira vez em até 2 minutos. Depois, cada commit novo dispara uma
execução, e a tela da execução mostra as etapas verdes ou vermelhas.

Variáveis (opcionais, na frente do `docker compose`):

- `RAMO`: o ramo que o job roda. O padrão é `main`; durante o desenvolvimento, use `RAMO=desenvolvimento`. Para trocar,
  suba de novo com a variável: o `ramo.groovy` grava o ramo no job a cada subida.
- `PASTA_TRABALHO`: onde fica o workspace, `/tmp/merenda-jenkins` por padrão. A pasta tem de existir e ser sua.

Por exemplo, para o job rodar o ramo `desenvolvimento` (o `DOCKER_GID` continua obrigatório):

```bash
export DOCKER_GID=$(stat -c %g /var/run/docker.sock)
RAMO=desenvolvimento docker compose -f devops/jenkins/docker-compose.yml up -d --build
```

## O que o Jenkins monta, e por quê

- **O socket do Docker** (`/var/run/docker.sock`): o pipeline sobe os contêineres no Docker do computador. Quem roda um
  job no Jenkins manda nesse Docker, por isso a porta 8080 só abre no próprio computador (127.0.0.1) e todo acesso
  pede login (`admin.groovy`). `DOCKER_GID` é o grupo dono do socket, para o usuário `jenkins` poder usá-lo.
- **O `.git` do repositório em `/repo`**, somente leitura: o Jenkins clona daqui e enxerga cada commit novo. Só o `.git`
  entra, então o `.env` com os seus segredos fica de fora. O smoke cria um `.env` próprio, com segredos aleatórios,
  dentro do workspace.
- **O workspace no mesmo caminho dentro e fora do contêiner** (`PASTA_TRABALHO`): quem monta as pastas do workspace
  nos contêineres do pipeline (`docker run -v` e o `./dados/datalake` do smoke) é o Docker do computador, que procura o
  caminho fora do contêiner.

O pipeline usa o projeto `merenda-ci` do Compose, e o Docker escolhe a porta do app: o smoke do Jenkins não mexe na
pilha de quem desenvolve nem disputa a porta 3000 com ela.

## Como parar e limpar

```bash
export DOCKER_GID=$(stat -c %g /var/run/docker.sock)           # o down também precisa dela, em terminal novo
docker compose -f devops/jenkins/docker-compose.yml down       # para o Jenkins e guarda o histórico
docker compose -f devops/jenkins/docker-compose.yml down -v    # para e apaga o histórico (o volume jenkins_home)
docker volume rm merenda-ci_banco                              # o banco que o smoke do pipeline usa
docker image rm merenda-ci-app merenda-ci-ia merenda-ci-dados merenda-ci-iot merenda-jenkins-jenkins
rm -rf /tmp/merenda-jenkins                                     # o workspace
```
