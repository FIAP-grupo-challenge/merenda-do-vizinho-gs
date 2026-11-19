// Catálogo de produtos para as telas (exige login).
const { exigirLogin } = require('../auth');
const { produtosDoCatalogo } = require('../catalogo');
const { responderJson } = require('../http-util');

function registrar(roteador) {
  roteador.get('/api/catalogo', exigirLogin, async (req, res) => responderJson(res, 200, produtosDoCatalogo()));
}

module.exports = { registrar };
