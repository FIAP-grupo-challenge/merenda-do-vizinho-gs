// Rotas só dos testes: cada uma erra de um jeito. O servidor as carrega pelo `pastaRotas` do subirApp.
const { ErroHttp, responderJson } = require('../../src/http-util');

function registrar(roteador) {
  roteador.get('/api/erro/depois-de-responder', async (req, res) => {
    responderJson(res, 200, { ok: true });
    throw new Error('falha depois da resposta');
  });
  roteador.get('/api/erro/resposta-dupla', async (req, res) => {
    responderJson(res, 200, { ok: true });
    responderJson(res, 200, { ok: true });
  });
  roteador.get('/api/erro/resposta-grande', async (req, res) => {
    responderJson(res, 200, { texto: 'x'.repeat(8 * 1024 * 1024) });
    throw new Error('falha depois da resposta grande');
  });
  roteador.get('/api/erro/pela-metade', async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('começo');
    throw new Error('falha no meio da resposta');
  });
  roteador.get('/api/erro/sem-resposta', async () => {});
  roteador.get('/api/erro/http', async () => {
    throw new ErroHttp(418, 'erro previsto');
  });
}

module.exports = { registrar };
