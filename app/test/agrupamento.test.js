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

test('Catalão: a alface em pç sai em números inteiros entre os cooperados da semente, e em kg seguiria com centésimos', () => {
  // Ana, Carla, Elisa e Fábio plantam alface; o Fábio só tem R$ 2.000 de limite (284,49 pés a R$ 7,03)
  const alfaces = [
    { agricultor_id: 'ana', capacidade: 1000, limite_restante_reais: 40000, prioridade: 6 },
    { agricultor_id: 'carla', capacidade: 800, limite_restante_reais: 40000, prioridade: 7 },
    { agricultor_id: 'elisa', capacidade: 600, limite_restante_reais: 40000, prioridade: 8 },
    { agricultor_id: 'fabio', capacidade: 600, limite_restante_reais: 2000, prioridade: 11 },
  ];
  const pedido = { quantidade: 2280, preco_unitario: 7.03 };
  const emKg = dividirItem({ ...pedido, unidade: 'kg' }, alfaces);
  assert.deepEqual(emKg.alocacoes.map((x) => x.quantidade), [855.51, 570, 570, 284.49]);
  const emPeca = dividirItem({ ...pedido, unidade: 'pç' }, alfaces);
  // o Fábio leva 284 (R$ 1.996,52), e os 286 que sobram vão todos para a Ana, que tem a maior prioridade
  assert.deepEqual(emPeca.alocacoes.map((x) => x.quantidade), [856, 570, 570, 284]);
  assert.deepEqual([emPeca.total, emPeca.falta], [2280, 0]);

  // montarPropostaConjunta aplica a regra item a item, pela unidade de cada um (escrita como o edital a escreve): a abóbora
  // Cabotiá (unidade) é inteira, a verde (kg) mantém os centésimos, e o que sobra da capacidade do Davi (1000,5) passa de um
  // item para o outro
  const chamada = {
    itens: [
      { produto: 'Abóbora Cabotiá', produto_id: 'abobora', unidade: 'Unidade', quantidade: 390, preco_unitario: 7 },
      { produto: 'Abóbora verde', produto_id: 'abobora', unidade: 'kg', quantidade: 1640, preco_unitario: 6.87 },
      { produto: 'Alface', produto_id: 'alface', unidade: 'Pç', quantidade: 2280, preco_unitario: 7.03 },
    ],
  };
  const cooperados = [
    { agricultor_id: 'davi', nome: 'Davi', prioridade: 7, limite_restante_reais: 40000, capacidades: { abobora: 1000.5 } },
    ...alfaces.map(({ agricultor_id, capacidade, ...resto }) => ({
      agricultor_id,
      nome: agricultor_id,
      ...resto,
      capacidades: { alface: capacidade },
    })),
  ];
  const { itens } = montarPropostaConjunta(chamada, cooperados);
  assert.deepEqual(itens[0].alocacoes, [{ agricultor_id: 'davi', quantidade: 390 }]);
  assert.deepEqual(itens[1].alocacoes, [{ agricultor_id: 'davi', quantidade: 610.5 }]);
  assert.deepEqual(itens[2].alocacoes.map((x) => x.quantidade), [856, 570, 570, 284]);
});

