// Agrupamento: divide cada item da chamada entre os cooperados que produzem aquele produto.
const { arredondar, centesimos } = require('./regras-pnae');

// Partes iguais, limitadas pelo teto de cada um; a sobra segue a prioridade (menor número primeiro).
// Conta em centésimos inteiros, com o teto e o pedido arredondados para baixo: assim o arredondamento para
// 2 casas nunca passa do teto nem do pedido, e o resto da divisão segue a mesma ordem de prioridade.
function dividirItem({ quantidade, preco_unitario }, candidatos) {
  const pedido = Math.floor(centesimos(quantidade));
  // teto = min(capacidade, limite em reais ÷ preço)
  const teto = candidatos.map((c) =>
    Math.max(0, Math.floor(centesimos(Math.min(c.capacidade, c.limite_restante_reais / preco_unitario)))),
  );
  const ativos = candidatos.map((_, i) => i).filter((i) => teto[i] > 0);
  const recebido = candidatos.map(() => 0);

  for (const i of ativos) recebido[i] = Math.min(Math.floor(pedido / ativos.length), teto[i]);
  let sobra = pedido - recebido.reduce((total, q) => total + q, 0);

  const niveis = [...new Set(ativos.map((i) => candidatos[i].prioridade))].sort((a, b) => a - b);
  for (const nivel of niveis) {
    let comFolga = ativos.filter((i) => candidatos[i].prioridade === nivel && recebido[i] < teto[i]);
    while (sobra > 0 && comFolga.length > 0) {
      // com menos de 1 centésimo por cabeça, os primeiros da lista levam 1 cada
      const parte = Math.max(1, Math.floor(sobra / comFolga.length));
      for (const i of comFolga) {
        const mais = Math.min(parte, teto[i] - recebido[i], sobra);
        recebido[i] += mais;
        sobra -= mais;
      }
      comFolga = comFolga.filter((i) => recebido[i] < teto[i]);
    }
  }

  return {
    alocacoes: candidatos.map((c, i) => ({ agricultor_id: c.agricultor_id, quantidade: recebido[i] / 100 })),
    total: (pedido - sobra) / 100,
    falta: sobra / 100,
  };
}

// cooperados: [{ agricultor_id, nome, prioridade, limite_restante_reais, capacidades: { <produto_id>: quantidade } }].
// O limite em reais vale para a soma dos itens, e a capacidade de um produto vale para a soma dos itens desse
// produto: o que um item leva sai do que fica para os próximos. A entrada não é alterada.
function montarPropostaConjunta(chamada, cooperados) {
  const restante = new Map(
    cooperados.map((c) => [c.agricultor_id, { limite: c.limite_restante_reais, capacidades: { ...c.capacidades } }]),
  );
  const itens = chamada.itens.map((item) => {
    const candidatos = cooperados
      .filter((c) => Object.hasOwn(c.capacidades, item.produto_id))
      .map((c) => {
        const { limite, capacidades } = restante.get(c.agricultor_id);
        const capacidade = capacidades[item.produto_id];
        return { agricultor_id: c.agricultor_id, capacidade, limite_restante_reais: limite, prioridade: c.prioridade };
      });
    const { alocacoes, total, falta } = dividirItem(item, candidatos);
    for (const { agricultor_id, quantidade } of alocacoes) {
      const resto = restante.get(agricultor_id);
      // desconta o mesmo valor em centavos que o projeto de venda mostra
      resto.limite = arredondar(resto.limite - arredondar(quantidade * item.preco_unitario));
      resto.capacidades[item.produto_id] = arredondar(resto.capacidades[item.produto_id] - quantidade);
    }
    return {
      produto_id: item.produto_id,
      produto: item.produto,
      unidade: item.unidade,
      preco_unitario: item.preco_unitario,
      quantidade_pedida: item.quantidade,
      alocacoes,
      total,
      falta,
    };
  });
  return { itens };
}

module.exports = { dividirItem, montarPropostaConjunta };
