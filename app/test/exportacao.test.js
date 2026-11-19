const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const FIXTURE = require('../../dados/tests/fixtures/exportacao-app.json');
const { montarPropostaConjunta } = require('../src/agrupamento');
const { pseudonimo } = require('../src/exportacao');
const { subirApp } = require('./ajuda');
const { ENV_TESTE } = require('./env-teste');

const COLECOES = ['agricultores', 'chamadas', 'propostas', 'entregas', 'leituras'];
// Nada disto sai. É a lista de ia/privacidade.py (identificação, contato, banco e os critérios da RITS, que juntos
// deduzem quem é assentado, indígena ou quilombola), mais os ids que ligam a exportação às linhas do app.
const PROIBIDAS = [
  'nome', 'cpf', 'caf', 'nis',
  'email', 'e_mail', 'telefone', 'celular', 'endereco',
  'banco', 'agencia', 'conta', 'conta_bancaria', 'pix',
  'grupo_prioritario', 'mulher_titular', 'jovem', 'assentado', 'indigena', 'quilombola',
  'prioridade_rits', 'agricultor_id', 'usuario_id',
];

// Texto livre do edital: o contato traz e-mail e telefone, e o local de entrega e as observações podem trazer nome de gente.
const EMAIL_EDITAL = 'compras@catalao.exemplo.gov.br';
const FONE_EDITAL = '(64) 3000-1234';
const DO_EDITAL = [EMAIL_EDITAL, FONE_EDITAL, 'Maria Aparecida', '(64) 99999-0000'];

// A chamada como a IA a devolve: 13 chaves, e 8 em cada item (ia/extrair/esquema.py). A fixture tem 8 e 5, e o que passa
// disso não pode sair; com a semente igual à fixture, a conferência de chaves não teria como falhar.
const { itens: ITENS_DA_FIXTURE, ...CHAMADA_DA_FIXTURE } = FIXTURE.chamadas[0].dados;
const DADOS_IA = {
  ...CHAMADA_DA_FIXTURE,
  periodo_fornecimento: 'de 03/08/2026 a 18/12/2026',
  semanas_fornecimento: 20,
  local_entrega: 'Escola Municipal Bom Jesus, Rua das Flores, 120, falar com Maria Aparecida, (64) 99999-0000',
  documentos_exigidos: ['Projeto de venda', 'Extrato do CAF'],
  criterios_prioridade: ['Agricultores familiares do município', 'Produção orgânica ou agroecológica'],
  contato: `Setor de Compras, ${EMAIL_EDITAL}, ${FONE_EDITAL}`,
  itens: ITENS_DA_FIXTURE.map((item) => ({
    ...item,
    valor_total: Number((item.quantidade * item.preco_unitario).toFixed(2)),
    entrega: 'semanal',
    observacoes: 'Avisar Maria Aparecida antes da entrega',
  })),
};

// Conjunto de chaves de uma coleção: a união das linhas, para uma linha com chave a mais não passar despercebida.
const chaves = (linhas) => [...new Set(linhas.flatMap((linha) => Object.keys(linha)))].sort();
// Cada linha com exatamente estas chaves: a união de `chaves` deixaria passar uma linha a que falta uma.
const todasTemAs = (linhas, esperadas, rotulo) =>
  linhas.forEach((linha, i) => assert.deepEqual(Object.keys(linha).sort(), esperadas, `${rotulo}[${i}]`));

// Todas as chaves de qualquer nível do JSON.
function todasAsChaves(valor) {
  if (Array.isArray(valor)) return valor.flatMap(todasAsChaves);
  if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([chave, filho]) => [chave, ...todasAsChaves(filho)]);
  return [];
}

