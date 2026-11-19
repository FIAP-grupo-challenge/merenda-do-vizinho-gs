// Prefeitura, cooperativa e projeto de venda (T9): rotas e a chamada de Catalão semeada. A IA é falsa (um objeto
// com extrairChamada), salvo no teste da IA fora do ar, que usa o cliente de verdade numa porta fechada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { produtoExiste } = require('../src/catalogo');
const { oportunidades } = require('../src/casamento');
const { criarClienteIa } = require('../src/cliente-ia');
const { arredondar } = require('../src/regras-pnae');
const { semear } = require('../src/semente');
const { subirApp } = require('./ajuda');

const idDe = (app, email) => app.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email).id;
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
const somar = (lista, campo) => arredondar(lista.reduce((total, x) => total + x[campo], 0));

// Uma chamada no formato da IA (T2), de Catalão (GO), com prazo de 30 dias.
function chamadaExemplo(mudancas = {}) {
  return {
    numero: '010/2026',
    orgao: 'Fundo Municipal de Educação de Catalão',
    municipio: 'Catalão',
    uf: 'GO',
    data_publicacao: '2026-07-01',
    prazo_envio: '2026-07-31',
    periodo_fornecimento: null,
    semanas_fornecimento: null,
    local_entrega: null,
    documentos_exigidos: [],
    criterios_prioridade: [],
    contato: null,
    itens: [item('Alface', 'alface', 'pç', 100, 7.03), item('Mandioca', 'mandioca', 'kg', 300, 11.71)],
    ...mudancas,
  };
}

// IA falsa: devolve `resposta` (que o teste pode trocar) e guarda o corpo de cada pedido.
function iaFalsa(chamada, avisos = []) {
  const ia = {
    recebidos: [],
    resposta: { origem: 'ia', modelo: 'claude-haiku-5-5', duracao_ms: 17752, chamada, avisos },
    async extrairChamada(corpo) {
      ia.recebidos.push(corpo);
      return structuredClone(ia.resposta);
    },
  };
  return ia;
}

// Chamada gravada direto no banco, da prefeitura@demo.br (as rotas da prefeitura têm os testes delas).
function inserirChamada(app, dados, status = 'publicada') {
  const momento = '2026-07-01T12:00:00.000Z';
  const { lastInsertRowid } = app.db
    .prepare("INSERT INTO chamadas (prefeitura_id, dados, status, origem, criada_em, publicada_em) VALUES (?, ?, ?, 'ia', ?, ?)")
    .run(idDe(app, 'prefeitura@demo.br'), JSON.stringify(dados), status, momento, status === 'publicada' ? momento : null);
  return Number(lastInsertRowid);
}

// O interesse que a tela do agricultor (T8) grava: um produto e a quantidade que ele quer vender.
function marcarInteresse(app, email, chamadaId, produtoId, quantidade) {
  app.db
    .prepare('INSERT INTO interesses (agricultor_id, chamada_id, produto_id, quantidade) VALUES (?, ?, ?, ?)')
    .run(idDe(app, email), chamadaId, produtoId, quantidade);
}

