// Câmara fria (T11): as leituras do dispositivo (chave no cabeçalho X-Chave-Dispositivo), os alertas de temperatura e de
// porta, a tela da cooperativa e o registro das entregas contra a proposta (o item escolhido pela posição).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { avaliarLeitura, validarLeitura } = require('../src/camara-fria');
const { arredondar } = require('../src/regras-pnae');
const { subirApp } = require('./ajuda');
const { ENV_TESTE } = require('./env-teste');

const CONFIG = { limiteTempC: 10, minutosPortaAberta: 2 };

// Uma leitura válida, como a do simulador (momento em UTC); `mudancas` troca ou acrescenta campos.
const leitura = (mudancas = {}) => ({
  dispositivo: 'camara-01',
  temperatura_c: 5,
  peso_kg: 180,
  porta_aberta: false,
  momento: '2026-11-18T22:00:00+00:00',
  ...mudancas,
});

// POST /api/leituras como o simulador manda; chave: null vai sem o cabeçalho.
async function enviar(app, corpo, chave = ENV_TESTE.CHAVE_DISPOSITIVO) {
  const headers = { 'Content-Type': 'application/json' };
  if (chave !== null) headers['X-Chave-Dispositivo'] = chave;
  const resposta = await fetch(`${app.url}/api/leituras`, {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

const tipos = (resposta) => resposta.corpo.alertas.map((alerta) => alerta.tipo);
const alertasGravados = (app) =>
  app.db
    .prepare('SELECT dispositivo, tipo, momento, resolvido FROM alertas ORDER BY id')
    .all()
    .map((alerta) => ({ ...alerta }));
const contar = (app, tabela) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n;

test('validarLeitura confere cada campo, nos limites de cada faixa', () => {
  assert.deepEqual(validarLeitura(leitura()), { ok: true, erros: [] });
  const validas = [
    { temperatura_c: -30 },
    { temperatura_c: 60 },
    { peso_kg: 0 },
    { peso_kg: 5000 },
    { porta_aberta: true },
    { dispositivo: 'x'.repeat(40) },
    { momento: undefined }, // sem momento vale a hora do servidor (o Arduino não tem relógio)
    { momento: null },
    { momento: '2026-11-18T19:24:36-03:00' },
    { momento: '2026-11-18T22:24:36.123Z' },
  ];
  for (const mudanca of validas) assert.equal(validarLeitura(leitura(mudanca)).ok, true, JSON.stringify(mudanca));

  const invalidas = [
    { temperatura_c: 999 },
    { temperatura_c: -30.1 },
    { temperatura_c: 60.1 },
    { temperatura_c: '5' },
    { temperatura_c: null },
    { peso_kg: -0.1 },
    { peso_kg: 5000.1 },
    { peso_kg: '180' },
    { porta_aberta: 'true' },
    { porta_aberta: 1 },
    { dispositivo: '' },
    { dispositivo: '   ' },
    { dispositivo: 'x'.repeat(41) },
    { dispositivo: 7 },
    { momento: 'ontem' },
    { momento: '2026-02-30T10:00:00Z' }, // o JavaScript viraria 2 de março em silêncio
    { momento: '2026-11-18T22:00:00' }, // sem o fuso, a hora é ambígua
    { momento: '2026-11-18' },
    { momento: 1795040676000 },
  ];
  for (const mudanca of invalidas) {
    const { ok, erros } = validarLeitura(leitura(mudanca));
    assert.equal(ok, false, JSON.stringify(mudanca));
    assert.equal(erros.length, 1, JSON.stringify(mudanca));
  }
  // uma mensagem em português para cada campo errado
  const { erros } = validarLeitura({});
  assert.equal(erros.length, 4);
  assert.ok(erros.every((erro) => typeof erro === 'string' && erro.length > 0));
});

test('avaliarLeitura: temperatura acima do limite e porta aberta há mais dos minutos da config; porta fechada zera a conta', () => {
  const quente = avaliarLeitura(leitura({ temperatura_c: 10.2 }), null, CONFIG);
  assert.deepEqual(quente.alertas.map((alerta) => alerta.tipo), ['temperatura']);
  assert.match(quente.alertas[0].mensagem, /10,2 °C.*10 °C/);
  assert.deepEqual(avaliarLeitura(leitura({ temperatura_c: 10 }), null, CONFIG), { alertas: [], portaAbertaDesde: null }, 'no limite não alerta');
  assert.equal(avaliarLeitura(leitura({ temperatura_c: 9 }), null, { ...CONFIG, limiteTempC: 8 }).alertas.length, 1, 'o limite vem da config');

  const t0 = '2026-11-18T22:00:00.000Z';
  const aberta = (momento, desde, config = CONFIG) => avaliarLeitura(leitura({ porta_aberta: true, momento }), desde, config);
  assert.deepEqual(aberta(t0, null), { alertas: [], portaAbertaDesde: t0 }, 'a porta abriu agora');
  assert.deepEqual(aberta('2026-11-18T22:02:00.000Z', t0), { alertas: [], portaAbertaDesde: t0 }, '2 minutos certos ainda não');
  const tresMinutos = aberta('2026-11-18T22:03:00.000Z', t0);
  assert.deepEqual(tresMinutos.alertas.map((alerta) => alerta.tipo), ['porta']);
  assert.match(tresMinutos.alertas[0].mensagem, /2 minutos/);
  assert.equal(tresMinutos.portaAbertaDesde, t0, 'conta desde a primeira leitura com a porta aberta');
  assert.equal(aberta('2026-11-18T22:01:30.000Z', t0, { ...CONFIG, minutosPortaAberta: 1 }).alertas.length, 1, 'os minutos vêm da config');
  assert.deepEqual(avaliarLeitura(leitura({ porta_aberta: false }), t0, CONFIG), { alertas: [], portaAbertaDesde: null }, 'fechou: zera');

  // a porta aberta esquenta a câmara: os dois alertas valem juntos, cada um do seu tipo
  const ambos = avaliarLeitura(leitura({ porta_aberta: true, temperatura_c: 18, momento: '2026-11-18T22:03:00.000Z' }), t0, CONFIG);
  assert.deepEqual(ambos.alertas.map((alerta) => alerta.tipo), ['temperatura', 'porta']);
});

test('chave errada devolve 401', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const certa = ENV_TESTE.CHAVE_DISPOSITIVO;
  for (const chave of [null, '', 'chave-dispositivo-dos-testez', certa.slice(0, -1), `${certa}-extra`, ENV_TESTE.CHAVE_SERVICO]) {
    const { status, corpo } = await enviar(app, leitura(), chave);
    assert.equal(status, 401, `chave: ${JSON.stringify(chave)}`);
    assert.equal(typeof corpo.erro, 'string');
  }
  // a chave vem antes da leitura: quem não tem a chave não descobre as regras da leitura
  assert.equal((await enviar(app, leitura({ temperatura_c: 999 }), 'errada')).status, 401);
  assert.equal(contar(app, 'leituras'), 0);
  assert.equal((await enviar(app, leitura())).status, 201, 'controle: com a chave certa, a leitura entra');
  assert.equal(contar(app, 'leituras'), 1);
});

test('leitura absurda devolve 400 e não alerta', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const { status, corpo } = await enviar(app, leitura({ temperatura_c: 999 }));
  assert.equal(status, 400);
  assert.match(corpo.erro, /temperatura/i);
  assert.equal(contar(app, 'alertas'), 0);
  assert.equal(contar(app, 'leituras'), 0, 'leitura absurda nem é gravada');
});

test('momento gravado em UTC: com fuso vira UTC; sem momento, vale a hora do servidor', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  assert.equal((await enviar(app, leitura({ momento: '2026-11-18T19:24:36-03:00' }))).status, 201);
  const antes = Date.now();
  assert.equal((await enviar(app, leitura({ momento: undefined }))).status, 201);
  const depois = Date.now();
  const [comFuso, semMomento] = app.db.prepare('SELECT momento FROM leituras ORDER BY id').all().map((linha) => linha.momento);
  assert.equal(comFuso, '2026-11-18T22:24:36.000Z');
  assert.match(semMomento, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(Date.parse(semMomento) >= antes - 1000 && Date.parse(semMomento) <= depois + 1000, semMomento);
});

test('temperatura acima de 10 °C gera alerta de temperatura', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const noLimite = await enviar(app, leitura({ temperatura_c: 10 }));
  assert.equal(noLimite.status, 201);
  assert.deepEqual(noLimite.corpo, { alertas: [] });
  // o passo 13 do simulador no cenário porta-aberta (as leituras dele chegam com a porta aberta há 26 s)
  const quente = await enviar(app, leitura({ temperatura_c: 10.2, momento: '2026-11-18T22:00:26+00:00' }));
  assert.equal(quente.status, 201);
  assert.deepEqual(tipos(quente), ['temperatura']);
  assert.match(quente.corpo.alertas[0].mensagem, /10,2 °C/);
  assert.deepEqual(alertasGravados(app), [{ dispositivo: 'camara-01', tipo: 'temperatura', momento: '2026-11-18T22:00:26.000Z', resolvido: 0 }]);
});

