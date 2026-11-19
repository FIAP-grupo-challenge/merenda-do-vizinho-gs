#!/usr/bin/env bash
# Teste de fumaça do Docker Compose: sobe o app e a IA, confere os dois, manda leituras do simulador,
# roda o pipeline de dados e derruba os serviços. No fim imprime SMOKE OK; qualquer falha sai com código 1.
# Uso: devops/smoke.sh
# O projeto do Compose é o merenda-smoke, e não o nome da pasta: o smoke não rebuilda, reinicia nem derruba a pilha que
# você usa no dia a dia. Para outro nome: COMPOSE_PROJECT_NAME=outro devops/smoke.sh
# Com o Podman sem root, o usuário 1000 dos contêineres tem de ser você para o pipeline gravar em ./dados/datalake:
#   COMPOSE="podman-compose --podman-run-args=--userns=keep-id:uid=1000,gid=1000" devops/smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="${COMPOSE:-docker compose}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-merenda-smoke}"

echo '== 1. .env, build e subida'
# Sem .env, cria um de teste com segredos aleatórios (o .env fica fora do Git). Sem chave da Anthropic, a IA
# roda no modo de regras.
if [ ! -f .env ]; then
  # command -p: o od e o tr do sistema, mesmo que outro programa com o mesmo nome venha antes no PATH
  segredo() { command -p od -An -N32 -tx1 /dev/urandom | command -p tr -d ' \n'; }
  jwt=$(segredo) servico=$(segredo) dispositivo=$(segredo)
  [[ "$jwt$servico$dispositivo" =~ ^[0-9a-f]{192}$ ]] || { echo 'não consegui gerar os segredos' >&2; exit 1; }
  (
    umask 077
    printf '%s\n' '# criado pelo devops/smoke.sh, com segredos aleatórios' 'ANTHROPIC_API_KEY=' "JWT_SEGREDO=$jwt" \
      "CHAVE_SERVICO=$servico" "CHAVE_DISPOSITIVO=$dispositivo" 'DATA_REFERENCIA=' > .env
  )
  echo 'criei o .env de teste, com segredos aleatórios'
fi

fim() {
  local codigo=$?
  set +e
  [ "$codigo" = 0 ] || $COMPOSE logs --tail 30 app ia
  $COMPOSE down
  exit "$codigo"
}
trap fim EXIT
$COMPOSE --profile tarefas build
$COMPOSE up -d

echo '== 2. app e IA respondendo 200'
# A IA não publica porta no host (não tem login e gasta a chave da Anthropic): os dois GET saem de dentro do
# contêiner do app, pela rede do Compose, que é o caminho que o app usa para chegar à IA.
responde_200() {
  $COMPOSE exec -T app node -e '
    const url = process.argv[1];
    fetch(url).then(async (r) => {
      console.log(r.status, url, (await r.text()).replace(/\s+/g, " ").slice(0, 80));
      process.exit(r.status === 200 ? 0 : 1);
    }, () => process.exit(1));' "$1"
}
esperar() {
  for _ in $(seq 60); do
    responde_200 "$1" 2>/dev/null && return 0
    sleep 2
  done
  echo "sem resposta 200 de $1 em 2 minutos" >&2
  return 1
}
esperar http://ia:3001/saude
esperar http://localhost:3000/

echo '== 3. 5 leituras do simulador com a porta aberta'
# O simulador sai com código 1 se algum status não for 201.
# --profile tarefas nos run: o podman-compose só roda um serviço de perfil com o perfil ligado.
$COMPOSE --profile tarefas run --rm -T iot python iot/simulador.py --cenario porta-aberta --quantidade 5 \
  --intervalo 1 --url http://app:3000/api/leituras

echo '== 4. pipeline do data lake, com a cópia versionada das fontes públicas e os dados do app'
$COMPOSE --profile tarefas run --rm -T -e PIPELINE_OFFLINE=1 dados python -m dados.pipeline tudo

$COMPOSE ps
echo 'SMOKE OK'
