const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { criarRoteador } = require('../src/roteador');
const { criarClienteIa } = require('../src/cliente-ia');
const { subirApp, respostaFalsa } = require('./ajuda');

test('roteador casa parâmetros e para quando a resposta termina', async () => {
  const roteador = criarRoteador();
  const vistos = [];
  roteador.get(
    '/x/:id',
    async (req, res, ctx) => {
      vistos.push(ctx.params.id);
      res.end('ok');
    },
    async () => vistos.push('não devia rodar'),
  );
  const ctx = {};
  assert.equal(await roteador.tratar({ method: 'GET', url: '/x/7?ordem=nome' }, respostaFalsa(), ctx), true);
  assert.deepEqual(vistos, ['7']);
  assert.equal(ctx.query.ordem, 'nome');
  assert.equal(await roteador.tratar({ method: 'POST', url: '/x/7' }, respostaFalsa(), {}), false);
  assert.equal(await roteador.tratar({ method: 'GET', url: '/x/7/y' }, respostaFalsa(), {}), false);
  assert.equal(await roteador.tratar({ method: 'GET', url: '/x/' }, respostaFalsa(), {}), false);
});

// http.get manda o caminho cru. O fetch normaliza '/../' para '/', e o teste passaria mesmo sem a proteção.
function pedirCru(url, caminho) {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, reject) => {
    http
      .get({ hostname, port, path: caminho }, (res) => {
        res.resume();
        res.on('end', () => resolve(res));
      })
      .on('error', reject);
  });
}

test('estático nega ../', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  for (const caminho of ['/', '/index.html']) {
    const controle = await pedirCru(app.url, caminho);
    assert.equal(controle.statusCode, 200, caminho);
    assert.equal(controle.headers['content-type'], 'text/html; charset=utf-8');
  }
  // app/package.json existe um nível acima de public/: sem a proteção, estes caminhos devolveriam 200.
  for (const caminho of ['/../package.json', '/%2e%2e/package.json', '/css/../../package.json']) {
    assert.equal((await pedirCru(app.url, caminho)).statusCode, 404, caminho);
  }
});

test('corpo acima do limite devolve 413 e JSON quebrado devolve 400', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const grande = JSON.stringify({ texto: 'a'.repeat(10 * 1024 * 1024) });
  const recusado = await app.pedir('POST', '/api/login', { corpo: grande });
  assert.equal(recusado.status, 413);
  assert.ok(recusado.corpo.erro);
  assert.equal((await app.pedir('POST', '/api/login', { corpo: '{ quebrado' })).status, 400);
  assert.equal((await app.pedir('POST', '/api/login', { corpo: '[1, 2]' })).status, 400);
  assert.equal((await app.pedir('GET', '/api/nao-existe')).status, 404);
});

test('cliente da IA devolve o JSON, repassa o 4xx da IA e troca o resto por 502', async (t) => {
  const respostas = { '/saude': [200, { ok: true }], '/extrair-chamada': [400, { erro: 'não consegui ler o PDF' }] };
  const iaFalsa = http.createServer((req, res) => {
    const [status, corpo] = respostas[req.url] || [500, { erro: 'erro interno da IA' }];
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(corpo));
  });
  await new Promise((resolve) => iaFalsa.listen(0, '127.0.0.1', resolve));
  t.after(() => iaFalsa.close());
  const ia = criarClienteIa(`http://127.0.0.1:${iaFalsa.address().port}`);
  assert.deepEqual(await ia.saude(), { ok: true });
  await assert.rejects(ia.extrairChamada({ texto: 'x' }), { status: 400, message: 'não consegui ler o PDF' });
  await assert.rejects(ia.assistente({}), { status: 502 });
  await assert.rejects(criarClienteIa('http://127.0.0.1:1').saude(), { status: 502 });
});