test('porta aberta por mais de 2 minutos gera alerta de porta', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const aberta = (alvo, momento) => enviar(alvo, leitura({ porta_aberta: true, momento }));
  assert.deepEqual(tipos(await aberta(app, '2026-11-18T22:00:00Z')), []);
  const depois = await aberta(app, '2026-11-18T22:03:00Z');
  assert.equal(depois.status, 201);
  assert.deepEqual(tipos(depois), ['porta']);
  assert.deepEqual(alertasGravados(app), [{ dispositivo: 'camara-01', tipo: 'porta', momento: '2026-11-18T22:03:00.000Z', resolvido: 0 }]);

  // a conta da porta é de cada servidor (o Map nasce no registrar): outro app começa a contar do zero
  const outro = await subirApp();
  t.after(outro.fechar);
  assert.deepEqual(tipos(await aberta(outro, '2026-11-18T22:03:00Z')), []);
  assert.equal(contar(outro, 'alertas'), 0);
});

test('porta fechada zera a conta: ao reabrir, os 2 minutos recomeçam', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const porta = async (porta_aberta, momento) => tipos(await enviar(app, leitura({ porta_aberta, momento })));
  assert.deepEqual(await porta(true, '2026-11-18T22:00:00Z'), []);
  assert.deepEqual(await porta(false, '2026-11-18T22:01:00Z'), []);
  assert.deepEqual(await porta(true, '2026-11-18T22:10:00Z'), [], 'reabriu: a conta recomeça');
  assert.deepEqual(await porta(true, '2026-11-18T22:13:00Z'), ['porta']);
});