// GET com a chave dada; chave: null manda sem o cabeçalho X-Chave-Servico.
async function pedirExportacao(app, { caminho = '/api/exportar', chave = ENV_TESTE.CHAVE_SERVICO } = {}) {
  const cabecalhos = chave === null ? {} : { 'X-Chave-Servico': chave };
  const resposta = await fetch(app.url + caminho, { headers: cabecalhos, signal: AbortSignal.timeout(10_000) });
  return { status: resposta.status, corpo: await resposta.json() };
}

const idDe = (app, email) => app.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email).id;

// Uma proposta da cooperativa da fixture; as alocações guardam o agricultor_id, como o app grava.
function inserirProposta(app, { id, chamada_id, itens }) {
  const { cooperativa_id, status, criada_em } = FIXTURE.propostas[0];
  app.db
    .prepare('INSERT INTO propostas (id, chamada_id, cooperativa_id, itens, status, criada_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, chamada_id, cooperativa_id, JSON.stringify(itens), status, criada_em);
}

// Uma safra com a forma e os valores da fixture, mas com a chamada no formato da IA (DADOS_IA).
// A Ana tem CPF e CAF (controle positivo): só o teste de privacidade olha isso.
function semearSafra(app) {
  const ana = idDe(app, 'ana@demo.br');
  const fabio = idDe(app, 'fabio@demo.br');
  app.db.prepare('UPDATE agricultores SET cpf = ?, caf = ? WHERE usuario_id = ?').run('529.982.247-25', 'GO052025.01.000012345CAF', ana);

  // a safra da fixture troca a chamada de Catalão da semente (T9), que ocupa o id 1
  app.db.exec('DELETE FROM interesses; DELETE FROM chamadas');
  const chamada = FIXTURE.chamadas[0];
  app.db
    .prepare('INSERT INTO chamadas (id, prefeitura_id, dados, status, origem, criada_em, publicada_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(chamada.id, chamada.prefeitura_id, JSON.stringify(DADOS_IA), chamada.status, chamada.origem, chamada.criada_em, chamada.publicada_em);

  // O cpf no primeiro item é um campo de sobra: a exportação não pode deixá-lo sair.
  const itens = [
    {
      produto_id: 'alface',
      produto: 'Alface crespa',
      quantidade: 200,
      unidade: 'Pç',
      preco_unitario: 2.5,
      cpf: '529.982.247-25',
      alocacoes: [{ agricultor_id: ana, quantidade: 200 }],
    },
    {
      produto_id: 'mandioca',
      produto: 'Mandioca descascada',
      quantidade: 300,
      unidade: 'Kg',
      preco_unitario: 6.9,
      alocacoes: [{ agricultor_id: ana, quantidade: 150 }, { agricultor_id: fabio, quantidade: 150 }],
    },
  ];
  inserirProposta(app, { id: FIXTURE.propostas[0].id, chamada_id: FIXTURE.propostas[0].chamada_id, itens });

  for (const e of FIXTURE.entregas) {
    app.db
      .prepare('INSERT INTO entregas (id, proposta_id, produto_id, quantidade, valor, data, no_prazo) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(e.id, e.proposta_id, e.produto_id, e.quantidade, e.valor, e.data, e.no_prazo ? 1 : 0);
  }
  for (const l of FIXTURE.leituras) {
    app.db
      .prepare('INSERT INTO leituras (id, dispositivo, momento, temperatura_c, peso_kg, porta_aberta) VALUES (?, ?, ?, ?, ?, ?)')
      .run(l.id, l.dispositivo, l.momento, l.temperatura_c, l.peso_kg, l.porta_aberta ? 1 : 0);
  }
  return { ana, fabio };
}

test('pseudonimo: 12 hexadecimais do HMAC-SHA256 do id; estável, e diferente por id e por segredo', () => {
  assert.match(pseudonimo(7, 's'), /^[0-9a-f]{12}$/);
  assert.equal(pseudonimo(7, 's'), crypto.createHmac('sha256', 's').update('7').digest('hex').slice(0, 12));
  assert.notEqual(pseudonimo(8, 's'), pseudonimo(7, 's'));
  assert.notEqual(pseudonimo(7, 'outro'), pseudonimo(7, 's'));
});

test('GET /api/exportar: 401 sem a chave ou com outra (igual, mais curta, mais longa ou vazia); com a certa, 200', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const certa = ENV_TESTE.CHAVE_SERVICO;
  for (const chave of [null, '', 'chave-servico-dos-testez', 'chave-servico', `${certa}-extra`]) {
    const { status, corpo } = await pedirExportacao(app, { chave });
    assert.equal(status, 401, `chave: ${JSON.stringify(chave)}`);
    assert.deepEqual(Object.keys(corpo), ['erro']);
  }
  assert.equal((await pedirExportacao(app)).status, 200, 'controle: com a chave certa, a exportação sai');
});

test('a exportação não traz nome, CPF, CAF, e-mail, telefone, grupo prioritário nem id de agricultor', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  semearSafra(app);
  const pessoais = ['Ana Souza', 'ana@demo.br', '529.982.247-25', 'GO052025.01.000012345CAF', 'quilombola', 'assentado'];
  // controle: os dados pessoais e o texto livre do edital estão no banco, senão uma exportação vazia passaria no teste
  const noBanco = JSON.stringify([
    ...app.db.prepare('SELECT u.nome, u.email, a.cpf, a.caf, a.grupo_prioritario FROM usuarios u JOIN agricultores a ON a.usuario_id = u.id').all(),
    ...app.db.prepare('SELECT dados FROM chamadas').all(),
  ]);
  for (const valor of [...pessoais, ...DO_EDITAL]) assert.ok(noBanco.includes(valor), `controle: ${valor} está no banco`);

  const { status, corpo } = await pedirExportacao(app);
  assert.equal(status, 200);
  const texto = JSON.stringify(corpo);
  for (const valor of [...pessoais, ...DO_EDITAL]) assert.ok(!texto.includes(valor), `vazou: ${valor}`);
  assert.deepEqual(todasAsChaves(corpo).filter((chave) => PROIBIDAS.includes(chave)), []);
});

test('as chaves de cada coleção são as da fixture, e os pseudônimos batem com o HMAC do id', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const { ana, fabio } = semearSafra(app);
  const { status, corpo } = await pedirExportacao(app);
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(corpo).sort(), Object.keys(FIXTURE).sort());
  for (const colecao of COLECOES) {
    assert.ok(corpo[colecao].length > 0, `${colecao} tem linha no teste`);
    assert.deepEqual(chaves(corpo[colecao]), chaves(FIXTURE[colecao]), colecao);
  }
  const itens = (exportacao) => exportacao.propostas.flatMap((proposta) => proposta.itens);
  const alocacoes = (exportacao) => itens(exportacao).flatMap((item) => item.alocacoes);
  assert.deepEqual(chaves(corpo.chamadas.map((chamada) => chamada.dados)), chaves(FIXTURE.chamadas.map((chamada) => chamada.dados)), 'chamadas.dados');
  const itensDaChamada = (exportacao) => exportacao.chamadas.flatMap((chamada) => chamada.dados.itens);
  assert.deepEqual(chaves(itensDaChamada(corpo)), chaves(itensDaChamada(FIXTURE)), 'chamadas.dados.itens');
  assert.deepEqual(chaves(itens(corpo)), chaves(itens(FIXTURE)), 'propostas.itens');
  assert.deepEqual(chaves(alocacoes(corpo)), chaves(alocacoes(FIXTURE)), 'alocacoes');

  const segredo = ENV_TESTE.JWT_SEGREDO;
  const dosBanco = app.db.prepare('SELECT usuario_id FROM agricultores').all().map((linha) => pseudonimo(linha.usuario_id, segredo));
  assert.deepEqual(corpo.agricultores.map((agricultor) => agricultor.pseudonimo).sort(), dosBanco.sort());
  assert.deepEqual(alocacoes(corpo), [
    { pseudonimo: pseudonimo(ana, segredo), quantidade: 200 },
    { pseudonimo: pseudonimo(ana, segredo), quantidade: 150 },
    { pseudonimo: pseudonimo(fabio, segredo), quantidade: 150 },
  ]);
  assert.ok(corpo.agricultores.every((agricultor) => typeof agricultor.organico === 'boolean' && typeof agricultor.ja_vendeu_pnae === 'boolean'));
  assert.ok(corpo.entregas.every((entrega) => typeof entrega.no_prazo === 'boolean'));
  assert.ok(corpo.leituras.every((leitura) => typeof leitura.porta_aberta === 'boolean'));
});

