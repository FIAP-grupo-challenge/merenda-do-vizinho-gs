// Exportação para o data lake: GET /api/exportar, com a chave de serviço no cabeçalho X-Chave-Servico (o pipeline de dados/).
const crypto = require('node:crypto');
const { exportar } = require('../exportacao');
const { ErroHttp, responderJson } = require('../http-util');

// Os digests têm sempre 32 bytes: a comparação leva o mesmo tempo, e o tamanho da chave não aparece.
const digest = (texto) => crypto.createHash('sha256').update(texto).digest();

function registrar(roteador, { db, config }) {
  const exigirChaveServico = async (req, res) => {
    const recebida = req.headers['x-chave-servico'];
    if (typeof recebida !== 'string' || !crypto.timingSafeEqual(digest(recebida), digest(config.chaveServico))) {
      responderJson(res, 401, { erro: 'Chave de serviço inválida.' });
    }
  };

  roteador.get('/api/exportar', exigirChaveServico, async (req, res, ctx) => {
    const { desde } = ctx.query;
    if (desde !== undefined && Number.isNaN(Date.parse(desde))) {
      throw new ErroHttp(400, 'desde deve ser uma data, como 2026-07-01T00:00:00Z.');
    }
    // o segredo do pseudônimo é o JWT: nunca sai do app, e trocá-lo muda todos os pseudônimos
    responderJson(res, 200, exportar(db, { desde, segredo: config.jwtSegredo }));
  });
}

module.exports = { registrar };
