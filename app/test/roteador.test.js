const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
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

// Fala HTTP direto num socket: o fetch não declara um Content-Length que não vai mandar, nem manda um corpo sem fim.
function abrirSocket(url) {
  const { hostname, port } = new URL(url);
  const socket = net.connect({ host: hostname, port: Number(port) });
  const recebido = [];
  socket.on('data', (parte) => recebido.push(parte));
  socket.on('error', () => {}); // o servidor pode fechar com RST enquanto o teste ainda escreve
  const fechou = new Promise((resolve) => socket.once('close', resolve));
  // Espera o servidor fechar a conexão. Se não fechar no prazo, devolve fechou: false e o teste falha na asserção, sem travar.
  async function esperarFim(prazoMs = 3000) {
    let prazo;
    const sozinho = await Promise.race([fechou.then(() => true), new Promise((resolve) => (prazo = setTimeout(resolve, prazoMs, false)))]);
    clearTimeout(prazo);
    socket.destroy();
    return { fechou: sozinho, resposta: Buffer.concat(recebido).toString('latin1') };
  }
  return { socket, esperarFim };
}

test('Content-Length declarado acima do limite devolve 413 na hora, sem ler o corpo, e a conexão fecha', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const { socket, esperarFim } = abrirSocket(app.url);
  // declara 50 MB e manda 1 byte: só um servidor que decide pelo cabeçalho responde
  socket.write('POST /api/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 50000000\r\n\r\n{');
  const { fechou, resposta } = await esperarFim();
  assert.match(resposta, /^HTTP\/1\.1 413 /);
  assert.match(resposta, /connection: close/i);
  assert.ok(fechou, 'o servidor fecha a conexão depois do 413');
});

test('corpo em pedaços acima do limite: 413, o servidor para de ler e fecha a conexão', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const { socket, esperarFim } = abrirSocket(app.url);
  socket.write('POST /api/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n');
  for (let i = 0; i < 40; i++) socket.write(`4000\r\n${'a'.repeat(0x4000)}\r\n`); // 640 KB, sem o pedaço final "0": o corpo não acaba
  const { fechou, resposta } = await esperarFim();
  assert.match(resposta, /^HTTP\/1\.1 413 /);
  assert.ok(fechou, 'sem fechar, o servidor continuaria lendo e jogando fora um corpo sem fim');
});

test('corpo: 256 KB por padrão, e só POST /api/prefeitura/chamadas aceita até 10 MB', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const corpoDe = (bytes) => JSON.stringify({ texto: 'a'.repeat(bytes - 12) }); // 12 bytes são o {"texto":""}
  const KB = 1024;
  const MB = 1024 * KB;
  assert.equal(Buffer.byteLength(corpoDe(256 * KB)), 256 * KB);
  assert.equal((await app.pedir('POST', '/api/login', { corpo: corpoDe(256 * KB) })).status, 401, 'no limite passa (o login falha por outro motivo)');
  assert.equal((await app.pedir('POST', '/api/login', { corpo: corpoDe(256 * KB + 1) })).status, 413);
  // a rota do PDF nasce na T9: até lá dá 404 e depois dá 401 sem token, mas nunca 413 até 10 MB
  assert.notEqual((await app.pedir('POST', '/api/prefeitura/chamadas', { corpo: corpoDe(10 * MB) })).status, 413);
  assert.equal((await app.pedir('POST', '/api/prefeitura/chamadas', { corpo: corpoDe(10 * MB + 1) })).status, 413);
  // o limite grande é só do POST desse caminho: nem outro método nele, nem outro caminho do mesmo prefixo
  assert.equal((await app.pedir('PUT', '/api/prefeitura/chamadas', { corpo: corpoDe(MB) })).status, 413);
  assert.equal((await app.pedir('PUT', '/api/prefeitura/chamadas/1', { corpo: corpoDe(MB) })).status, 413);
  assert.equal((await app.pedir('POST', '/api/prefeitura/chamadas/1/publicar', { corpo: corpoDe(MB) })).status, 413);
});