test('depois de um reinício, porta ainda aberta não resolve o alerta de porta: só a porta fechada resolve', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  // o que um reinício deixa: o alerta aberto no banco e a conta da porta (o Map) vazia
  app.db
    .prepare('INSERT INTO alertas (dispositivo, tipo, mensagem, momento) VALUES (?, ?, ?, ?)')
    .run('camara-01', 'porta', 'A porta de camara-01 está aberta há mais de 2 minutos.', '2026-11-18T22:03:00.000Z');
  const resolvidos = () => alertasGravados(app).map((a) => a.resolvido);
  assert.deepEqual(tipos(await enviar(app, leitura({ porta_aberta: true, momento: '2026-11-18T22:04:00Z' }))), [], 'a conta recomeçou');
  assert.deepEqual(resolvidos(), [0], 'a porta continua aberta: o alerta fica');
  assert.deepEqual(tipos(await enviar(app, leitura({ porta_aberta: true, momento: '2026-11-18T22:07:00Z' }))), ['porta']);
  assert.deepEqual(resolvidos(), [0], 'o alerta que já estava aberto, sem outro igual');
  await enviar(app, leitura({ porta_aberta: false, momento: '2026-11-18T22:08:00Z' }));
  assert.deepEqual(resolvidos(), [1], 'a porta fechou: resolve');
});

