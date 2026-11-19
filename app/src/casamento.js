// Casamento: as chamadas em que o agricultor pode vender, com quanto ele pode ganhar em cada uma.
const { arredondar, capacidadeNoPeriodo, limiteRestanteReais, versaoRegra } = require('./regras-pnae');

// Como o normalizar_texto da IA: sem acento, em minúsculas e com espaços simples ('CATALAO' casa com 'Catalão').
function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// chamadas são linhas da tabela chamadas ({ id, status, dados }, com dados já em objeto); hoje é 'AAAA-MM-DD'.
// Sem limiteRestanteReais, a conta sai do vendido_no_ano_reais do agricultor.
// Não há conversão de unidade: a quantidade por semana do agricultor vale na unidade do item da chamada.
function oportunidades({
  agricultor,
  produtos,
  chamadas,
  hoje,
  limiteRestanteReais: limite = limiteRestanteReais(agricultor.vendido_no_ano_reais),
}) {
  const lista = [];
  for (const { id, status, dados } of chamadas) {
    const aberta = !dados.prazo_envio || dados.prazo_envio >= hoje;
    if (status !== 'publicada' || !aberta || !dados.uf || dados.uf !== agricultor.uf) continue;

    // a capacidade de cada produto vale para a soma dos itens da chamada: Catalão pede abóbora em dois itens
    const capacidade = new Map(
      produtos.map((p) => [p.produto_id, capacidadeNoPeriodo(p.quantidade_semana, dados.semanas_fornecimento)]),
    );
    const itens = [];
    for (const item of dados.itens) {
      const quantidade_max = Math.min(capacidade.get(item.produto_id) ?? 0, item.quantidade);
      if (!(quantidade_max > 0)) continue; // ele não planta, ou não sobrou capacidade
      capacidade.set(item.produto_id, arredondar(capacidade.get(item.produto_id) - quantidade_max));
      const { produto_id, produto, unidade, preco_unitario } = item;
      const ganho_estimado = arredondar(quantidade_max * preco_unitario);
      itens.push({ produto_id, produto, unidade, quantidade_max, preco_unitario, ganho_estimado });
    }
    if (itens.length === 0) continue;

    const soma = itens.reduce((total, item) => total + item.ganho_estimado, 0);
    lista.push({
      chamada_id: id,
      municipio: dados.municipio,
      uf: dados.uf,
      prazo_envio: dados.prazo_envio,
      mesma_cidade: Boolean(dados.municipio) && normalizar(dados.municipio) === normalizar(agricultor.municipio),
      versao_regra: versaoRegra(dados),
      itens,
      ganho_total: arredondar(Math.min(soma, limite)), // o limite anual corta a soma
    });
  }
  return lista.sort((a, b) => b.mesma_cidade - a.mesma_cidade || b.ganho_total - a.ganho_total);
}

module.exports = { oportunidades };