// `item`: a posição do item na proposta, como a câmara fria grava; sem ela, é uma entrega antiga
function inserirEntrega(app, propostaId, produtoId, quantidade, valor, data, noPrazo = 1, item = null) {
  app.db
    .prepare('INSERT INTO entregas (proposta_id, produto_id, item, quantidade, valor, data, no_prazo) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(propostaId, produtoId, item, quantidade, valor, data, noPrazo);
}

const chamadaSemeada = (app) => app.db.prepare("SELECT * FROM chamadas WHERE origem = 'cache'").get();

// Uma porta em que nada escuta: abre numa porta livre e fecha.
function portaFechada() {
  return new Promise((resolve) => {
    const servidor = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

// Outra conta pelo cadastro, para os testes de "outra prefeitura" e "outra cooperativa". Devolve o token.
async function outraConta(app, papel) {
  const daCooperativa = papel === 'cooperativa' ? { cnpj: '11222333000181', municipio: 'Catalão', uf: 'GO' } : {};
  const corpo = { email: `outra@${papel}.br`, senha: 'senha-forte', papel, nome: `Outra ${papel}`, ...daCooperativa };
  return (await app.pedir('POST', '/api/cadastro', { corpo })).corpo.token;
}

test('agricultor não acessa rota de prefeitura (403)', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const [ana, cooperativa, prefeitura] = await Promise.all(
    ['ana@demo.br', 'cooperativa@demo.br', 'prefeitura@demo.br'].map((email) => app.entrar(email)),
  );
  const pedir = (metodo, caminho, token) => app.pedir(metodo, caminho, { token, corpo: metodo === 'GET' ? undefined : {} });

  const daPrefeitura = [
    ['GET', '/api/prefeitura/chamadas'],
    ['POST', '/api/prefeitura/chamadas'],
    ['GET', '/api/prefeitura/chamadas/1'],
    ['PUT', '/api/prefeitura/chamadas/1'],
    ['POST', '/api/prefeitura/chamadas/1/publicar'],
    ['PUT', '/api/prefeitura/repasse'],
    ['GET', '/api/prefeitura/resumo'],
  ];
  for (const [metodo, caminho] of daPrefeitura) {
    assert.equal((await pedir(metodo, caminho, ana)).status, 403, `agricultor: ${metodo} ${caminho}`);
    assert.equal((await pedir(metodo, caminho, cooperativa)).status, 403, `cooperativa: ${metodo} ${caminho}`);
    assert.equal((await pedir(metodo, caminho)).status, 401, `sem login: ${metodo} ${caminho}`);
  }
  const daCooperativa = [
    ['GET', '/api/cooperativa/chamadas'],
    ['POST', '/api/cooperativa/chamadas/1/proposta'],
    ['GET', '/api/cooperativa/propostas'],
    ['GET', '/api/cooperativa/propostas/1'],
    ['PUT', '/api/cooperativa/propostas/1'],
    ['GET', '/api/cooperativa/propostas/1/projeto-venda'],
  ];
  for (const [metodo, caminho] of daCooperativa) {
    assert.equal((await pedir(metodo, caminho, ana)).status, 403, `agricultor: ${metodo} ${caminho}`);
    assert.equal((await pedir(metodo, caminho, prefeitura)).status, 403, `prefeitura: ${metodo} ${caminho}`);
  }
  assert.equal((await pedir('GET', '/api/agricultor/chamadas/1/projeto-venda', cooperativa)).status, 403);
  assert.equal((await pedir('GET', '/api/agricultor/chamadas/1/projeto-venda', prefeitura)).status, 403);
  // controle: cada papel entra nas suas
  assert.equal((await pedir('GET', '/api/prefeitura/chamadas', prefeitura)).status, 200);
  assert.equal((await pedir('GET', '/api/cooperativa/chamadas', cooperativa)).status, 200);
});

test('prefeitura envia texto, recebe rascunho e publica', async (t) => {
  const ia = iaFalsa(chamadaExemplo(), ['confira os preços']);
  const app = await subirApp({ ia });
  t.after(app.fechar);
  const prefeitura = await app.entrar('prefeitura@demo.br');
  const cooperativa = await app.entrar('cooperativa@demo.br');
  const texto = 'CHAMADA PÚBLICA Nº 010/2026 ... Alface Pç 100 R$ 7,03';

  const criada = await app.pedir('POST', '/api/prefeitura/chamadas', { token: prefeitura, corpo: { texto } });
  assert.equal(criada.status, 201);
  assert.deepEqual(ia.recebidos, [{ texto }]);
  const { id, ...resto } = criada.corpo;
  assert.ok(Number.isInteger(id));
  assert.deepEqual(resto, {
    chamada: chamadaExemplo(),
    origem: 'ia',
    modelo: 'claude-haiku-5-5',
    duracao_ms: 17752,
    avisos: ['confira os preços'],
  });

  // rascunho: a cooperativa ainda não vê
  const visiveis = async () => (await app.pedir('GET', '/api/cooperativa/chamadas', { token: cooperativa })).corpo;
  assert.ok(!(await visiveis()).some((chamada) => chamada.id === id));
  const lista = await app.pedir('GET', '/api/prefeitura/chamadas', { token: prefeitura });
  const { criada_em, ...naLista } = lista.corpo.find((chamada) => chamada.id === id);
  assert.ok(!Number.isNaN(Date.parse(criada_em)));
  assert.deepEqual(naLista, {
    id,
    numero: '010/2026',
    municipio: 'Catalão',
    uf: 'GO',
    prazo_envio: '2026-07-31',
    status: 'rascunho',
    origem: 'ia',
    publicada_em: null,
    propostas: 0,
  });
  const detalhe = await app.pedir('GET', `/api/prefeitura/chamadas/${id}`, { token: prefeitura });
  assert.equal(detalhe.status, 200);
  assert.deepEqual([detalhe.corpo.status, detalhe.corpo.origem, detalhe.corpo.propostas], ['rascunho', 'ia', []]);

  // troca o número e um item, e remove o outro (a lista de itens vem inteira)
  const editada = await app.pedir('PUT', `/api/prefeitura/chamadas/${id}`, {
    token: prefeitura,
    corpo: { numero: ' 011/2026 ', itens: [{ produto: 'Alface crespa', produto_id: 'alface', unidade: 'pç', quantidade: 120, preco_unitario: 7.5 }] },
  });
  assert.equal(editada.status, 200);
  assert.equal(editada.corpo.chamada.numero, '011/2026');
  assert.equal(editada.corpo.chamada.orgao, 'Fundo Municipal de Educação de Catalão', 'campo que não veio fica como estava');
  assert.deepEqual(editada.corpo.chamada.itens, [
    { ...item('Alface crespa', 'alface', 'pç', 120, 7.5), valor_total: 900 },
  ]);

  const publicada = await app.pedir('POST', `/api/prefeitura/chamadas/${id}/publicar`, { token: prefeitura });
  assert.equal(publicada.status, 200);
  assert.equal(publicada.corpo.status, 'publicada');
  assert.ok(publicada.corpo.publicada_em);
  // publicada não muda mais: 409 ao editar e ao publicar de novo
  const depois = await app.pedir('PUT', `/api/prefeitura/chamadas/${id}`, { token: prefeitura, corpo: { numero: '012/2026' } });
  assert.equal(depois.status, 409);
  assert.ok(depois.corpo.erro);
  assert.equal((await app.pedir('POST', `/api/prefeitura/chamadas/${id}/publicar`, { token: prefeitura })).status, 409);
  assert.equal(JSON.parse(app.db.prepare('SELECT dados FROM chamadas WHERE id = ?').get(id).dados).numero, '011/2026');

  // a cooperativa de GO agora vê; uma chamada publicada de SP, não
  const deSp = inserirChamada(app, chamadaExemplo({ uf: 'SP', municipio: 'Campinas' }));
  const agora = await visiveis();
  assert.deepEqual(agora.find((chamada) => chamada.id === id), {
    id,
    numero: '011/2026',
    orgao: 'Fundo Municipal de Educação de Catalão',
    municipio: 'Catalão',
    uf: 'GO',
    data_publicacao: '2026-07-01',
    prazo_envio: '2026-07-31',
    proposta_id: null,
  });
  assert.ok(!agora.some((chamada) => chamada.id === deSp));

  // PDF: confere o início JVBER antes de chamar a IA
  const naoPdf = await app.pedir('POST', '/api/prefeitura/chamadas', { token: prefeitura, corpo: { pdf_base64: 'aGVsbG8=' } });
  assert.equal(naoPdf.status, 400);
  assert.equal((await app.pedir('POST', '/api/prefeitura/chamadas', { token: prefeitura, corpo: {} })).status, 400);
  assert.equal((await app.pedir('POST', '/api/prefeitura/chamadas', { token: prefeitura, corpo: { texto: '  ' } })).status, 400);
  assert.equal(ia.recebidos.length, 1, 'os pedidos recusados não chegam à IA');
  const pdf = await app.pedir('POST', '/api/prefeitura/chamadas', { token: prefeitura, corpo: { pdf_base64: 'JVBERi0xLjQK' } });
  assert.equal(pdf.status, 201);
  assert.deepEqual(ia.recebidos[1], { pdf_base64: 'JVBERi0xLjQK' });

  // outra prefeitura não vê nem mexe na chamada desta
  const deOutra = await outraConta(app, 'prefeitura');
  assert.equal((await app.pedir('GET', `/api/prefeitura/chamadas/${pdf.corpo.id}`, { token: deOutra })).status, 404);
  assert.equal((await app.pedir('PUT', `/api/prefeitura/chamadas/${pdf.corpo.id}`, { token: deOutra, corpo: { numero: 'x' } })).status, 404);
  assert.equal((await app.pedir('POST', `/api/prefeitura/chamadas/${pdf.corpo.id}/publicar`, { token: deOutra })).status, 404);
  assert.deepEqual((await app.pedir('GET', '/api/prefeitura/chamadas', { token: deOutra })).corpo, []);
});

test('prefeitura inclui um item à mão num rascunho sem itens e publica', async (t) => {
  const ia = iaFalsa(chamadaExemplo({ itens: [] }), ['nenhuma tabela de itens encontrada; confira à mão']);
  const app = await subirApp({ ia });
  t.after(app.fechar);
  const token = await app.entrar('prefeitura@demo.br');
  const criada = await app.pedir('POST', '/api/prefeitura/chamadas', { token, corpo: { pdf_base64: 'JVBERi0xLjQK' } });
  assert.equal(criada.status, 201);
  assert.deepEqual(criada.corpo.avisos, ['nenhuma tabela de itens encontrada; confira à mão']);
  const { id } = criada.corpo;

  // sem itens não publica
  const vazia = await app.pedir('POST', `/api/prefeitura/chamadas/${id}/publicar`, { token });
  assert.equal(vazia.status, 400);
  assert.match(vazia.corpo.erro, /item/i);

  // número negativo, zero ou que não é número, alimento vazio e produto fora do catálogo: 400, e nada muda
  const certo = { produto: 'Mandioca descascada', produto_id: 'mandioca', unidade: 'kg', quantidade: 300, preco_unitario: 11.71 };
  const ruins = [
    { ...certo, quantidade: -5 },
    { ...certo, preco_unitario: -1 },
    { ...certo, quantidade: 0 },
    { ...certo, quantidade: '300' },
    { ...certo, produto: ' ' },
    { ...certo, produto_id: 'nao-existe' },
  ];
  for (const ruim of ruins) {
    const resposta = await app.pedir('PUT', `/api/prefeitura/chamadas/${id}`, { token, corpo: { itens: [ruim] } });
    assert.equal(resposta.status, 400, JSON.stringify(ruim));
    assert.ok(resposta.corpo.erro);
  }
  for (const campo of [{ uf: 'XX' }, { prazo_envio: '30/07/2026' }, { semanas_fornecimento: -1 }, { itens: 'alface' }, { documentos_exigidos: 'CPF' }]) {
    assert.equal((await app.pedir('PUT', `/api/prefeitura/chamadas/${id}`, { token, corpo: campo })).status, 400, JSON.stringify(campo));
  }
  assert.deepEqual(JSON.parse(app.db.prepare('SELECT dados FROM chamadas WHERE id = ?').get(id).dados).itens, []);

  // o item à mão entra (produto do catálogo ou não), e a chamada publica
  const salva = await app.pedir('PUT', `/api/prefeitura/chamadas/${id}`, {
    token,
    corpo: { itens: [certo, { produto: 'Doce de leite', produto_id: null, unidade: 'kg', quantidade: 10, preco_unitario: 30 }] },
  });
  assert.equal(salva.status, 200);
  assert.deepEqual(salva.corpo.chamada.itens, [
    { ...certo, valor_total: 3513, entrega: null, observacoes: null },
    { produto: 'Doce de leite', produto_id: null, unidade: 'kg', quantidade: 10, preco_unitario: 30, valor_total: 300, entrega: null, observacoes: null },
  ]);
  const publicada = await app.pedir('POST', `/api/prefeitura/chamadas/${id}/publicar`, { token });
  assert.equal(publicada.status, 200);
  assert.equal(app.db.prepare('SELECT status FROM chamadas WHERE id = ?').get(id).status, 'publicada');

  // publicar direto o que a IA leu também confere os itens, e exige a UF (é por ela que a chamada é achada)
  ia.resposta.chamada = chamadaExemplo({ uf: null, itens: [item('Alface', 'alface', 'pç', 100, null)] });
  const { id: outra } = (await app.pedir('POST', '/api/prefeitura/chamadas', { token, corpo: { texto: 'edital' } })).corpo;
  const semPreco = await app.pedir('POST', `/api/prefeitura/chamadas/${outra}/publicar`, { token });
  assert.equal(semPreco.status, 400);
  assert.match(semPreco.corpo.erro, /preço/);
  assert.equal((await app.pedir('PUT', `/api/prefeitura/chamadas/${outra}`, { token, corpo: { itens: [certo] } })).status, 200);
  const semUf = await app.pedir('POST', `/api/prefeitura/chamadas/${outra}/publicar`, { token });
  assert.equal(semUf.status, 400);
  assert.match(semUf.corpo.erro, /UF/);
  assert.equal((await app.pedir('PUT', `/api/prefeitura/chamadas/${outra}`, { token, corpo: { uf: 'go' } })).corpo.chamada.uf, 'GO');
  assert.equal((await app.pedir('POST', `/api/prefeitura/chamadas/${outra}/publicar`, { token })).status, 200);
});

test('IA fora do ar devolve 502 com erro legível', async (t) => {
  const app = await subirApp({ ia: criarClienteIa(`http://127.0.0.1:${await portaFechada()}`) });
  t.after(app.fechar);
  const token = await app.entrar('prefeitura@demo.br');
  const contar = () => app.db.prepare('SELECT COUNT(*) AS n FROM chamadas').get().n;
  const antes = contar();
  const resposta = await app.pedir('POST', '/api/prefeitura/chamadas', { token, corpo: { texto: 'Chamada pública' } });
  assert.equal(resposta.status, 502);
  assert.deepEqual(resposta.corpo, { erro: 'O serviço de IA não respondeu. Tente de novo em instantes.' });
  assert.equal(contar(), antes, 'nada foi gravado');

  // IA que responde fora do formato (sem a chamada): também 502, e nada gravado
  const torta = await subirApp({ ia: { extrairChamada: async () => ({ origem: 'ia', avisos: [] }) } });
  t.after(torta.fechar);
  const outra = await torta.pedir('POST', '/api/prefeitura/chamadas', { token: await torta.entrar('prefeitura@demo.br'), corpo: { texto: 'x' } });
  assert.equal(outra.status, 502);
  assert.ok(outra.corpo.erro);
});

test('prazo menor que 20 dias gera aviso no rascunho', async (t) => {
  const ia = iaFalsa(chamadaExemplo({ data_publicacao: '2026-07-20', prazo_envio: '2026-07-30' }), ['aviso da IA']);
  const app = await subirApp({ ia });
  t.after(app.fechar);
  const token = await app.entrar('prefeitura@demo.br');
  const criada = await app.pedir('POST', '/api/prefeitura/chamadas', { token, corpo: { texto: 'edital' } });
  assert.equal(criada.status, 201);
  const { id, avisos } = criada.corpo;
  assert.equal(avisos.length, 2);
  assert.equal(avisos[0], 'aviso da IA', 'os avisos da IA vêm primeiro');
  assert.match(avisos[1], /prazo menor que 20 dias corridos/);
  assert.match((await app.pedir('GET', `/api/prefeitura/chamadas/${id}`, { token })).corpo.avisos.join(), /prazo menor que 20 dias corridos/);

  // corrigido o prazo (20 dias contados como o edital: sem o dia do início), o aviso some
  const corrigida = await app.pedir('PUT', `/api/prefeitura/chamadas/${id}`, { token, corpo: { prazo_envio: '2026-08-09' } });
  assert.equal(corrigida.status, 200);
  assert.deepEqual(corrigida.corpo.avisos, []);
  // controle: 30 dias não avisam
  ia.resposta.chamada = chamadaExemplo();
  ia.resposta.avisos = [];
  assert.deepEqual((await app.pedir('POST', '/api/prefeitura/chamadas', { token, corpo: { texto: 'edital' } })).corpo.avisos, []);
});

test('prefeitura vê as propostas e as entregas da chamada', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const prefeitura = await app.entrar('prefeitura@demo.br');
  const cooperativa = await app.entrar('cooperativa@demo.br');
  const { id: chamadaId } = chamadaSemeada(app);
  const proposta = await app.pedir('POST', `/api/cooperativa/chamadas/${chamadaId}/proposta`, { token: cooperativa });
  assert.equal(proposta.status, 201);
  const posicao = (produtoId) => proposta.corpo.itens.findIndex((it) => it.produto_id === produtoId);
  inserirEntrega(app, proposta.corpo.id, 'alface', 100, 703, '2026-08-05', 1, posicao('alface'));
  inserirEntrega(app, proposta.corpo.id, 'mandioca', 50, 585.5, '2026-08-06', 0, posicao('mandioca'));
  inserirEntrega(app, proposta.corpo.id, 'tomate', 1, 12.04, '2026-08-07'); // entrega antiga: sem a posição do item

  const lista = await app.pedir('GET', '/api/prefeitura/chamadas', { token: prefeitura });
  assert.equal(lista.corpo.find((chamada) => chamada.id === chamadaId).propostas, 1);
  const detalhe = await app.pedir('GET', `/api/prefeitura/chamadas/${chamadaId}`, { token: prefeitura });
  assert.equal(detalhe.status, 200);
  assert.equal(detalhe.corpo.chamada.numero, '003/2026');
  assert.equal(detalhe.corpo.propostas.length, 1);
  const [recebida] = detalhe.corpo.propostas;
  assert.equal(recebida.id, proposta.corpo.id);
  assert.deepEqual(recebida.cooperativa, { nome: 'Cooperativa Vizinhos do Campo', municipio: 'Catalão', uf: 'GO' });
  assert.equal(recebida.itens.length, 16);
  assert.equal(recebida.total, somar(recebida.itens, 'valor'));
  assert.equal(recebida.total, proposta.corpo.total);
  const { alocacoes, ...alfaceSemAlocacoes } = proposta.corpo.itens.find((it) => it.produto_id === 'alface');
  assert.ok(alocacoes.length > 0);
  assert.deepEqual(recebida.itens.find((it) => it.produto_id === 'alface'), alfaceSemAlocacoes);
  assert.deepEqual(recebida.entregas.map(({ id, ...entrega }) => entrega), [
    { produto_id: 'alface', item: posicao('alface'), quantidade: 100, valor: 703, data: '2026-08-05', no_prazo: true },
    { produto_id: 'mandioca', item: posicao('mandioca'), quantidade: 50, valor: 585.5, data: '2026-08-06', no_prazo: false },
    { produto_id: 'tomate', item: null, quantidade: 1, valor: 12.04, data: '2026-08-07', no_prazo: true },
  ]);
  // a prefeitura vê os totais da proposta, não quem planta o quê
  assert.ok(!JSON.stringify(detalhe.corpo).includes('agricultor_id'));
});

test('proposta conjunta nunca passa do pedido', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('cooperativa@demo.br');
  const id = inserirChamada(
    app,
    chamadaExemplo({
      itens: [item('Alface', 'alface', 'pç', 100, 7.03), item('Mandioca', 'mandioca', 'kg', 3000, 11.71), item('Couve', 'couve', 'pç', 50, 7.37)],
    }),
  );
  // três agricultoras querem 190 pés de alface, para 100 pedidos
  marcarInteresse(app, 'ana@demo.br', id, 'alface', 80);
  marcarInteresse(app, 'carla@demo.br', id, 'alface', 60);
  marcarInteresse(app, 'elisa@demo.br', id, 'alface', 50);
  marcarInteresse(app, 'ana@demo.br', id, 'mandioca', 1200);
  marcarInteresse(app, 'davi@demo.br', id, 'mandioca', 5000); // mais do que ele produz: 25 kg × 40 semanas = 1000
  marcarInteresse(app, 'carla@demo.br', id, 'couve', 10);

  const resposta = await app.pedir('POST', `/api/cooperativa/chamadas/${id}/proposta`, { token });
  assert.equal(resposta.status, 201);
  const proposta = resposta.corpo;
  for (const it of proposta.itens) {
    const soma = somar(it.alocacoes, 'quantidade');
    assert.ok(soma <= it.quantidade_pedida, `${it.produto}: ${soma} > ${it.quantidade_pedida}`);
    assert.equal(it.quantidade, soma);
    assert.equal(arredondar(it.quantidade + it.falta), it.quantidade_pedida);
  }
  const [alface, mandioca, couve] = proposta.itens;
  assert.deepEqual([alface.quantidade, alface.falta], [100, 0]);
  assert.deepEqual(alface.alocacoes.map((a) => a.nome).sort(), ['Ana Souza', 'Carla Ferreira', 'Elisa Martins']);
  for (const [nome, interesse] of [['Ana Souza', 80], ['Carla Ferreira', 60], ['Elisa Martins', 50]]) {
    assert.ok(alface.alocacoes.find((a) => a.nome === nome).quantidade <= interesse, nome);
  }
  // cada um no máximo o que marcou e o que produz: Ana 1200 e Davi 1000 (não os 5000 que marcou)
  assert.deepEqual(mandioca.alocacoes.map((a) => [a.nome, a.quantidade]), [['Ana Souza', 1200], ['Davi Rocha', 1000]]);
  assert.deepEqual([mandioca.quantidade, mandioca.falta], [2200, 800]);
  assert.deepEqual([couve.quantidade, couve.falta], [10, 40]);
  assert.equal(proposta.total, somar(proposta.itens, 'valor'));
  assert.equal(mandioca.valor, arredondar(1200 * 11.71 + 1000 * 11.71));

  // chamar de novo recalcula a mesma proposta (uma por cooperativa e chamada)
  app.db.prepare("UPDATE interesses SET quantidade = 40 WHERE produto_id = 'couve' AND chamada_id = ?").run(id);
  const de_novo = await app.pedir('POST', `/api/cooperativa/chamadas/${id}/proposta`, { token });
  assert.equal(de_novo.status, 200);
  assert.equal(de_novo.corpo.id, proposta.id);
  assert.deepEqual([de_novo.corpo.itens[2].quantidade, de_novo.corpo.itens[2].falta], [40, 10]);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM propostas WHERE chamada_id = ?').get(id).n, 1);

  // a lista (que a câmara fria usa para registrar entregas) e o detalhe
  const lista = await app.pedir('GET', '/api/cooperativa/propostas', { token });
  assert.equal(lista.status, 200);
  const naLista = lista.corpo.find((p) => p.id === proposta.id);
  const { numero, orgao, municipio, uf, prazo_envio } = chamadaExemplo();
  assert.deepEqual(naLista.chamada, { numero, orgao, municipio, uf, prazo_envio });
  assert.equal(naLista.chamada_id, id);
  assert.equal(naLista.total, de_novo.corpo.total);
  const chavesDoItem = ['falta', 'preco_unitario', 'produto', 'produto_id', 'quantidade', 'quantidade_pedida', 'unidade', 'valor'];
  assert.deepEqual(Object.keys(naLista.itens[0]).sort(), chavesDoItem);
  const detalhe = await app.pedir('GET', `/api/cooperativa/propostas/${proposta.id}`, { token });
  assert.deepEqual(detalhe.corpo, de_novo.corpo);
  assert.deepEqual(Object.keys(detalhe.corpo.itens[0].alocacoes[0]).sort(), ['agricultor_id', 'nome', 'quantidade']);
  // a chamada sai na lista da cooperativa com a proposta dela
  const chamadas = await app.pedir('GET', '/api/cooperativa/chamadas', { token });
  assert.equal(chamadas.corpo.find((chamada) => chamada.id === id).proposta_id, proposta.id);

  // rascunho, outra UF ou ninguém com interesse: não monta
  const rascunho = inserirChamada(app, chamadaExemplo(), 'rascunho');
  const deSp = inserirChamada(app, chamadaExemplo({ uf: 'SP' }));
  const semInteresse = inserirChamada(app, chamadaExemplo());
  assert.equal((await app.pedir('POST', `/api/cooperativa/chamadas/${rascunho}/proposta`, { token })).status, 404);
  assert.equal((await app.pedir('POST', `/api/cooperativa/chamadas/${deSp}/proposta`, { token })).status, 404);
  const vazia = await app.pedir('POST', `/api/cooperativa/chamadas/${semInteresse}/proposta`, { token });
  assert.equal(vazia.status, 400);
  assert.ok(vazia.corpo.erro);
  // outra cooperativa não vê a proposta desta
  const deOutra = await outraConta(app, 'cooperativa');
  assert.equal((await app.pedir('GET', `/api/cooperativa/propostas/${proposta.id}`, { token: deOutra })).status, 404);
  assert.deepEqual((await app.pedir('GET', '/api/cooperativa/propostas', { token: deOutra })).corpo, []);
});

test('alocação acima do teto, ou total do agricultor acima do limite restante, devolve 400', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('cooperativa@demo.br');
  // como em Catalão, a abóbora aparece em dois itens
  const id = inserirChamada(
    app,
    chamadaExemplo({
      itens: [
        item('Abóbora Cabotiá', 'abobora', 'unidade', 390, 7),
        item('Abóbora verde', 'abobora', 'kg', 1640, 6.87),
        item('Alface', 'alface', 'pç', 2000, 7.03),
        item('Couve', 'couve', 'pç', 100, 7.37),
      ],
    }),
  );
  marcarInteresse(app, 'davi@demo.br', id, 'abobora', 1000); // 25 × 40 = 1000
  marcarInteresse(app, 'ana@demo.br', id, 'alface', 1000); // 25 × 40 = 1000
  marcarInteresse(app, 'fabio@demo.br', id, 'alface', 600); // restam R$ 2.000 do limite: 284,49 pés a R$ 7,03
  marcarInteresse(app, 'carla@demo.br', id, 'couve', 800);
  const proposta = (await app.pedir('POST', `/api/cooperativa/chamadas/${id}/proposta`, { token })).corpo;
  const ana = idDe(app, 'ana@demo.br');
  const carla = idDe(app, 'carla@demo.br');
  const davi = idDe(app, 'davi@demo.br');
  const fabio = idDe(app, 'fabio@demo.br');
  assert.deepEqual(proposta.itens.map((it) => it.alocacoes.map((a) => a.quantidade)), [[390], [610], [1000, 284.49], [100]]);

  // a divisão como a tela manda: todos os itens, cada um com as suas alocações
  const divisao = (abobora1, abobora2, anaAlface, fabioAlface, carlaCouve) => ({
    itens: [
      { alocacoes: [{ agricultor_id: davi, quantidade: abobora1 }] },
      { alocacoes: [{ agricultor_id: davi, quantidade: abobora2 }] },
      { alocacoes: [{ agricultor_id: ana, quantidade: anaAlface }, { agricultor_id: fabio, quantidade: fabioAlface }] },
      { alocacoes: [{ agricultor_id: carla, quantidade: carlaCouve }] },
    ],
  });
  const editar = (corpo) => app.pedir('PUT', `/api/cooperativa/propostas/${proposta.id}`, { token, corpo });
  const recusas = {
    'acima do teto (capacidade de 1000)': divisao(390, 610, 1000.01, 284.49, 100),
    'Fábio acima do limite restante (R$ 2.109,00 de R$ 2.000,00)': divisao(390, 610, 1000, 300, 100),
    'abóbora: cada item cabe, mas a soma passa dos 1000 do Davi': divisao(390, 700, 1000, 284.49, 100),
    'soma acima do pedido de couve': divisao(390, 610, 1000, 284.49, 100.01),
    'quantidade negativa': divisao(390, 610, -1, 284.49, 100),
    'quantidade que não é número': divisao(390, 610, '1000', 284.49, 100),
    'faltou um item': { itens: divisao(390, 610, 1000, 284.49, 100).itens.slice(0, 3) },
  };
  for (const [caso, corpo] of Object.entries(recusas)) {
    const resposta = await editar(corpo);
    assert.equal(resposta.status, 400, caso);
    assert.ok(resposta.corpo.erro, caso);
  }
  const deFora = divisao(390, 610, 1000, 284.49, 100);
  deFora.itens[3].alocacoes[0].agricultor_id = idDe(app, 'prefeitura@demo.br');
  assert.equal((await editar(deFora)).status, 400, 'quem não é cooperado não entra');
  const repetido = divisao(390, 610, 500, 284.49, 100);
  repetido.itens[2].alocacoes.push({ agricultor_id: ana, quantidade: 500 });
  assert.equal((await editar(repetido)).status, 400, 'o mesmo agricultor duas vezes no item');
  const guardada = JSON.parse(app.db.prepare('SELECT itens FROM propostas WHERE id = ?').get(proposta.id).itens);
  assert.deepEqual(guardada.map((it) => it.alocacoes.map((a) => a.quantidade)), [[390], [610], [1000, 284.49], [100]], 'nada mudou');

  // controle: a mesma divisão dentro dos limites passa, e a proposta é recalculada
  const certa = await editar(divisao(300, 700, 900, 284.49, 60));
  assert.equal(certa.status, 200);
  assert.deepEqual(certa.corpo.itens.map((it) => [it.quantidade, it.falta]), [[300, 90], [700, 940], [1184.49, 815.51], [60, 40]]);
  assert.equal(certa.corpo.itens[2].valor, arredondar(arredondar(900 * 7.03) + arredondar(284.49 * 7.03)));
  assert.equal(certa.corpo.total, somar(certa.corpo.itens, 'valor'));
  assert.deepEqual(JSON.parse(app.db.prepare('SELECT itens FROM propostas WHERE id = ?').get(proposta.id).itens)[0].alocacoes, [
    { agricultor_id: davi, quantidade: 300 },
  ]);
});