test('alerta não se repete a cada leitura e é resolvido quando volta ao normal', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  for (const temperatura_c of [10.2, 10.6, 11]) {
    assert.deepEqual(tipos(await enviar(app, leitura({ temperatura_c }))), ['temperatura']);
  }
  assert.deepEqual(alertasGravados(app).map((a) => a.resolvido), [0], 'três leituras quentes, um alerta só');
  assert.deepEqual(tipos(await enviar(app, leitura({ temperatura_c: 6 }))), []);
  assert.deepEqual(alertasGravados(app).map((a) => a.resolvido), [1], 'a primeira leitura normal resolve');
  await enviar(app, leitura({ temperatura_c: 12 }));
  assert.deepEqual(alertasGravados(app).map((a) => a.resolvido), [1, 0], 'esquentou de novo: alerta novo');
  // um alerta aberto por tipo e por dispositivo: a outra câmara tem o dela
  await enviar(app, leitura({ dispositivo: 'camara-02', temperatura_c: 12 }));
  assert.deepEqual(
    alertasGravados(app).map((a) => [a.dispositivo, a.resolvido]),
    [['camara-01', 1], ['camara-01', 0], ['camara-02', 0]],
  );
});

test('porta aberta e calor juntos: um alerta de cada tipo, e cada um resolve quando o seu volta ao normal', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  await enviar(app, leitura({ porta_aberta: true, temperatura_c: 11, momento: '2026-11-18T22:00:00Z' }));
  const tresMinutos = await enviar(app, leitura({ porta_aberta: true, temperatura_c: 18, momento: '2026-11-18T22:03:00Z' }));
  assert.deepEqual(tipos(tresMinutos), ['temperatura', 'porta']);
  const estado = () => alertasGravados(app).map((a) => [a.tipo, a.resolvido]);
  assert.deepEqual(estado(), [['temperatura', 0], ['porta', 0]]);
  // fechou a porta, mas a câmara ainda está quente: só o alerta de porta resolve
  await enviar(app, leitura({ porta_aberta: false, temperatura_c: 15, momento: '2026-11-18T22:04:00Z' }));
  assert.deepEqual(estado(), [['temperatura', 0], ['porta', 1]]);
  await enviar(app, leitura({ porta_aberta: false, temperatura_c: 7, momento: '2026-11-18T22:10:00Z' }));
  assert.deepEqual(estado(), [['temperatura', 1], ['porta', 1]]);
});

test('os limites vêm da config: LIMITE_TEMP_C e MINUTOS_PORTA_ABERTA valem na rota, na mensagem e no GET', async (t) => {
  const app = await subirApp({ env: { LIMITE_TEMP_C: '8', MINUTOS_PORTA_ABERTA: '1' } });
  t.after(app.fechar);
  const quente = await enviar(app, leitura({ temperatura_c: 8.5, porta_aberta: true }));
  assert.deepEqual(tipos(quente), ['temperatura'], '8,5 °C passa do limite de 8');
  assert.match(quente.corpo.alertas[0].mensagem, /8 °C/);
  const porta = await enviar(app, leitura({ porta_aberta: true, momento: '2026-11-18T22:01:01Z' }));
  assert.deepEqual(tipos(porta), ['porta'], '1 min 1 s passa do limite de 1 minuto');
  assert.match(porta.corpo.alertas[0].mensagem, /1 minuto\b/);
  const token = await app.entrar('cooperativa@demo.br');
  const { corpo } = await app.pedir('GET', '/api/cooperativa/camara-fria', { token });
  assert.equal(corpo.limite_temp_c, 8);
  assert.equal(corpo.minutos_porta_aberta, 1);
});

