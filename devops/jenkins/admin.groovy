// Fecha o Jenkins para quem não entrou: com o socket do Docker montado, quem roda um job manda no Docker do computador.
// Na primeira subida, cria o usuário admin com uma senha aleatória, guardada em secrets/senha-admin (como a senha
// inicial do próprio Jenkins). Nas outras, não muda nada.
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.security.HudsonPrivateSecurityRealm
import java.security.SecureRandom
import jenkins.model.Jenkins

def jenkins = Jenkins.get()
if (!(jenkins.securityRealm instanceof HudsonPrivateSecurityRealm)) {
  def senha = new BigInteger(130, new SecureRandom()).toString(32)
  def usuarios = new HudsonPrivateSecurityRealm(false) // false: ninguém se cadastra pela tela
  usuarios.createAccount('admin', senha)
  jenkins.securityRealm = usuarios
  def acesso = new FullControlOnceLoggedInAuthorizationStrategy()
  acesso.allowAnonymousRead = false
  jenkins.authorizationStrategy = acesso
  jenkins.save()
  new File(jenkins.rootDir, 'secrets/senha-admin').text = senha
  println 'Usuário admin criado. A senha está em /var/jenkins_home/secrets/senha-admin'
}
