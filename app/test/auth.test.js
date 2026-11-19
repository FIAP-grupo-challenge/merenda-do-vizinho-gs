const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { hashSenha, conferirSenha, emitirToken, exigirLogin, exigirPapel } = require('../src/auth');
const { produtoExiste } = require('../src/catalogo');
const { criarRoteador } = require('../src/roteador');
const { semear } = require('../src/semente');
const { subirApp, respostaFalsa } = require('./ajuda');

test('hash de senha confere e rejeita senha errada', () => {
  const h = hashSenha('segredo123');
  assert.match(h, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.ok(conferirSenha('segredo123', h));
  assert.ok(!conferirSenha('outra', h));
  assert.ok(!conferirSenha('segredo123', 'lixo'));
  assert.ok(!conferirSenha(undefined, hashSenha('undefined')), 'login sem senha não vira o texto "undefined"');
  assert.notEqual(hashSenha('segredo123'), h, 'cada hash tem o seu sal');
});

test('cadastro com e-mail inválido devolve 400; login errado 401; /api/eu sem token 401 e com token 200', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const nova = { email: 'sem-arroba', senha: 'senha-forte', papel: 'agricultor', nome: 'Nova Agricultora' };
  assert.equal((await app.pedir('POST', '/api/cadastro', { corpo: nova })).status, 400);
  assert.equal((await app.pedir('POST', '/api/login', { corpo: { email: 'ana@demo.br', senha: 'errada123' } })).status, 401);
  assert.equal((await app.pedir('POST', '/api/login', { corpo: { email: 'ninguem@demo.br', senha: 'demo1234' } })).status, 401);

  assert.equal((await app.pedir('GET', '/api/eu')).status, 401);
  assert.equal((await app.pedir('GET', '/api/eu', { token: 'nao-e-um-jwt' })).status, 401);
  const deOutroSegredo = emitirToken({ id: 1, papel: 'prefeitura' }, 'outro-segredo');
  assert.equal((await app.pedir('GET', '/api/eu', { token: deOutroSegredo })).status, 401);
  const semAssinatura = [{ alg: 'none', typ: 'JWT' }, { id: 1, papel: 'prefeitura' }]
    .map((parte) => Buffer.from(JSON.stringify(parte)).toString('base64url'))
    .join('.');
  assert.equal((await app.pedir('GET', '/api/eu', { token: `${semAssinatura}.` })).status, 401);

  const login = await app.pedir('POST', '/api/login', { corpo: { email: 'ana@demo.br', senha: 'demo1234' } });
  assert.equal(login.status, 200);
  assert.equal(login.corpo.papel, 'agricultor');
  assert.ok(login.corpo.nome);
  const eu = await app.pedir('GET', '/api/eu', { token: login.corpo.token });
  assert.equal(eu.status, 200);
  assert.deepEqual(Object.keys(eu.corpo).sort(), ['email', 'id', 'nome', 'papel']);
  assert.equal(eu.corpo.email, 'ana@demo.br');
});

