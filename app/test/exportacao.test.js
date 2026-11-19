const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const FIXTURE = require('../../dados/tests/fixtures/exportacao-app.json');
const { pseudonimo } = require('../src/exportacao');
const { subirApp } = require('./ajuda');
const { ENV_TESTE } = require('./env-teste');

const COLECOES = ['agricultores', 'chamadas', 'propostas', 'entregas', 'leituras'];
// Nada disto sai: dados pessoais e os critérios da RITS (juntos, deduzem quem é assentado, indígena ou quilombola).
const PROIBIDAS = ['nome', 'cpf', 'caf', 'email', 'grupo_prioritario', 'mulher_titular', 'jovem', 'prioridade_rits', 'agricultor_id', 'usuario_id'];

// Conjunto de chaves de uma coleção: a união das linhas, para uma linha sem uma chave não passar despercebida.
const chaves = (linhas) => [...new Set(linhas.flatMap((linha) => Object.keys(linha)))].sort();

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

// Uma safra com a forma e os valores da fixture. A Ana tem CPF e CAF (controle positivo): só o teste de privacidade olha isso.
function semearSafra(app) {
  const ana = idDe(app, 'ana@demo.br');
  const fabio = idDe(app, 'fabio@demo.br');
  app.db.prepare('UPDATE agricultores SET cpf = ?, caf = ? WHERE usuario_id = ?').run('529.982.247-25', 'GO052025.01.000012345CAF', ana);

  // a safra da fixture troca a chamada de Catalão da semente (T9), que ocupa o id 1
  app.db.exec('DELETE FROM interesses; DELETE FROM chamadas');
  const chamada = FIXTURE.chamadas[0];
  app.db
    .prepare('INSERT INTO chamadas (id, prefeitura_id, dados, status, origem, criada_em, publicada_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(chamada.id, chamada.prefeitura_id, JSON.stringify(chamada.dados), chamada.status, chamada.origem, chamada.criada_em, chamada.publicada_em);

  // Aqui as alocações guardam o agricultor_id, como o app grava; a exportação troca pelo pseudônimo.
  // O cpf no primeiro item é um campo de sobra: a exportação não pode deixá-lo sair.
  const proposta = FIXTURE.propostas[0];
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
  app.db
    .prepare('INSERT INTO propostas (id, chamada_id, cooperativa_id, itens, status, criada_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(proposta.id, proposta.chamada_id, proposta.cooperativa_id, JSON.stringify(itens), proposta.status, proposta.criada_em);

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

test('a exportação não traz nome, CPF, CAF, e-mail, grupo prioritário nem id de agricultor', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  semearSafra(app);
  const pessoais = ['Ana Souza', 'ana@demo.br', '529.982.247-25', 'GO052025.01.000012345CAF', 'quilombola', 'assentado'];
  // controle: os dados pessoais estão no banco, senão uma exportação vazia passaria no teste
  const noBanco = JSON.stringify(
    app.db.prepare('SELECT u.nome, u.email, a.cpf, a.caf, a.grupo_prioritario FROM usuarios u JOIN agricultores a ON a.usuario_id = u.id').all(),
  );
  for (const valor of pessoais) assert.ok(noBanco.includes(valor), `controle: ${valor} está no banco`);

  const { status, corpo } = await pedirExportacao(app);
  assert.equal(status, 200);
  const texto = JSON.stringify(corpo);
  for (const valor of pessoais) assert.ok(!texto.includes(valor), `vazou: ${valor}`);
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
  const ruim = await pedirExportacao(app, { caminho: '/api/exportar?desde=ontem' });
  assert.equal(ruim.status, 400);
  assert.ok(ruim.corpo.erro);
});
