const test = require('node:test');
const assert = require('node:assert/strict');
const { montarProjetoVenda } = require('../src/projeto-venda');

const chamada = {
  numero: '001/2026',
  orgao: 'Fundo Municipal de Educação de Catalão',
  municipio: 'Catalão',
  uf: 'GO',
  local_entrega: 'Escolas municipais',
  data_publicacao: '2026-11-02',
  prazo_envio: '2026-11-30',
  itens: [],
};
const proponente = { tipo: 'grupo-formal', nome: 'Cooperativa Vizinhos do Campo', documento: '11222333000181' };
const agricultor = (id, nome, mulher_titular) => ({
  id,
  nome,
  cpf: '529.982.247-25',
  caf: 'GO052025.01.000012345CAF',
  municipio: 'Catalão',
  uf: 'GO',
  mulher_titular,
});
// itens no formato de montarPropostaConjunta(...).itens
const itens = [
  {
    produto_id: 'alface',
    produto: 'Alface',
    unidade: 'pç',
    preco_unitario: 5.4,
    quantidade_pedida: 200,
    alocacoes: [{ agricultor_id: 1, quantidade: 100 }, { agricultor_id: 2, quantidade: 50 }, { agricultor_id: 3, quantidade: 0 }],
    total: 150,
    falta: 50,
  },
  { produto_id: 'couve', produto: 'Couve', unidade: 'maço', preco_unitario: 7.37, quantidade_pedida: 80, alocacoes: [], total: 0, falta: 80 },
];

test('projeto de venda soma quantidade × preço', () => {
  const agricultores = [agricultor(1, 'Ana Souza', 1), agricultor(2, 'Carla Ferreira', 1), agricultor(3, 'Elisa Martins', 1)];
  const p = montarProjetoVenda({ chamada, proponente, itens, agricultores });
  assert.equal(p.valor_total, 810);
  assert.deepEqual(p.cabecalho, {
    numero: '001/2026',
    orgao: 'Fundo Municipal de Educação de Catalão',
    municipio: 'Catalão',
    uf: 'GO',
    local_entrega: 'Escolas municipais',
  });
  assert.deepEqual(p.proponente, proponente);
  // quem ficou com zero não entra no projeto, nem o item que ninguém fornece
  assert.deepEqual(p.fornecedores, [
    {
      agricultor_id: 1,
      nome: 'Ana Souza',
      cpf: '529.982.247-25',
      caf: 'GO052025.01.000012345CAF',
      municipio_caf: 'Catalão',
      uf_caf: 'GO',
      itens: [{ produto: 'Alface', unidade: 'pç', quantidade: 100, preco_unitario: 5.4, valor: 540 }],
      valor_total: 540,
    },
    {
      agricultor_id: 2,
      nome: 'Carla Ferreira',
      cpf: '529.982.247-25',
      caf: 'GO052025.01.000012345CAF',
      municipio_caf: 'Catalão',
      uf_caf: 'GO',
      itens: [{ produto: 'Alface', unidade: 'pç', quantidade: 50, preco_unitario: 5.4, valor: 270 }],
      valor_total: 270,
    },
  ]);
  assert.deepEqual(p.totais_por_produto, [{ produto: 'Alface', unidade: 'pç', quantidade: 150, preco_unitario: 5.4, valor: 810 }]);
  assert.deepEqual(p.avisos, []);
});

test('projeto de venda avisa quando a família não tem mulher titular', () => {
  const agricultores = [agricultor(1, 'Ana Souza', 1), agricultor(2, 'Bruno Lima', 0), agricultor(3, 'Davi Rocha', 0)];
  const { avisos } = montarProjetoVenda({ chamada, proponente, itens, agricultores });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /50%/);
  assert.match(avisos[0], /Bruno Lima/);
  assert.doesNotMatch(avisos[0], /Davi Rocha/, 'Davi ficou com zero e não está no projeto');

  // edital publicado até 22/10/2026: vale a seleção anterior, sem RITS
  const antigo = montarProjetoVenda({ chamada: { ...chamada, data_publicacao: '2026-07-09' }, proponente, itens, agricultores });
  assert.equal(antigo.avisos.length, 2);
  assert.match(antigo.avisos[1], /sem o RITS/);
});