test('cadastro: 201 com token e a linha do papel; e-mail repetido 409; senha curta, papel ou CNPJ inválido 400', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const nova = { email: 'Nova@Exemplo.br', senha: 'senha-forte', papel: 'agricultor', nome: 'Nova Agricultora' };
  const criada = await app.pedir('POST', '/api/cadastro', { corpo: nova });
  assert.equal(criada.status, 201);
  const eu = await app.pedir('GET', '/api/eu', { token: criada.corpo.token });
  assert.deepEqual({ email: eu.corpo.email, papel: eu.corpo.papel }, { email: 'nova@exemplo.br', papel: 'agricultor' });
  assert.ok(app.db.prepare('SELECT 1 FROM agricultores WHERE usuario_id = ?').get(eu.corpo.id));
  assert.equal((await app.pedir('POST', '/api/login', { corpo: { email: 'NOVA@exemplo.br', senha: 'senha-forte' } })).status, 200);

  assert.equal((await app.pedir('POST', '/api/cadastro', { corpo: { ...nova, email: 'nova@exemplo.br' } })).status, 409);
  assert.equal((await app.pedir('POST', '/api/cadastro', { corpo: { ...nova, email: 'b@exemplo.br', senha: '1234567' } })).status, 400);
  assert.equal((await app.pedir('POST', '/api/cadastro', { corpo: { ...nova, email: 'c@exemplo.br', papel: 'admin' } })).status, 400);
  assert.equal((await app.pedir('POST', '/api/cadastro', { corpo: { ...nova, email: 'd@exemplo.br', nome: ' ' } })).status, 400);

  const cooperativa = {
    email: 'coop@exemplo.br',
    senha: 'senha-forte',
    papel: 'cooperativa',
    nome: 'Cooperativa Teste',
    cnpj: '11.222.333/0001-81',
    municipio: 'Catalão',
    uf: 'GO',
  };
  assert.equal((await app.pedir('POST', '/api/cadastro', { corpo: { ...cooperativa, cnpj: '123' } })).status, 400);
  assert.equal((await app.pedir('POST', '/api/cadastro', { corpo: { ...cooperativa, uf: 'XX' } })).status, 400);
  assert.equal((await app.pedir('POST', '/api/cadastro', { corpo: cooperativa })).status, 201);
  const linha = app.db
    .prepare('SELECT c.nome, c.cnpj, c.municipio, c.uf FROM cooperativas c JOIN usuarios u ON u.id = c.usuario_id WHERE u.email = ?')
    .get('coop@exemplo.br');
  assert.deepEqual({ ...linha }, { nome: 'Cooperativa Teste', cnpj: '11222333000181', municipio: 'Catalão', uf: 'GO' });
});

test('exigirPapel responde 403 para outro papel e a lista de manipuladores para ali', async () => {
  const roteador = criarRoteador();
  let chegou = false;
  roteador.get('/so-prefeitura', exigirLogin, exigirPapel('prefeitura'), async () => {
    chegou = true;
  });
  const token = emitirToken({ id: 3, papel: 'agricultor' }, 'segredo');
  const req = { method: 'GET', url: '/so-prefeitura', headers: { authorization: `Bearer ${token}` } };
  const res = respostaFalsa();
  await roteador.tratar(req, res, { config: { jwtSegredo: 'segredo' } });
  assert.equal(res.status, 403);
  assert.ok(JSON.parse(res.corpo).erro);
  assert.equal(chegou, false);
});

test('token vencido e token de outro algoritmo recebem 401; o certo recebe 200', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const { id, papel } = (await app.pedir('GET', '/api/eu', { token: await app.entrar('ana@demo.br') })).corpo;
  const eu = (token) => app.pedir('GET', '/api/eu', { token });
  const segredo = app.config.jwtSegredo;
  assert.equal((await eu(emitirToken({ id, papel }, segredo))).status, 200, 'controle: o mesmo usuário, com o token certo, entra');
  const vencido = jwt.sign({ id, papel, exp: Math.floor(Date.now() / 1000) - 60 }, segredo, { algorithm: 'HS256' });
  assert.equal((await eu(vencido)).status, 401, 'venceu há um minuto');
  const outroAlgoritmo = jwt.sign({ id, papel }, segredo, { algorithm: 'HS512' });
  assert.equal((await eu(outroAlgoritmo)).status, 401, 'segredo certo, mas só HS256 vale');
});

