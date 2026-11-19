// Catálogo de produtos, o mesmo da IA: compartilhado/catalogo-produtos.json.
const CATALOGO = require('../../compartilhado/catalogo-produtos.json');

const IDS = new Set(CATALOGO.map((produto) => produto.id));

function produtoExiste(id) {
  return IDS.has(id);
}

// Uma cópia: quem ordenar ou mudar a lista não estraga o catálogo dos outros.
function produtosDoCatalogo() {
  return structuredClone(CATALOGO);
}

module.exports = { produtoExiste, produtosDoCatalogo };
