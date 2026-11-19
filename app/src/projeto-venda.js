// Projeto de venda nos campos do modelo do FNDE (Res. CD/FNDE 4/2026, Anexo VI: individual, grupo informal e
// grupo formal), mais o que a Res. 17/2026 exige na relação de participantes: município e UF do CAF, alimentos e
// quantidades e valor previsto por agricultor (art. 35, § 2º, V, e § 3º, VII). O que o app não coleta (NIS,
// telefone, endereço, dados bancários, cronograma, forma de anuência) fica em branco na página, para preencher à mão.
const { arredondar, versaoRegra } = require('./regras-pnae');

const somar = (linhas, campo) => arredondar(linhas.reduce((total, linha) => total + linha[campo], 0));

// itens: o formato de montarPropostaConjunta(...).itens; agricultores: [{ id, nome, cpf, caf, municipio, uf, mulher_titular }].
// Quem ficou sem quantidade não entra, nem o item que ninguém fornece. Os totais somam as linhas dos fornecedores,
// para os dois baterem (a relação de participantes tem de bater com o projeto: art. 35, § 9º).
function montarProjetoVenda({ chamada, proponente, itens, agricultores }) {
  const linhasDe = new Map(agricultores.map((a) => [a.id, []]));
  const totais_por_produto = [];
  for (const { produto, unidade, preco_unitario, alocacoes } of itens) {
    const linhas = alocacoes
      .filter((a) => a.quantidade > 0)
      .map((a) => {
        const linha = { produto, unidade, quantidade: a.quantidade, preco_unitario, valor: arredondar(a.quantidade * preco_unitario) };
        linhasDe.get(a.agricultor_id).push(linha);
        return linha;
      });
    if (linhas.length > 0) {
      totais_por_produto.push({ produto, unidade, quantidade: somar(linhas, 'quantidade'), preco_unitario, valor: somar(linhas, 'valor') });
    }
  }
  const participantes = agricultores.filter((a) => linhasDe.get(a.id).length > 0);

  const avisos = [];
  const semMulher = participantes.filter((a) => !a.mulher_titular).map((a) => a.nome);
  if (semMulher.length > 0) {
    avisos.push(
      `Família sem mulher titular (${semMulher.join(', ')}): pelo menos 50% do valor de cada família precisa sair em ` +
        'nota fiscal no nome de uma mulher da família que esteja no CAF (Res. CD/FNDE 4/2026, art. 29, §§ 3º e 5º).',
    );
  }
  if (versaoRegra(chamada) === 'res4-original') {
    avisos.push(
      'Este edital saiu até 22/10/2026, então a seleção segue a regra anterior, sem o RITS (Res. CD/FNDE 17/2026, art. 3º). ' +
        'O app usa a regra nova.',
    );
  }

  const { numero, orgao, municipio, uf, local_entrega } = chamada;
  return {
    cabecalho: { numero, orgao, municipio, uf, local_entrega },
    proponente,
    fornecedores: participantes.map((a) => ({
      agricultor_id: a.id,
      nome: a.nome,
      cpf: a.cpf,
      caf: a.caf,
      municipio_caf: a.municipio,
      uf_caf: a.uf,
      itens: linhasDe.get(a.id),
      valor_total: somar(linhasDe.get(a.id), 'valor'),
    })),
    totais_por_produto,
    valor_total: somar(totais_por_produto, 'valor'),
    avisos,
  };
}

module.exports = { montarProjetoVenda };