test('em unidade inteira a sobra também é repartida em inteiros, por prioridade, e o pedido fracionado deixa o resto como falta', () => {
  const quem = (prioridade, capacidade = 1000, limite = SEM_LIMITE) => ({ capacidade, limite_restante_reais: limite, prioridade });
  const dividir = (quantidade, candidatos, unidade = 'pç', preco_unitario = 2) =>
    dividirItem({ quantidade, preco_unitario, unidade }, candidatos.map((c, i) => ({ agricultor_id: i, ...c })));
  const quantidades = (resultado) => resultado.alocacoes.map((x) => x.quantidade);

  // 100 pç em 3 partes: a que sobra vai para o primeiro da lista; em kg seriam centésimos
  assert.deepEqual(quantidades(dividir(100, [quem(0), quem(0), quem(0)])), [34, 33, 33]);
  assert.deepEqual(quantidades(dividir(100, [quem(0), quem(0), quem(0)], 'kg')), [33.34, 33.33, 33.33]);
  // a sobra de 2 em 1001 pç se reparte entre os dois do nível de maior prioridade, e o terceiro fica com a parte igual
  assert.deepEqual(quantidades(dividir(1001, [quem(0), quem(0), quem(5)])), [334, 334, 333]);
  // quem chega ao teto na parte igual deixa a sobra para os outros, na ordem da prioridade: 901 = 300 + 300 + 100 + 201
  assert.deepEqual(quantidades(dividir(901, [quem(5, 100), quem(0), quem(3)])), [100, 501, 300]);
  // o teto também é inteiro: a capacidade de 10,9 vale 10, e R$ 100 a R$ 6 valem 16 pç (16,66 em kg)
  assert.deepEqual(quantidades(dividir(50, [quem(0, 10.9)])), [10]);
  assert.deepEqual(quantidades(dividir(50, [quem(0, 100, 100)], 'pç', 6)), [16]);
  assert.deepEqual(quantidades(dividir(50, [quem(0, 100, 100)], 'kg', 6)), [16.66]);
  // quem não chega a 1 pç de capacidade fica de fora, com zero
  assert.deepEqual(dividir(10, [quem(0, 0.9), quem(1)]), {
    alocacoes: [{ agricultor_id: 0, quantidade: 0 }, { agricultor_id: 1, quantidade: 10 }],
    total: 10,
    falta: 0,
  });
  // pedido de 12,5 pç: só dá para entregar 12, e o 0,5 continua faltando (total + falta = pedido)
  const meio = dividir(12.5, [quem(0), quem(1)]);
  assert.deepEqual(quantidades(meio), [6, 6]);
  assert.deepEqual([meio.total, meio.falta], [12, 0.5]);
  assert.equal(dividir(100.3, [quem(0)]).falta, 0.3); // 100,3 - 100 dá 0.2999999999999972 sem o arredondamento
  // sem folga de verdade, a falta é inteira: 100 pç pedidas, 30 de capacidade
  const curto = dividir(100, [quem(0, 30)]);
  assert.deepEqual([curto.total, curto.falta], [30, 70]);
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
  // 500 sorteios em kg (2 casas) e 500 em pç (unidade inteira: só números inteiros, e o passo da folga é 1 em vez de 0,01)
  for (const [unidade, inteira] of [['kg', false], ['pç', true]]) {
    const passo = inteira ? 1 : 0.01;
    for (let rodada = 0; rodada < 500; rodada++) {
      const pedido = { quantidade: inteira ? sorteio(2000) : sorteio(200000) / 100, preco_unitario: (1 + sorteio(9999)) / 100, unidade };
      const candidatos = Array.from({ length: sorteio(6) }, (_, i) => ({
        agricultor_id: i,
        capacidade: sorteio(100000) / 100, // com centésimos também em pç: o teto é a parte inteira
        limite_restante_reais: sorteio(500000) / 100,
        prioridade: sorteio(12),
      }));
      const { alocacoes, total, falta } = dividirItem(pedido, candidatos);
      const onde = `${unidade}, sorteio ${rodada}`;
      alocacoes.forEach(({ quantidade }, i) => {
        const { capacidade, limite_restante_reais } = candidatos[i];
        assert.ok(inteira ? Number.isInteger(quantidade) : Math.round(quantidade * 100) / 100 === quantidade, `${onde}: casas`);
        assert.ok(quantidade >= 0 && quantidade <= capacidade, `${onde}: capacidade`);
        assert.ok(quantidade * pedido.preco_unitario <= limite_restante_reais + 1e-9, `${onde}: limite em reais`);
        // só falta quando ninguém tem folga: cada um está a menos de um passo do próprio teto
        if (falta > 0) {
          const teto = Math.min(capacidade, limite_restante_reais / pedido.preco_unitario);
          assert.ok(teto - quantidade < passo, `${onde}: folga`);
        }
      });
      assert.ok(total <= pedido.quantidade, `${onde}: pedido`);
      assert.equal(Math.round((total + falta) * 100), Math.round(pedido.quantidade * 100), `${onde}: total + falta = pedido`);
    }
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

test('o limite anual vale para a soma das linhas arredondadas ao centavo (caso de meio centavo)', () => {
  // 12,5 × R$ 8,01 = R$ 100,125, que o projeto de venda imprime como R$ 100,13; do limite de R$ 200,25 sobram R$ 100,12,
  // e as duas linhas impressas (100,13 + 100,12) somam o limite, nem um centavo a mais
  const chamada = {
    itens: [
      { produto: 'P', produto_id: 'p', unidade: 'kg', quantidade: 12.5, preco_unitario: 8.01 },
      { produto: 'Q', produto_id: 'q', unidade: 'kg', quantidade: 1000, preco_unitario: 1 },
    ],
  };
  const cooperados = [{ agricultor_id: 1, nome: 'Ana', prioridade: 0, limite_restante_reais: 200.25, capacidades: { p: 1000, q: 1000 } }];
  const { itens } = montarPropostaConjunta(chamada, cooperados);
  assert.deepEqual(itens.map((i) => i.alocacoes[0].quantidade), [12.5, 100.12]);
});

test('o limite anual vale até o último centavo: o que sobra do 1º item vale inteiro no 2º', () => {
  // R$ 40.000 - R$ 39.999,90 = R$ 0,10, que em JavaScript dá 0.09999999999854481 e perderia o último centavo
  const chamada = {
    itens: [
      { produto: 'P', produto_id: 'p', unidade: 'kg', quantidade: 39999.9, preco_unitario: 1 },
      { produto: 'Q', produto_id: 'q', unidade: 'kg', quantidade: 100, preco_unitario: 1 },
    ],
  };
  const cooperados = [{ agricultor_id: 1, nome: 'Ana', prioridade: 0, limite_restante_reais: 40000, capacidades: { p: 1e6, q: 1e6 } }];
  const { itens } = montarPropostaConjunta(chamada, cooperados);
  assert.deepEqual(itens.map((i) => i.alocacoes[0].quantidade), [39999.9, 0.1]);
});

test('a capacidade do produto vale até o último centésimo: o que sobra do 1º item vale inteiro no 2º', () => {
  // 40000 - 39999,9 = 0,1 (0.09999999999854481 em JavaScript); o mesmo produto em dois itens, sem limite em reais que pese
  const chamada = {
    itens: [
      { produto: 'Abóbora A', produto_id: 'abobora', unidade: 'kg', quantidade: 39999.9, preco_unitario: 1 },
      { produto: 'Abóbora B', produto_id: 'abobora', unidade: 'kg', quantidade: 100, preco_unitario: 1 },
    ],
  };
  const cooperados = [{ agricultor_id: 1, nome: 'Davi', prioridade: 0, limite_restante_reais: 1e6, capacidades: { abobora: 40000 } }];
  const { itens } = montarPropostaConjunta(chamada, cooperados);
  assert.deepEqual(itens.map((i) => i.alocacoes[0].quantidade), [39999.9, 0.1]);
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
