// O perfil do agricultor no formato do assistente da IA (T4). Só vai o que orienta a conversa: nada de nome, CPF,
// CAF ou e-mail, e dos critérios do RITS só se há prioridade (origem étnica é dado sensível, LGPD, art. 5º, II).
const { pontosRits } = require('./regras-pnae');

// Linhas de produtos_agricultor como a tela e a IA usam: meses_safra de texto JSON para lista.
function produtosEmLista(linhas) {
  return linhas.map(({ produto_id, quantidade_semana, meses_safra }) => ({
    produto_id,
    quantidade_semana,
    meses_safra: JSON.parse(meses_safra ?? '[]'),
  }));
}

// agricultor é a linha da tabela agricultores (0 e 1 do SQLite viram booleano); produtos, as de produtos_agricultor.
function perfilParaIa(agricultor, produtos) {
  return {
    municipio: agricultor.municipio,
    uf: agricultor.uf,
    produtos: produtosEmLista(produtos),
    organico: Boolean(agricultor.organico),
    prioridade_rits: pontosRits(agricultor) > 0,
  };
}

module.exports = { perfilParaIa, produtosEmLista };