test('chamadas.dados sai com as 8 chaves da fixture e itens de 5, o contato nulo e o que falta nulo, mesmo com as 13 chaves da IA', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  semearSafra(app);
  // controle: a semente é a chamada da IA, com mais chaves que a fixture (senão a conferência não provaria nada)
  assert.equal(Object.keys(DADOS_IA).length, 13);
  assert.ok(DADOS_IA.itens.every((item) => Object.keys(item).length === 8));
  assert.ok(DADOS_IA.contato.includes(EMAIL_EDITAL) && DADOS_IA.contato.includes(FONE_EDITAL));
  // dados incompletos (um rascunho, ou o que o modo de regras não achou): a chave que falta sai null, e os itens que faltam, []
  const incompleta = app.db.prepare(
    'INSERT INTO chamadas (id, prefeitura_id, dados, status, origem, criada_em, publicada_em) VALUES (?, 1, ?, ?, ?, ?, NULL)',
  );
  incompleta.run(2, JSON.stringify({ numero: '02/2026', itens: [{ produto: 'Alface' }] }), 'rascunho', 'regras', '2026-07-11T12:00:00.000Z');
  incompleta.run(3, JSON.stringify({}), 'rascunho', 'regras', '2026-07-11T12:00:00.000Z');

  const { status, corpo } = await pedirExportacao(app);
  assert.equal(status, 200);
  const dados = (id) => corpo.chamadas.find((chamada) => chamada.id === id).dados;
  assert.deepEqual(dados(1), FIXTURE.chamadas[0].dados);
  assert.equal(dados(1).contato, null);
  todasTemAs(dados(1).itens, chaves(ITENS_DA_FIXTURE), 'chamadas.dados.itens');
  const nulos = { numero: null, orgao: null, municipio: null, uf: null, data_publicacao: null, prazo_envio: null, contato: null };
  assert.deepEqual(dados(2), {
    ...nulos,
    numero: '02/2026',
    itens: [{ produto: 'Alface', produto_id: null, quantidade: null, unidade: null, preco_unitario: null }],
  });
  assert.deepEqual(dados(3), { ...nulos, itens: [] });
});

