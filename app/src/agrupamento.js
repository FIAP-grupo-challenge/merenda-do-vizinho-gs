// Agrupamento: divide cada item da chamada entre os cooperados que produzem aquele produto.
const { arredondar, centesimos, unidadeInteira } = require('./regras-pnae');

// Partes iguais, limitadas pelo teto de cada um; a sobra segue a prioridade (menor número primeiro).
// Conta em passos inteiros, com o teto e o pedido arredondados para baixo: assim a alocação nunca passa do teto nem do
// pedido, e o resto da divisão segue a mesma ordem de prioridade. O passo é o centésimo (kg, l...) ou, nas unidades
// inteiras (pç, maço, dúzia...), a unidade: ali o teto de 284,49 pés vale 284, e a sobra também sai em pés inteiros.
function dividirItem({ quantidade, preco_unitario, unidade }, candidatos) {
  const inteira = unidadeInteira(unidade);
  const passo = inteira ? 100 : 1; // em centésimos
  const emPassos = (valor) => Math.floor(centesimos(valor) / passo);
  const pedido = emPassos(quantidade);
  // teto = min(capacidade, limite em reais ÷ preço)
  const teto = candidatos.map((c) => Math.max(0, emPassos(Math.min(c.capacidade, c.limite_restante_reais / preco_unitario))));
  const ativos = candidatos.map((_, i) => i).filter((i) => teto[i] > 0);
  const recebido = candidatos.map(() => 0);

  for (const i of ativos) recebido[i] = Math.min(Math.floor(pedido / ativos.length), teto[i]);
  let sobra = pedido - recebido.reduce((total, q) => total + q, 0);

  const niveis = [...new Set(ativos.map((i) => candidatos[i].prioridade))].sort((a, b) => a - b);
  for (const nivel of niveis) {
    let comFolga = ativos.filter((i) => candidatos[i].prioridade === nivel && recebido[i] < teto[i]);
    while (sobra > 0 && comFolga.length > 0) {
      // com menos de 1 passo por cabeça, os primeiros da lista levam 1 cada
      const parte = Math.max(1, Math.floor(sobra / comFolga.length));
      for (const i of comFolga) {
        const mais = Math.min(parte, teto[i] - recebido[i], sobra);
        recebido[i] += mais;
        sobra -= mais;
      }
      comFolga = comFolga.filter((i) => recebido[i] < teto[i]);
    }
  }

  const total = ((pedido - sobra) * passo) / 100;
  return {
    alocacoes: candidatos.map((c, i) => ({ agricultor_id: c.agricultor_id, quantidade: (recebido[i] * passo) / 100 })),
    total,
    // um pedido de 12,5 pç só se cumpre até 12: o 0,5 também falta
    falta: inteira ? arredondar(quantidade - total) : sobra / 100,
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