test('projeto de venda tem totais certos', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('cooperativa@demo.br');
  // a Ana já preencheu CPF e CAF no perfil: o projeto os mostra com máscara
  app.db
    .prepare('UPDATE agricultores SET cpf = ?, caf = ? WHERE usuario_id = ?')
    .run('529.982.247-25', 'GO052025.01.000012345CAF', idDe(app, 'ana@demo.br'));
  const { id: chamadaId } = chamadaSemeada(app);
  const proposta = (await app.pedir('POST', `/api/cooperativa/chamadas/${chamadaId}/proposta`, { token })).corpo;

  const resposta = await app.pedir('GET', `/api/cooperativa/propostas/${proposta.id}/projeto-venda`, { token });
  assert.equal(resposta.status, 200);
  const projeto = resposta.corpo;
  assert.deepEqual(projeto.proponente, {
    tipo: 'grupo-formal',
    nome: 'Cooperativa Vizinhos do Campo',
    cnpj: '11222333000181',
    municipio: 'Catalão',
    uf: 'GO',
  });
  const { local_entrega } = JSON.parse(chamadaSemeada(app).dados);
  assert.ok(local_entrega);
  const orgao = 'Fundo Municipal de Educação de Catalão';
  assert.deepEqual(projeto.cabecalho, { numero: '003/2026', orgao, municipio: 'Catalão', uf: 'GO', local_entrega });
  // os totais batem: cada linha é quantidade × preço, e o total é a soma dos fornecedores e a soma por produto
  for (const fornecedor of projeto.fornecedores) {
    for (const linha of fornecedor.itens) assert.equal(linha.valor, arredondar(linha.quantidade * linha.preco_unitario));
    assert.equal(fornecedor.valor_total, somar(fornecedor.itens, 'valor'));
  }
  assert.equal(projeto.valor_total, somar(projeto.fornecedores, 'valor_total'));
  assert.equal(projeto.valor_total, somar(projeto.totais_por_produto, 'valor'));
  assert.equal(projeto.valor_total, proposta.total, 'o projeto de venda e a proposta têm o mesmo total');
  // os números da demonstração (semente da T6 com a chamada de Catalão)
  assert.equal(projeto.valor_total, 99243.1);
  const fabio = projeto.fornecedores.find((f) => f.nome === 'Fábio Alves');
  assert.deepEqual(fabio.itens.map((linha) => [linha.produto, linha.quantidade]), [['Alface', 284.49]]);
  assert.ok(fabio.valor_total <= 2000, 'o Fábio só tinha R$ 2.000 de limite');
  assert.deepEqual(projeto.totais_por_produto.find((linha) => linha.produto === 'Mandioca').quantidade, 2200);
  // CPF e CAF com máscara; quem não preencheu fica em branco (null)
  const ana = projeto.fornecedores.find((f) => f.nome === 'Ana Souza');
  assert.deepEqual([ana.cpf, ana.caf], ['***.982.247-**', '****5CAF']);
  assert.ok(!JSON.stringify(projeto).includes('529.982.247-25'));
  assert.deepEqual([fabio.cpf, fabio.caf], [null, null]);
  assert.equal(projeto.avisos.length, 2, 'família sem mulher titular e edital da regra anterior');

  // a proposta de outra cooperativa não sai
  const deOutra = await outraConta(app, 'cooperativa');
  assert.equal((await app.pedir('GET', `/api/cooperativa/propostas/${proposta.id}/projeto-venda`, { token: deOutra })).status, 404);
});

