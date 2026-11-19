import os

# Haiku 5.5, o modelo mais barato da Anthropic (pedido do usuário em 18/11); a variável MODELO_CLAUDE troca.
# Variável vazia vale como ausente, como as chaves do .env.
MODELO_PADRAO = os.getenv('MODELO_CLAUDE') or 'claude-haiku-5-5'