test('exigirPapel só aceita papéis em texto: sem os parênteses, ou com lista, falha alto em vez de deixar passar', async () => {
  assert.equal(typeof exigirPapel('agricultor', 'prefeitura'), 'function'); // controle
  assert.throws(() => exigirPapel(), TypeError);
  assert.throws(() => exigirPapel(['prefeitura']), TypeError);
  assert.throws(() => exigirPapel('prefeitura', undefined), TypeError);

  // sem os parênteses, o roteador chama exigirPapel(req, res, ctx) como se fosse um manipulador
  const roteador = criarRoteador();
  roteador.get('/aberta-por-engano', exigirLogin, exigirPapel, async (req, res) => res.end('passou'));
  const token = emitirToken({ id: 3, papel: 'agricultor' }, 'segredo');
  const req = { method: 'GET', url: '/aberta-por-engano', headers: { authorization: `Bearer ${token}` } };
  const res = respostaFalsa();
  await assert.rejects(roteador.tratar(req, res, { config: { jwtSegredo: 'segredo' } }), TypeError);
  assert.equal(res.corpo, null, 'o manipulador final não rodou');
});

test('GET /api/catalogo exige login e devolve o catálogo', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  assert.equal((await app.pedir('GET', '/api/catalogo')).status, 401);
  const catalogo = await app.pedir('GET', '/api/catalogo', { token: await app.entrar('ana@demo.br') });
  assert.equal(catalogo.status, 200);
  assert.ok(catalogo.corpo.some((produto) => produto.id === 'alface' && produto.nome === 'Alface'));
});

test('semear: rodar duas vezes não duplica nada e os usuários de demonstração entram com demo1234', async (t) => {
  const app = await subirApp(); // o subirApp já semeia uma vez
  t.after(app.fechar);
  const tabelas = ['usuarios', 'agricultores', 'cooperativas', 'produtos_agricultor'];
  const contar = () => tabelas.map((tabela) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n);
  const antes = contar();
  semear(app.db);
  assert.deepEqual(contar(), antes);
  assert.deepEqual(antes.slice(0, 3), [8, 6, 1]);

  const emails = ['prefeitura@demo.br', 'cooperativa@demo.br'].concat(
    ['ana', 'bruno', 'carla', 'davi', 'elisa', 'fabio'].map((nome) => `${nome}@demo.br`),
  );
  for (const email of emails) await app.entrar(email);

  const agricultor = (email) =>
    app.db.prepare('SELECT a.* FROM agricultores a JOIN usuarios u ON u.id = a.usuario_id WHERE u.email = ?').get(email);
  const produtos = (email) =>
    app.db
      .prepare('SELECT p.produto_id FROM produtos_agricultor p JOIN usuarios u ON u.id = p.agricultor_id WHERE u.email = ? ORDER BY 1')
      .all(email)
      .map((linha) => linha.produto_id);
  const ana = agricultor('ana@demo.br');
  assert.deepEqual([ana.mulher_titular, ana.jovem, ana.organico], [1, 1, 1]);
  assert.deepEqual(produtos('ana@demo.br'), ['alface', 'mandioca']);
  assert.equal(agricultor('fabio@demo.br').vendido_no_ano_reais, 38000);

  const cooperativa = app.db.prepare("SELECT c.* FROM cooperativas c JOIN usuarios u ON u.id = c.usuario_id WHERE u.email = 'cooperativa@demo.br'").get();
  assert.deepEqual([cooperativa.municipio, cooperativa.uf], ['Catalão', 'GO']);
  for (const linha of app.db.prepare('SELECT * FROM agricultores').all()) {
    assert.deepEqual([linha.municipio, linha.uf, linha.cooperativa_id], ['Catalão', 'GO', cooperativa.usuario_id]);
    for (const token of JSON.parse(linha.grupo_prioritario)) assert.ok(['assentado', 'indigena', 'quilombola'].includes(token));
  }
  for (const { produto_id: id } of app.db.prepare('SELECT produto_id FROM produtos_agricultor').all()) assert.ok(produtoExiste(id), id);
  assert.equal(app.db.prepare("SELECT nome FROM usuarios WHERE email = 'prefeitura@demo.br'").get().nome, 'Prefeitura Municipal de Catalão');
});