test('uma proposta no formato da T7 (quantidade_pedida, total e falta) sai com as seis chaves do contrato', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const { ana, fabio } = semearSafra(app);
  const { itens } = montarPropostaConjunta({ itens: ITENS_DA_FIXTURE }, [
    { agricultor_id: ana, nome: 'Ana Souza', prioridade: 0, limite_restante_reais: 40000, capacidades: { alface: 120, mandioca: 100 } },
    { agricultor_id: fabio, nome: 'Fábio Alves', prioridade: 1, limite_restante_reais: 2000, capacidades: { alface: 80, mandioca: 500 } },
  ]);
  // controle: o item do agrupamento não tem `quantidade`, só `quantidade_pedida`, e traz total e falta a mais
  assert.ok(itens.every((item) => item.quantidade === undefined && item.quantidade_pedida > 0 && 'total' in item && 'falta' in item));
  inserirProposta(app, { id: 2, chamada_id: 2, itens });

  const { status, corpo } = await pedirExportacao(app);
  assert.equal(status, 200);
  const exportados = corpo.propostas.find((proposta) => proposta.id === 2).itens;
  todasTemAs(exportados, chaves(FIXTURE.propostas[0].itens), 'propostas.itens');
  assert.deepEqual(exportados.map((item) => item.quantidade), itens.map((item) => item.quantidade_pedida));
  assert.deepEqual(exportados.map((item) => item.produto_id), ['alface', 'mandioca']);
  const segredo = ENV_TESTE.JWT_SEGREDO;
  assert.deepEqual(
    exportados.flatMap((item) => item.alocacoes),
    itens.flatMap((item) => item.alocacoes.map((a) => ({ pseudonimo: pseudonimo(a.agricultor_id, segredo), quantidade: a.quantidade }))),
  );
});