test('GET /api/cooperativa/camara-fria: as últimas leituras e só os alertas abertos', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const [cooperativa, ana, prefeitura] = await Promise.all(['cooperativa@demo.br', 'ana@demo.br', 'prefeitura@demo.br'].map((e) => app.entrar(e)));
  assert.equal((await app.pedir('GET', '/api/cooperativa/camara-fria')).status, 401);
  assert.equal((await app.pedir('GET', '/api/cooperativa/camara-fria', { token: ana })).status, 403);
  assert.equal((await app.pedir('GET', '/api/cooperativa/camara-fria', { token: prefeitura })).status, 403);

  const vazia = await app.pedir('GET', '/api/cooperativa/camara-fria', { token: cooperativa });
  assert.equal(vazia.status, 200);
  assert.deepEqual(vazia.corpo, { leituras: [], alertas: [], limite_temp_c: 10, minutos_porta_aberta: 2 });

  // 12 leituras, um segundo cada: a 2ª abre um alerta de temperatura, que a 3ª resolve; a 12ª abre outro
  for (let i = 0; i < 12; i++) {
    const temperatura_c = i === 1 || i === 11 ? 10.4 : 6;
    await enviar(app, leitura({ temperatura_c, porta_aberta: i === 11, momento: `2026-11-18T22:00:${String(i).padStart(2, '0')}Z` }));
  }
  const { status, corpo } = await app.pedir('GET', '/api/cooperativa/camara-fria', { token: cooperativa });
  assert.equal(status, 200);
  assert.equal(corpo.leituras.length, 10, 'as 10 últimas');
  assert.deepEqual(
    corpo.leituras.map((l) => l.momento),
    Array.from({ length: 10 }, (_, i) => `2026-11-18T22:00:${String(11 - i).padStart(2, '0')}.000Z`),
    'a mais nova primeiro',
  );
  const { id, ...ultima } = corpo.leituras[0];
  assert.equal(typeof id, 'number');
  assert.deepEqual(ultima, { dispositivo: 'camara-01', momento: '2026-11-18T22:00:11.000Z', temperatura_c: 10.4, peso_kg: 180, porta_aberta: true });
  assert.equal(corpo.leituras[1].porta_aberta, false);
  assert.equal(corpo.alertas.length, 1, 'o alerta resolvido não aparece');
  assert.deepEqual(Object.keys(corpo.alertas[0]).sort(), ['dispositivo', 'id', 'mensagem', 'momento', 'tipo']);
  assert.equal(corpo.alertas[0].momento, '2026-11-18T22:00:11.000Z');
  assert.match(corpo.alertas[0].mensagem, /10,4 °C/);
});

// A proposta conjunta da chamada de Catalão semeada (T9). A semente ocupa a chamada id 1: o teste não presume ids.
async function propostaDeCatalao(app, token) {
  const { id } = app.db.prepare("SELECT id FROM chamadas WHERE origem = 'cache'").get();
  const resposta = await app.pedir('POST', `/api/cooperativa/chamadas/${id}/proposta`, { token });
  assert.equal(resposta.status, 201);
  return resposta.corpo;
}

test('entrega com quantidade negativa devolve 400', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('cooperativa@demo.br');
  const proposta = await propostaDeCatalao(app, token);
  const alface = proposta.itens.findIndex((item) => item.produto_id === 'alface');
  const corpo = { proposta_id: proposta.id, item: alface, quantidade: -5, data: '2026-08-05', no_prazo: true };
  const { status, corpo: resposta } = await app.pedir('POST', '/api/cooperativa/entregas', { token, corpo });
  assert.equal(status, 400);
  assert.match(resposta.erro, /quantidade/i);
  for (const quantidade of [0, 0.004, '100', null]) {
    assert.equal((await app.pedir('POST', '/api/cooperativa/entregas', { token, corpo: { ...corpo, quantidade } })).status, 400, `${quantidade}`);
  }
  assert.equal(contar(app, 'entregas'), 0);
});

