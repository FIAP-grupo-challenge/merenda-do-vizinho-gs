const test = require('node:test');
const assert = require('node:assert/strict');
const { dividirItem, montarPropostaConjunta } = require('../src/agrupamento');

const SEM_LIMITE = 1e6; // limite em reais que não pesa na divisão

test('divide igualmente e respeita capacidade', () => {
  const r = dividirItem({ quantidade: 900, preco_unitario: 2 }, [
    { agricultor_id: 'a', capacidade: 200, limite_restante_reais: SEM_LIMITE, prioridade: 0 },
    { agricultor_id: 'b', capacidade: 1000, limite_restante_reais: SEM_LIMITE, prioridade: 1 },
    { agricultor_id: 'c', capacidade: 1000, limite_restante_reais: SEM_LIMITE, prioridade: 1 },
  ]);
  assert.deepEqual(r.alocacoes.map((x) => x.quantidade), [200, 350, 350]);
  assert.equal(r.falta, 0);
  assert.equal(r.total, 900);
  // 100,01 em 3 partes: os 2 centésimos que sobram vão um para cada, na ordem
  const igual = { capacidade: 1000, limite_restante_reais: SEM_LIMITE, prioridade: 0 };
  const centesimos = dividirItem({ quantidade: 100.01, preco_unitario: 2 }, ['a', 'b', 'c'].map((agricultor_id) => ({ agricultor_id, ...igual })));
  assert.deepEqual(centesimos.alocacoes.map((x) => x.quantidade), [33.34, 33.34, 33.33]);
});

test('respeita limite em reais', () => {
  const r = dividirItem({ quantidade: 500, preco_unitario: 2 }, [
    { agricultor_id: 'a', capacidade: 1000, limite_restante_reais: 100, prioridade: 0 },
    { agricultor_id: 'b', capacidade: 120, limite_restante_reais: SEM_LIMITE, prioridade: 1 },
  ]);
  // R$ 100 a R$ 2 = no máximo 50 unidades
  assert.deepEqual(r, { alocacoes: [{ agricultor_id: 'a', quantidade: 50 }, { agricultor_id: 'b', quantidade: 120 }], total: 170, falta: 330 });
  // R$ 100 a R$ 6 = 16,66 (16,67 custaria R$ 100,02): o arredondamento nunca passa do limite
  const [{ quantidade }] = dividirItem({ quantidade: 50, preco_unitario: 6 }, [
    { agricultor_id: 'a', capacidade: 100, limite_restante_reais: 100, prioridade: 0 },
  ]).alocacoes;
  assert.equal(quantidade, 16.66);
});

test('a sobra vai primeiro para quem tem mais prioridade', () => {
  const r = dividirItem({ quantidade: 900, preco_unitario: 2 }, [
    { agricultor_id: 'a', capacidade: 100, limite_restante_reais: SEM_LIMITE, prioridade: 5 },
    { agricultor_id: 'b', capacidade: 1000, limite_restante_reais: SEM_LIMITE, prioridade: 0 },
    { agricultor_id: 'c', capacidade: 1000, limite_restante_reais: SEM_LIMITE, prioridade: 3 },
  ]);
  assert.deepEqual(r.alocacoes.map((x) => x.quantidade), [100, 500, 300]);
  // 100 em 3 partes: o centésimo que sobra do arredondamento vai para a maior prioridade (b)
  const terco = dividirItem({ quantidade: 100, preco_unitario: 2 }, [
    { agricultor_id: 'a', capacidade: 1000, limite_restante_reais: SEM_LIMITE, prioridade: 2 },
    { agricultor_id: 'b', capacidade: 1000, limite_restante_reais: SEM_LIMITE, prioridade: 0 },
    { agricultor_id: 'c', capacidade: 1000, limite_restante_reais: SEM_LIMITE, prioridade: 1 },
  ]);
  assert.deepEqual(terco.alocacoes.map((x) => x.quantidade), [33.33, 33.34, 33.33]);
  assert.deepEqual([terco.total, terco.falta], [100, 0]);
});

test('informa falta quando ninguém tem capacidade', () => {
  const r = dividirItem({ quantidade: 500, preco_unitario: 2 }, [
    { agricultor_id: 'a', capacidade: 100, limite_restante_reais: SEM_LIMITE, prioridade: 0 },
    { agricultor_id: 'b', capacidade: 200, limite_restante_reais: SEM_LIMITE, prioridade: 1 },
  ]);
  assert.deepEqual([r.total, r.falta], [300, 200]);
  // sem candidatos; com capacidade zero; e com quem já chegou ao limite do ano
  assert.deepEqual(dividirItem({ quantidade: 500, preco_unitario: 2 }, []), { alocacoes: [], total: 0, falta: 500 });
  assert.deepEqual(
    dividirItem({ quantidade: 500, preco_unitario: 2 }, [
      { agricultor_id: 'c', capacidade: 0, limite_restante_reais: SEM_LIMITE, prioridade: 0 },
      { agricultor_id: 'd', capacidade: 1000, limite_restante_reais: 0, prioridade: 0 },
    ]),
    { alocacoes: [{ agricultor_id: 'c', quantidade: 0 }, { agricultor_id: 'd', quantidade: 0 }], total: 0, falta: 500 },
  );
});

