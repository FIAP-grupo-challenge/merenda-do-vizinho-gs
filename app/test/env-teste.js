// Segredos e data só dos testes. Fica fora do ajuda.js para quem só precisa deles não carregar o servidor nem o SQLite.
const ENV_TESTE = {
  JWT_SEGREDO: 'segredo-so-dos-testes',
  CHAVE_SERVICO: 'chave-servico-dos-testes',
  CHAVE_DISPOSITIVO: 'chave-dispositivo-dos-testes',
  DATA_REFERENCIA: '2026-07-15',
};

module.exports = { ENV_TESTE };