test('entrega registra o item da proposta pela posição: as duas abóboras de Catalão têm preços diferentes', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('cooperativa@demo.br');
  const proposta = await propostaDeCatalao(app, token);
  const entregar = (mudancas) =>
    app.pedir('POST', '/api/cooperativa/entregas', {
      token,
      corpo: { proposta_id: proposta.id, item: 0, quantidade: 10, data: '2026-08-05', no_prazo: true, ...mudancas },
    });

  const aboboras = proposta.itens.map((item, posicao) => ({ ...item, posicao })).filter((item) => item.produto_id === 'abobora');
  assert.equal(aboboras.length, 2);
  assert.notEqual(aboboras[0].preco_unitario, aboboras[1].preco_unitario);
  const registradas = [];
  for (const abobora of aboboras) {
    assert.ok(abobora.quantidade >= 10, `${abobora.produto}: a semente oferece abóbora`);
    const { status, corpo } = await entregar({ item: abobora.posicao, no_prazo: abobora.posicao === aboboras[0].posicao });
    assert.equal(status, 201);
    const { id, ...entrega } = corpo;
    assert.equal(typeof id, 'number');
    const valor = arredondar(10 * abobora.preco_unitario);
    const no_prazo = abobora.posicao === aboboras[0].posicao;
    assert.deepEqual(entrega, { proposta_id: proposta.id, produto_id: 'abobora', quantidade: 10, valor, data: '2026-08-05', no_prazo });
    registradas.push(valor);
  }
  assert.deepEqual(
    app.db.prepare('SELECT valor, no_prazo FROM entregas ORDER BY id').all().map((e) => [e.valor, e.no_prazo]),
    [[registradas[0], 1], [registradas[1], 0]],
  );

  // a prefeitura vê as entregas na meta do ano (compras da agricultura familiar)
  const prefeitura = await app.entrar('prefeitura@demo.br');
  const resumo = await app.pedir('GET', '/api/prefeitura/resumo?ano=2026', { token: prefeitura });
  assert.equal(resumo.corpo.compras_af_reais, arredondar(registradas[0] + registradas[1]));

  const semOferta = proposta.itens.findIndex((item) => item.quantidade === 0);
  assert.ok(semOferta >= 0, 'a proposta de Catalão tem item sem oferta');
  const alface = proposta.itens.findIndex((item) => item.produto_id === 'alface');
  const recusadas = [
    { item: proposta.itens.length },
    { item: -1 },
    { item: '0' },
    { item: 0.5 },
    { item: undefined, produto_id: 'abobora' }, // só o produto não diz qual das duas abóboras
    { item: semOferta, quantidade: 1 },
    { item: alface, quantidade: proposta.itens[alface].quantidade + 1 }, // mais do que a proposta oferece
    { data: '05/08/2026' },
    { data: '2026-02-30' },
    { data: undefined },
    { no_prazo: 'sim' },
    { no_prazo: undefined },
    { proposta_id: String(proposta.id) },
    { proposta_id: true },
    { proposta_id: proposta.id + 1000 },
  ];
  for (const mudancas of recusadas) {
    const { status, corpo } = await entregar(mudancas);
    assert.equal(status, 400, JSON.stringify(mudancas));
    assert.equal(typeof corpo.erro, 'string');
  }
  assert.equal(contar(app, 'entregas'), 2);
});

test('entrega: só a cooperativa dona da proposta registra', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const [cooperativa, ana] = await Promise.all(['cooperativa@demo.br', 'ana@demo.br'].map((e) => app.entrar(e)));
  const proposta = await propostaDeCatalao(app, cooperativa);
  const corpo = { proposta_id: proposta.id, item: 0, quantidade: 10, data: '2026-08-05', no_prazo: true };
  assert.equal((await app.pedir('POST', '/api/cooperativa/entregas', { corpo })).status, 401);
  assert.equal((await app.pedir('POST', '/api/cooperativa/entregas', { token: ana, corpo })).status, 403);
  const cadastro = { email: 'outra@cooperativa.br', senha: 'senha-forte', papel: 'cooperativa', nome: 'Outra' };
  const daCooperativa = { cnpj: '11222333000181', municipio: 'Catalão', uf: 'GO' };
  const outra = (await app.pedir('POST', '/api/cadastro', { corpo: { ...cadastro, ...daCooperativa } })).corpo.token;
  assert.equal((await app.pedir('POST', '/api/cooperativa/entregas', { token: outra, corpo })).status, 400);
  assert.equal(contar(app, 'entregas'), 0);
});

test('o build gera a tela da câmara fria', () => {
  const pagina = path.join(__dirname, '..', 'public', 'camara-fria.html');
  assert.ok(fs.existsSync(pagina), 'camara-fria.html: falta em web/ ou no rolldownOptions.input do vite.config.js');
});
