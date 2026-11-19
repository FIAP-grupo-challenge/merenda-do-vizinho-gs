// Pipeline de ponta a ponta do Colhe, no Jenkins de devops/jenkins/ (veja o README.md de lá).
// A cada commit, sem passo manual: testes do app e dos módulos Python em contêineres limpos, build das imagens,
// teste de fumaça com o Docker Compose e as saídas guardadas como artefatos da execução, em devops/evidencias/.
pipeline {
  agent any
  // roda sozinho: o Jenkins confere o repositório a cada 2 minutos e roda o pipeline quando há commit novo
  triggers { pollSCM('H/2 * * * *') }
  options {
    skipDefaultCheckout()
    disableConcurrentBuilds() // dois smokes ao mesmo tempo usariam o mesmo projeto do Compose
    timeout(time: 30, unit: 'MINUTES')
  }
  environment {
    // projeto próprio do Compose: não mexe na pilha de quem desenvolve nem no smoke rodado à mão (merenda-smoke)
    COMPOSE_PROJECT_NAME = 'merenda-ci'
    // o Docker escolhe a porta do app no host: o smoke fala com o app pela rede do Compose, e a 3000 pode estar em uso
    PORTA_APP = '0'
  }
  stages {
    stage('Checkout') {
      steps { checkout scm }
    }
    // Os testes rodam com o usuário do Jenkins, para os arquivos que eles criam no workspace continuarem dele.
    stage('Testes Node (app)') {
      steps {
        sh '''#!/bin/bash
          set -xeo pipefail
          docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$WORKSPACE:$WORKSPACE" -w "$WORKSPACE/app" \
            node:24-alpine sh -c 'npm ci && npm test' 2>&1 | tee devops/evidencias/testes.txt
        '''
      }
    }
    stage('Testes Python (ia, dados e iot)') {
      steps {
        sh '''#!/bin/bash
          set -xeo pipefail
          docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 \
            -v "$WORKSPACE:$WORKSPACE" -w "$WORKSPACE" python:3.12-slim sh -c '
              pip install --user -q --disable-pip-version-check --no-warn-script-location \
                -r ia/requirements.txt -r dados/requirements.txt &&
              python -m unittest discover -s ia/tests -t . -v &&
              python -m unittest discover -s dados/tests -t . -v &&
              python -m unittest discover -s iot -t . -v' 2>&1 | tee -a devops/evidencias/testes.txt
        '''
      }
    }
    stage('Build das imagens') {
      // o build não usa os segredos, mas o Compose confere as variáveis do arquivo todo: o .env.example as preenche
      steps { sh 'docker compose --env-file .env.example --profile tarefas build' }
    }
    stage('Smoke') {
      // inclui o login da Ana e uma pergunta ao assistente: é o teste em que o app chama a IA de verdade
      steps {
        sh '''#!/bin/bash
          set -xeo pipefail
          devops/smoke.sh 2>&1 | tee devops/evidencias/smoke.txt
        '''
      }
    }
    stage('Arquivar evidências') {
      steps { archiveArtifacts artifacts: 'devops/evidencias/**' }
    }
  }
  post {
    // também numa execução vermelha: a saída dos testes é a primeira coisa que se abre
    // (allowEmptyArchive: se a falha veio antes de a pasta existir, o archive não vira um segundo erro)
    always { archiveArtifacts artifacts: 'devops/evidencias/**', allowEmptyArchive: true }
  }
}
