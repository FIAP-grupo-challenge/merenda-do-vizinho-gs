// Roteador pequeno, sem Express: rotas com :parametros e uma lista de manipuladores por rota.
const { ErroHttp } = require('./http-util');

// Vale a primeira rota registrada que casar: registre '/x/resumo' antes de '/x/:id'.
function criarRoteador() {
  const rotas = [];
  const registrar = (metodo) => (caminho, ...manipuladores) => rotas.push({ metodo, partes: caminho.split('/'), manipuladores });

  // Cada manipulador é async (req, res, ctx). A lista para quando um deles encerra a resposta.
  // Põe em ctx os params e a query; o servidor já pôs o corpo e a config, e o exigirLogin põe o usuario.
  async function tratar(req, res, ctx) {
    const url = new URL(req.url, 'http://localhost');
    const pedacos = url.pathname.split('/');
    for (const rota of rotas) {
      if (rota.metodo !== req.method) continue;
      const params = casar(rota.partes, pedacos);
      if (!params) continue;
      ctx.params = params;
      ctx.query = Object.fromEntries(url.searchParams);
      for (const manipulador of rota.manipuladores) {
        await manipulador(req, res, ctx);
        if (res.writableEnded) break;
      }
      return true;
    }
    return false;
  }

  return { get: registrar('GET'), post: registrar('POST'), put: registrar('PUT'), tratar };
}

function casar(partes, pedacos) {
  if (partes.length !== pedacos.length) return null;
  const params = {};
  for (let i = 0; i < partes.length; i++) {
    if (!partes[i].startsWith(':')) {
      if (partes[i] !== pedacos[i]) return null;
    } else if (!pedacos[i]) {
      return null;
    } else {
      params[partes[i].slice(1)] = decodificar(pedacos[i]);
    }
  }
  return params;
}

function decodificar(pedaco) {
  try {
    return decodeURIComponent(pedaco);
  } catch {
    throw new ErroHttp(400, 'endereço inválido');
  }
}

module.exports = { criarRoteador };
