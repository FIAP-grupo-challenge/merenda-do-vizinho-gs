"""Os testes da IA não dependem do ambiente de quem os roda."""
import os

# O roteiro do assistente lê SEMANAS_PADRAO uma vez, quando é importado: sem a variável, valem as 40 semanas do
# regras-pnae.json, que é o que os testes esperam (a variável é testada em TestSemanasPadrao, em processos à parte).
# Tem de sair do ambiente antes de qualquer teste importar o roteiro, e este arquivo roda antes de todos.
os.environ.pop('SEMANAS_PADRAO', None)