test('nunca passa do pedido, da capacidade nem do limite em reais (500 sorteios)', () => {
  let semente = 1;
  const sorteio = (maximo) => (semente = (semente * 48271) % 2147483647) % maximo; // sempre a mesma sequência
  for (let rodada = 0; rodada < 500; rodada++) {
    const pedido = { quantidade: sorteio(200000) / 100, preco_unitario: (1 + sorteio(9999)) / 100 };
    const candidatos = Array.from({ length: sorteio(6) }, (_, i) => ({
      agricultor_id: i,
      capacidade: sorteio(100000) / 100,
      limite_restante_reais: sorteio(500000) / 100,
      prioridade: sorteio(12),
    }));
    const { alocacoes, total, falta } = dividirItem(pedido, candidatos);
    alocacoes.forEach(({ quantidade }, i) => {
      const { capacidade, limite_restante_reais } = candidatos[i];
      assert.equal(Math.round(quantidade * 100) / 100, quantidade, 'duas casas');
      assert.ok(quantidade <= capacidade, 'capacidade');
      assert.ok(quantidade * pedido.preco_unitario <= limite_restante_reais + 1e-9, 'limite em reais');
      // só falta quando ninguém tem folga: cada um está a menos de 1 centésimo do próprio teto
      if (falta > 0) assert.ok(Math.min(capacidade, limite_restante_reais / pedido.preco_unitario) - quantidade < 0.01, 'folga');
    });
    assert.ok(total <= pedido.quantidade, 'pedido');
    assert.equal(Math.round((total + falta) * 100), Math.round(pedido.quantidade * 100), 'total + falta = pedido');
  }
});

test('o limite anual vale para a soma dos itens', () => {
  const chamada = {
    itens: [
      { produto: 'Alface', produto_id: 'alface', unidade: 'kg', quantidade: 100, preco_unitario: 8 },
      { produto: 'Couve', produto_id: 'couve', unidade: 'maço', quantidade: 100, preco_unitario: 8 },
    ],
  };
  const cooperados = [{ agricultor_id: 7, nome: 'Ana', prioridade: 6, limite_restante_reais: 1000, capacidades: { alface: 1000, couve: 1000 } }];
  const { itens } = montarPropostaConjunta(chamada, cooperados);
  // R$ 800 no primeiro item e só R$ 200 no segundo
  assert.deepEqual(itens.map((i) => i.alocacoes[0].quantidade * i.preco_unitario), [800, 200]);
  assert.deepEqual(itens[1], {
    produto_id: 'couve',
    produto: 'Couve',
    unidade: 'maço',
    preco_unitario: 8,
    quantidade_pedida: 100,
    alocacoes: [{ agricultor_id: 7, quantidade: 25 }],
    total: 25,
    falta: 75,
  });
});

test('a capacidade também vale para a soma dos itens do mesmo produto, e só entra quem produz o item', () => {
  // o edital de Catalão pede abóbora em dois itens
  const chamada = {
    itens: [
      { produto: 'Abóbora Cabotiá', produto_id: 'abobora', unidade: 'unidade', quantidade: 390, preco_unitario: 7 },
      { produto: 'Abóbora verde', produto_id: 'abobora', unidade: 'kg', quantidade: 1640, preco_unitario: 6.87 },
      { produto: 'Alface', produto_id: 'alface', unidade: 'pç', quantidade: 100, preco_unitario: 7.03 },
    ],
  };
  const cooperados = [
    { agricultor_id: 1, nome: 'Davi', prioridade: 5, limite_restante_reais: 40000, capacidades: { abobora: 1000 } },
    { agricultor_id: 2, nome: 'Carla', prioridade: 4, limite_restante_reais: 40000, capacidades: { alface: 800 } },
  ];
  const { itens } = montarPropostaConjunta(chamada, cooperados);
  assert.deepEqual(
    itens.map((i) => [i.alocacoes, i.falta]),
    [
      [[{ agricultor_id: 1, quantidade: 390 }], 0],
      [[{ agricultor_id: 1, quantidade: 610 }], 1030],
      [[{ agricultor_id: 2, quantidade: 100 }], 0],
    ],
  );
  assert.deepEqual(cooperados[0].capacidades, { abobora: 1000 }, 'não mexe na entrada');
});