test('um item de proposta sem alocacoes não derruba a exportação, e a alocação sem agricultor_id é pulada', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const { ana } = semearSafra(app);
  const item = { produto_id: 'alface', produto: 'Alface crespa', quantidade: 10, unidade: 'Pç', preco_unitario: 2.5 };
  inserirProposta(app, {
    id: 2,
    chamada_id: 2,
    itens: [
      item,
      { ...item, alocacoes: [{ quantidade: 1 }, { agricultor_id: null, quantidade: 2 }, null, { agricultor_id: ana, quantidade: 3 }] },
    ],
  });

  const { status, corpo } = await pedirExportacao(app);
  assert.equal(status, 200);
  const [semAlocacoes, comAlocacoes] = corpo.propostas.find((proposta) => proposta.id === 2).itens;
  assert.deepEqual(semAlocacoes.alocacoes, []);
  // só a alocação da Ana sai: a sem agricultor_id não vira o pseudônimo de "undefined" nem de "null"
  assert.deepEqual(comAlocacoes.alocacoes, [{ pseudonimo: pseudonimo(ana, ENV_TESTE.JWT_SEGREDO), quantidade: 3 }]);
});

test('desde: sem ele vem tudo; com ele, só o que tem momento a partir dele; data inválida devolve 400', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  semearSafra(app);
  app.db
    .prepare('INSERT INTO leituras (id, dispositivo, momento, temperatura_c, peso_kg, porta_aberta) VALUES (5, ?, ?, 5.0, 180.0, 0)')
    .run('camara-01', '2026-06-30T23:59:59.000Z');
  const ids = (corpo) => corpo.leituras.map((leitura) => leitura.id);
  assert.deepEqual(ids((await pedirExportacao(app)).corpo), [1, 2, 3, 4, 5]);
  const desdeJulho = await pedirExportacao(app, { caminho: '/api/exportar?desde=2026-07-01T00:00:00Z' });
  assert.deepEqual(ids(desdeJulho.corpo), [1, 2, 3, 4]);
  // no limite: a leitura com o momento igual a desde entra (>=, não >)
  const noLimite = await pedirExportacao(app, { caminho: '/api/exportar?desde=2026-07-15T13:00:02.000Z' });
  assert.deepEqual(ids(noLimite.corpo), [2, 3, 4]);
  // o pedido do pipeline (DESDE em dados/etapas/ingerir_app.py) pede tudo: em toda coleção tem de vir o mesmo que sem desde
  const tudo = (await pedirExportacao(app)).corpo;
  const doPipeline = (await pedirExportacao(app, { caminho: '/api/exportar?desde=2000-01-01T00:00:00Z' })).corpo;
  for (const colecao of COLECOES) {
    assert.ok(tudo[colecao].length > 0, `${colecao} tem linha no teste`);
    assert.deepEqual(doPipeline[colecao], tudo[colecao], `${colecao} com o desde do pipeline`);
  }
  const ruim = await pedirExportacao(app, { caminho: '/api/exportar?desde=ontem' });
  assert.equal(ruim.status, 400);
  assert.ok(ruim.corpo.erro);
});