test('agricultor gera o projeto de venda individual a partir do interesse', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('ana@demo.br');
  const { id: chamadaId } = chamadaSemeada(app);

  const resposta = await app.pedir('GET', `/api/agricultor/chamadas/${chamadaId}/projeto-venda`, { token });
  assert.equal(resposta.status, 200);
  const projeto = resposta.corpo;
  assert.deepEqual(projeto.proponente, { tipo: 'individual', nome: 'Ana Souza', cpf: null, caf: null, municipio: 'Catalão', uf: 'GO' });
  assert.equal(projeto.fornecedores.length, 1);
  // o que ela marcou na semente: 1000 pés de alface (25 × 40) e 1200 kg de mandioca (30 × 40)
  assert.deepEqual(
    projeto.fornecedores[0].itens.map((linha) => [linha.produto, linha.unidade, linha.quantidade, linha.valor]),
    [['Alface', 'pç', 1000, 7030], ['Mandioca', 'kg', 1200, 14052]],
  );
  assert.equal(projeto.valor_total, 21082);

  // sem interesse na chamada: 400; chamada em rascunho: 404
  const semInteresse = inserirChamada(app, chamadaExemplo());
  const vazio = await app.pedir('GET', `/api/agricultor/chamadas/${semInteresse}/projeto-venda`, { token });
  assert.equal(vazio.status, 400);
  assert.ok(vazio.corpo.erro);
  const rascunho = inserirChamada(app, chamadaExemplo(), 'rascunho');
  marcarInteresse(app, 'ana@demo.br', rascunho, 'alface', 10);
  assert.equal((await app.pedir('GET', `/api/agricultor/chamadas/${rascunho}/projeto-venda`, { token })).status, 404);
});