test('cliente que desiste no meio do envio não vira erro no log', async (t) => {
  const registro = t.mock.method(console, 'error', () => {});
  const app = await subirApp();
  t.after(app.fechar);
  const { socket } = abrirSocket(app.url);
  const chegou = once(app.servidor, 'request'); // o servidor só lê o corpo depois de ler os cabeçalhos
  socket.write('POST /api/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"email":');
  const [, res] = await chegou;
  const fechada = once(res, 'close');
  socket.destroy(); // o cliente some no meio do corpo
  await fechada;
  await new Promise((resolve) => setImmediate(resolve)); // deixa o servidor acabar de tratar o abandono
  assert.equal(registro.mock.callCount(), 0, 'abandono do cliente não é erro do servidor');
});

test('erro inesperado vira 500 sem pilha para o cliente e fica no log', async (t) => {
  const registro = t.mock.method(console, 'error', () => {});
  const app = await subirApp();
  t.after(app.fechar);
  app.db.close(); // o próximo acesso ao banco falha
  const resposta = await app.pedir('POST', '/api/login', { corpo: { email: 'ana@demo.br', senha: 'demo1234' } });
  assert.equal(resposta.status, 500);
  assert.deepEqual(resposta.corpo, { erro: 'Erro interno. Tente de novo.' }); // nada de mensagem interna nem de pilha
  assert.equal(registro.mock.callCount(), 1);
  assert.ok(registro.mock.calls[0].arguments[0] instanceof Error);
});

test('erros dos manipuladores: sempre no log; resposta já enviada chega inteira; a pela metade é cortada; a muda vira 500', async (t) => {
  const registro = t.mock.method(console, 'error', () => {});
  const app = await subirApp({ pastaRotas: path.join(__dirname, 'rotas-falsas') });
  t.after(app.fechar);
  const registrado = (i) => registro.mock.calls[i].arguments[0];

  // responde 200 e depois lança: o cliente fica com o 200 e o erro vai para o log
  const depois = await app.pedir('GET', '/api/erro/depois-de-responder');
  assert.deepEqual([depois.status, depois.corpo], [200, { ok: true }]);
  assert.equal(registro.mock.callCount(), 1);
  assert.match(registrado(0).message, /falha depois da resposta/);

  // responderJson duas vezes: o segundo lança ERR_HTTP_HEADERS_SENT
  assert.equal((await app.pedir('GET', '/api/erro/resposta-dupla')).status, 200);
  assert.equal(registro.mock.callCount(), 2);
  assert.equal(registrado(1).code, 'ERR_HTTP_HEADERS_SENT');

  // 8 MB e depois lança: cortar a conexão aqui truncaria uma resposta que já estava completa
  const grande = await app.pedir('GET', '/api/erro/resposta-grande');
  assert.equal(grande.status, 200);
  assert.equal(grande.corpo.texto.length, 8 * 1024 * 1024);
  assert.equal(registro.mock.callCount(), 3);

  // cabeçalho enviado e resposta por terminar: aí sim corta, para o cliente não tomar o começo por completo
  await assert.rejects(app.pedir('GET', '/api/erro/pela-metade'));
  assert.equal(registro.mock.callCount(), 4);
  assert.match(registrado(3).message, /falha no meio da resposta/);

  // lista de manipuladores que não responde: 500 registrado, e não uma requisição pendurada
  const muda = await app.pedir('GET', '/api/erro/sem-resposta');
  assert.deepEqual([muda.status, muda.corpo], [500, { erro: 'Erro interno. Tente de novo.' }]);
  assert.equal(registro.mock.callCount(), 5);
  assert.match(registrado(4).message, /rota sem resposta/);

  // ErroHttp é erro previsto: responde com o status dele e não polui o log
  const previsto = await app.pedir('GET', '/api/erro/http');
  assert.deepEqual([previsto.status, previsto.corpo], [418, { erro: 'erro previsto' }]);
  assert.equal(registro.mock.callCount(), 5);
});

test('rota cuja lista não responde lança erro em vez de deixar a requisição pendurada', async () => {
  const roteador = criarRoteador();
  roteador.get('/muda', async () => {});
  roteador.get('/fala', async (req, res) => res.end('oi'));
  roteador.get('/fluxo', async (req, res) => {
    res.headersSent = true; // resposta em andamento (escrita aos poucos): quem a termina é o próprio manipulador
  });
  await assert.rejects(roteador.tratar({ method: 'GET', url: '/muda' }, respostaFalsa(), {}), /rota sem resposta/);
  assert.equal(await roteador.tratar({ method: 'GET', url: '/fala' }, respostaFalsa(), {}), true);
  assert.equal(await roteador.tratar({ method: 'GET', url: '/fluxo' }, respostaFalsa(), {}), true);
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
