// O job roda o ramo da variável RAMO do docker-compose.yml: a cada subida do Jenkins, o ramo do job passa a ser esse.
// Vai o nome já escrito, e não "${RAMO}": o checkout dentro do pipeline não enxerga as variáveis do contêiner.
import jenkins.model.Jenkins

def job = Jenkins.get().getItemByFullName('merenda-do-vizinho')
def ramo = "*/${System.getenv('RAMO')}"
def ramos = job.definition.scm.branches
if (ramos[0].name != ramo) {
  ramos[0].name = ramo
  job.save()
}
