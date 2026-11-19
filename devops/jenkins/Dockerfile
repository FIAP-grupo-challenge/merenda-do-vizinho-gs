# Jenkins local do Colhe (veja o README.md desta pasta): o LTS com Java 21, mais o cliente do Docker com
# os plugins Compose e Buildx (o Compose constrói as imagens pelo Buildx). O pipeline sobe os contêineres no Docker do
# computador, pelo socket montado no docker-compose.yml.
FROM jenkins/jenkins:lts-jdk21
COPY --from=docker:29-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:29-cli /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
# pipeline-graph-view: as etapas de cada execução na tela, verdes ou vermelhas
RUN jenkins-plugin-cli --plugins workflow-aggregator git pipeline-graph-view
# O usuário admin e o job do pipeline já vêm prontos: o Jenkins copia o ref/ para o JENKINS_HOME na primeira subida, e
# os scripts .groovy rodam a cada subida (admin.groovy: o login; ramo.groovy: o ramo do job).
COPY admin.groovy ramo.groovy /usr/share/jenkins/ref/init.groovy.d/
COPY pipeline.xml /usr/share/jenkins/ref/jobs/merenda-do-vizinho/config.xml