test('a chamada semeada de Catalão está publicada e aparece em oportunidades() de ana@demo.br com hoje 2026-07-15', async (t) => {
  const app = await subirApp(); // o subirApp já semeia uma vez
  t.after(app.fechar);
  const semeada = chamadaSemeada(app);
  assert.ok(semeada, 'a semente tem a chamada de Catalão');
  assert.deepEqual([semeada.status, semeada.prefeitura_id], ['publicada', idDe(app, 'prefeitura@demo.br')]);
  const arquivo = fs.readFileSync(path.join(__dirname, '..', 'semente', 'chamada-demo.json'), 'utf8');
  const dados = JSON.parse(semeada.dados);
  assert.deepEqual(dados, JSON.parse(arquivo));
  assert.deepEqual(
    [dados.numero, dados.orgao, dados.contato, dados.municipio, dados.uf, dados.data_publicacao, dados.prazo_envio],
    ['003/2026', 'Fundo Municipal de Educação de Catalão', null, 'Catalão', 'GO', '2026-07-09', '2026-07-30'],
  );
  assert.doesNotMatch(arquivo, /servidora?\b|secretário/i, 'nenhum nome de servidor público na semente');
  assert.equal(dados.itens.length, 16);
  for (const it of dados.itens) {
    assert.ok(produtoExiste(it.produto_id), it.produto);
    assert.equal(it.valor_total, arredondar(it.quantidade * it.preco_unitario), it.produto);
  }

  // os seis agricultores marcaram interesse, cada um nos produtos que planta e que a chamada pede
  const interesses = app.db.prepare('SELECT * FROM interesses WHERE chamada_id = ?').all(semeada.id);
  const pedidos = new Set(dados.itens.map((it) => it.produto_id));
  assert.equal(new Set(interesses.map((i) => i.agricultor_id)).size, 6);
  for (const interesse of interesses) {
    assert.ok(pedidos.has(interesse.produto_id), interesse.produto_id);
    const planta = app.db
      .prepare('SELECT quantidade_semana FROM produtos_agricultor WHERE agricultor_id = ? AND produto_id = ?')
      .get(interesse.agricultor_id, interesse.produto_id);
    assert.equal(interesse.quantidade, planta.quantidade_semana * 40, 'o que ele produz em 40 semanas, na unidade do edital');
  }
  for (const produto of ['alface', 'mandioca']) assert.ok(interesses.some((i) => i.produto_id === produto), produto);

  // oportunidades() da T7, direto: a Ana vê a chamada em 15/07/2026, e não depois do prazo
  const ana = app.db.prepare('SELECT * FROM agricultores WHERE usuario_id = ?').get(idDe(app, 'ana@demo.br'));
  const produtos = app.db.prepare('SELECT * FROM produtos_agricultor WHERE agricultor_id = ?').all(ana.usuario_id);
  const chamadas = app.db.prepare("SELECT * FROM chamadas WHERE status = 'publicada'").all().map((c) => ({ ...c, dados: JSON.parse(c.dados) }));
  const [oportunidade, ...outras] = oportunidades({ agricultor: ana, produtos, chamadas, hoje: '2026-07-15' });
  assert.deepEqual(outras, []);
  assert.equal(oportunidade.chamada_id, semeada.id);
  assert.equal(oportunidade.mesma_cidade, true);
  assert.deepEqual(oportunidade.itens.map((it) => [it.produto_id, it.unidade]), [['alface', 'pç'], ['mandioca', 'kg']]);
  assert.deepEqual(oportunidades({ agricultor: ana, produtos, chamadas, hoje: '2026-11-18' }), []);

  // semear de novo não duplica a chamada nem os interesses
  const contar = () => ['chamadas', 'interesses'].map((tabela) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n);
  const antes = contar();
  semear(app.db);
  assert.deepEqual(contar(), antes);
  assert.deepEqual(antes, [1, interesses.length]);
});

