const test = require('node:test');
const assert = require('node:assert/strict');
const { oportunidades } = require('../src/casamento');

// Uma linha da tabela chamadas, com dados já em objeto, no formato da IA (T2).
const chamada = (id, dados, status = 'publicada') => ({
  id,
  status,
  dados: {
    numero: '001/2026',
    orgao: 'Fundo Municipal de Educação',
    municipio: 'Catalão',
    uf: 'GO',
    data_publicacao: '2026-07-09',
    prazo_envio: '2026-07-30',
    semanas_fornecimento: 40,
    itens: [],
    ...dados,
  },
});
const item = (produto, produto_id, unidade, quantidade, preco_unitario) => ({
  produto,
  produto_id,
  unidade,
  quantidade,
  preco_unitario,
  valor_total: null,
  entrega: null,
  observacoes: null,
});
const alface = [{ produto_id: 'alface', quantidade_semana: 30 }];

test('chamada de outra UF, vencida ou só com itens que ele não produz não aparece', () => {
  const agricultor = { municipio: 'Campinas', uf: 'SP' };
  const itensAlface = [item('Alface', 'alface', 'kg', 1000, 5.4)];
  const hoje = '2026-03-01';
  const fora = [
    chamada(1, { municipio: 'Uberlândia', uf: 'MG', itens: itensAlface }),
    chamada(2, { municipio: 'Campinas', uf: 'SP', prazo_envio: '2026-01-01', itens: itensAlface }),
    chamada(3, { municipio: 'Campinas', uf: 'SP', itens: [item('Tomate', 'tomate', 'kg', 1000, 5.4)] }),
    chamada(4, { municipio: 'Campinas', uf: 'SP', itens: itensAlface }, 'rascunho'),
  ];
  assert.deepEqual(oportunidades({ agricultor, produtos: alface, chamadas: fora, hoje, limiteRestanteReais: 40000 }), []);

  // controle: as mesmas chamadas aparecem com o prazo em hoje ou sem prazo
  const dentro = [
    chamada(5, { municipio: 'Campinas', uf: 'SP', prazo_envio: hoje, itens: itensAlface }),
    chamada(6, { municipio: 'Campinas', uf: 'SP', prazo_envio: null, itens: itensAlface }),
  ];
  const lista = oportunidades({ agricultor, produtos: alface, chamadas: [...fora, ...dentro], hoje, limiteRestanteReais: 40000 });
  assert.deepEqual(lista.map((o) => o.chamada_id), [5, 6]);

  // UF ou município em branco dos dois lados não conta como igual
  const semUf = [chamada(7, { municipio: null, uf: null, itens: itensAlface })];
  assert.deepEqual(oportunidades({ agricultor: { municipio: null, uf: null }, produtos: alface, chamadas: semUf, hoje, limiteRestanteReais: 40000 }), []);
  const semMunicipio = [chamada(8, { municipio: null, uf: 'SP', itens: itensAlface })];
  const [cega] = oportunidades({ agricultor: { municipio: null, uf: 'SP' }, produtos: alface, chamadas: semMunicipio, hoje, limiteRestanteReais: 40000 });
  assert.equal(cega.mesma_cidade, false);
});

test('mesma cidade primeiro e ganho = min(capacidade, pedido) × preço', () => {
  const agricultor = { municipio: 'Catalão', uf: 'GO' };
  const chamadas = [
    // ganho maior, mas em outra cidade; sem semanas na chamada: 30 por semana × 40 semanas = 1200
    chamada(1, { municipio: 'Goiânia', semanas_fornecimento: null, itens: [item('Alface', 'alface', 'kg', 5000, 9)] }),
    // a mesma cidade escrita sem acento e em maiúsculas
    chamada(2, { municipio: 'CATALAO', itens: [item('Alface', 'alface', 'kg', 1000, 5.4), item('Tomate', 'tomate', 'kg', 100, 3)] }),
  ];
  const [primeira, segunda] = oportunidades({ agricultor, produtos: alface, chamadas, hoje: '2026-07-15', limiteRestanteReais: 40000 });
  assert.deepEqual(primeira, {
    chamada_id: 2,
    municipio: 'CATALAO',
    uf: 'GO',
    prazo_envio: '2026-07-30',
    mesma_cidade: true,
    versao_regra: 'res4-original',
    itens: [{ produto_id: 'alface', produto: 'Alface', unidade: 'kg', quantidade_max: 1000, preco_unitario: 5.4, ganho_estimado: 5400 }],
    ganho_total: 5400,
  });
  assert.deepEqual([segunda.chamada_id, segunda.mesma_cidade, segunda.itens[0].quantidade_max, segunda.ganho_total], [1, false, 1200, 10800]);
});

test('ganho respeita limite restante', () => {
  const agricultor = { municipio: 'Catalão', uf: 'GO', vendido_no_ano_reais: 39000 };
  const chamadas = [chamada(1, { itens: [item('Alface', 'alface', 'kg', 1000, 5.4)] })];
  const hoje = '2026-07-15';
  assert.equal(oportunidades({ agricultor, produtos: alface, chamadas, hoje, limiteRestanteReais: 1000 })[0].ganho_total, 1000);
  // sem limiteRestanteReais, a conta sai do vendido_no_ano_reais do agricultor: R$ 40 mil - R$ 39 mil
  assert.equal(oportunidades({ agricultor, produtos: alface, chamadas, hoje })[0].ganho_total, 1000);
});

test('a capacidade vale para a soma dos itens do mesmo produto', () => {
  // o edital de Catalão pede abóbora em dois itens; 25 por semana × 40 semanas = 1000 para os dois juntos
  const agricultor = { municipio: 'Catalão', uf: 'GO' };
  const abobora = (quantidadeSemana) => [{ produto_id: 'abobora', quantidade_semana: quantidadeSemana }];
  const chamadas = [
    chamada(1, {
      itens: [item('Abóbora Cabotiá', 'abobora', 'unidade', 390, 7), item('Abóbora verde', 'abobora', 'kg', 1640, 6.87)],
    }),
  ];
  const hoje = '2026-07-15';
  const [cheia] = oportunidades({ agricultor, produtos: abobora(25), chamadas, hoje, limiteRestanteReais: 40000 });
  assert.deepEqual(cheia.itens.map((i) => [i.quantidade_max, i.ganho_estimado]), [[390, 2730], [610, 4190.7]]);
  assert.equal(cheia.ganho_total, 6920.7);
  // 5 por semana = 200: o primeiro item leva tudo, e o segundo, sem nada para oferecer, sai da lista
  const [pouca] = oportunidades({ agricultor, produtos: abobora(5), chamadas, hoje, limiteRestanteReais: 40000 });
  assert.deepEqual(pouca.itens.map((i) => [i.produto, i.quantidade_max]), [['Abóbora Cabotiá', 200]]);
});
