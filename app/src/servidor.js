// Servidor HTTP do app, sem Express: a API em /api/ e as telas de public/.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { criarRoteador } = require('./roteador');
const { ErroHttp, lerCorpoJson, responderJson, servirEstatico } = require('./http-util');

const LIMITE_CORPO = 10 * 1024 * 1024; // 10 MB, o mesmo da IA: o PDF da chamada chega em base64
const PASTA_ROTAS = path.join(__dirname, 'rotas');
const PASTA_PUBLICA = path.join(__dirname, '..', 'public');

// Carrega cada arquivo de src/rotas/, que exporta registrar(roteador, { db, config, ia }).
// Rota nova é arquivo novo nessa pasta; este arquivo não muda.
function criarServidor({ db, config, ia }) {
  const roteador = criarRoteador();
  for (const arquivo of fs.readdirSync(PASTA_ROTAS).filter((nome) => nome.endsWith('.js')).sort()) {
    require(path.join(PASTA_ROTAS, arquivo)).registrar(roteador, { db, config, ia });
  }

  return http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        const corpo = req.method === 'POST' || req.method === 'PUT' ? await lerCorpoJson(req, LIMITE_CORPO) : {};
        // ctx: o roteador põe params e query, e o exigirLogin põe usuario
        const atendeu = await roteador.tratar(req, res, { config, corpo });
        if (!atendeu) responderJson(res, 404, { erro: 'Rota não encontrada.' });
      } else if (!(await servirEstatico(req, res, PASTA_PUBLICA))) {
        responderJson(res, 404, { erro: 'Página não encontrada.' });
      }
    } catch (erro) {
      if (res.headersSent) return res.destroy();
      if (erro instanceof ErroHttp) return responderJson(res, erro.status, { erro: erro.message });
      console.error(erro);
      responderJson(res, 500, { erro: 'Erro interno. Tente de novo.' });
    }
  });
}

module.exports = { criarServidor };