test('resumo da meta do ano e PUT /api/prefeitura/repasse', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('prefeitura@demo.br');
  const resumo = async (consulta = '') => app.pedir('GET', `/api/prefeitura/resumo${consulta}`, { token });

  // padrão: o ano da DATA_REFERENCIA (2026), sem compras e sem repasse
  assert.deepEqual((await resumo()).corpo, { ano: 2026, compras_af_reais: 0, repasse: null, percentual: null, minimo: 0.45 });

  const repasse = await app.pedir('PUT', '/api/prefeitura/repasse', { token, corpo: { ano: 2026, valor: 100000 } });
  assert.equal(repasse.status, 200);
  assert.deepEqual(repasse.corpo, { ano: 2026, valor: 100000 });
  // de novo no mesmo ano: troca o valor
  assert.equal((await app.pedir('PUT', '/api/prefeitura/repasse', { token, corpo: { ano: 2026, valor: 80000 } })).status, 200);
  const ruins = [{ ano: 2026, valor: -1 }, { ano: 2026, valor: 0 }, { ano: 2026, valor: 'muito' }, { ano: 'abc', valor: 10 }, { ano: 20260, valor: 10 }];
  for (const ruim of [...ruins, { valor: 10 }]) {
    assert.equal((await app.pedir('PUT', '/api/prefeitura/repasse', { token, corpo: ruim })).status, 400, JSON.stringify(ruim));
  }
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM repasses').get().n, 1);

  // entregas das propostas das chamadas desta prefeitura, pelo ano da entrega
  const cooperativa = await app.entrar('cooperativa@demo.br');
  const { id: chamadaId } = chamadaSemeada(app);
  const { id: propostaId } = (await app.pedir('POST', `/api/cooperativa/chamadas/${chamadaId}/proposta`, { token: cooperativa })).corpo;
  inserirEntrega(app, propostaId, 'alface', 1000, 7030, '2026-08-05');
  inserirEntrega(app, propostaId, 'mandioca', 1200, 14052, '2026-09-01');
  inserirEntrega(app, propostaId, 'alface', 10, 70.3, '2025-12-20');
  // a entrega de uma chamada de outra prefeitura não conta aqui
  const outraId = (await app.pedir('GET', '/api/eu', { token: await outraConta(app, 'prefeitura') })).corpo.id;
  const deOutra = inserirChamada(app, chamadaExemplo());
  app.db.prepare('UPDATE chamadas SET prefeitura_id = ? WHERE id = ?').run(outraId, deOutra);
  const { lastInsertRowid } = app.db
    .prepare("INSERT INTO propostas (chamada_id, cooperativa_id, itens, status, criada_em) VALUES (?, ?, '[]', 'enviada', '2026-07-02T12:00:00.000Z')")
    .run(deOutra, idDe(app, 'cooperativa@demo.br'));
  inserirEntrega(app, Number(lastInsertRowid), 'alface', 5, 999, '2026-08-01');

  assert.deepEqual((await resumo()).corpo, { ano: 2026, compras_af_reais: 21082, repasse: 80000, percentual: 21082 / 80000, minimo: 0.45 });
  assert.deepEqual((await resumo('?ano=2025')).corpo, { ano: 2025, compras_af_reais: 70.3, repasse: null, percentual: null, minimo: 0.3 });
  for (const ruim of ['?ano=abc', '?ano=20260', '?ano=', '?ano=2026.5']) {
    const resposta = await resumo(ruim);
    assert.equal(resposta.status, 400, ruim);
    assert.ok(resposta.corpo.erro, ruim);
  }
});

test('o build gera as telas da prefeitura, da cooperativa e do projeto de venda', () => {
  const publica = path.join(__dirname, '..', 'public');
  for (const pagina of ['prefeitura.html', 'cooperativa.html', 'projeto-venda.html']) {
    assert.ok(fs.existsSync(path.join(publica, pagina)), `${pagina}: falta em web/ ou no rolldownOptions.input do vite.config.js`);
  }
});
