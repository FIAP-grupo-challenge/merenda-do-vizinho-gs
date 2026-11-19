// A proposta vista do banco: o que a proposta conjunta (cooperativa) e a individual (agricultor) leem dele.
const { arredondar, capacidadeNoPeriodo, limiteRestanteReais, prioridadeDoAgricultor } = require('./regras-pnae');

// O agricultor no formato de montarPropostaConjunta (T7). `agricultor` é a linha de agricultores com o nome do usuário;
// `chamada` é { id, dados }. A capacidade de cada produto marcado em interesses é o menor valor entre o interesse e o
// que ele produz no período da chamada (quantidade por semana × semanas).
function participante(db, agricultor, chamada) {
  const linhas = db
    .prepare(
      `SELECT i.produto_id, SUM(i.quantidade) AS interesse,
         (SELECT SUM(p.quantidade_semana) FROM produtos_agricultor p
           WHERE p.agricultor_id = i.agricultor_id AND p.produto_id = i.produto_id) AS por_semana
       FROM interesses i WHERE i.agricultor_id = ? AND i.chamada_id = ? GROUP BY i.produto_id`,
    )
    .all(agricultor.usuario_id, chamada.id);
  const semanas = chamada.dados.semanas_fornecimento;
  return {
    agricultor_id: agricultor.usuario_id,
    nome: agricultor.nome,
    prioridade: prioridadeDoAgricultor(agricultor),
    limite_restante_reais: limiteRestanteReais(agricultor.vendido_no_ano_reais),
    capacidades: Object.fromEntries(
      linhas.map((l) => [l.produto_id, Math.min(l.interesse, capacidadeNoPeriodo(l.por_semana ?? 0, semanas))]),
    ),
  };
}

// Itens como ficam gravados na proposta: cada um com o `valor` já somado em centavos.
function totalDaProposta(itens) {
  return arredondar(itens.reduce((total, item) => total + item.valor, 0));
}

module.exports = { participante, totalDaProposta };
