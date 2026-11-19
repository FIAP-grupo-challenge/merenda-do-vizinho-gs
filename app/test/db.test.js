const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBanco, migrar, emTransacao } = require('../src/db');

test('emTransacao desfaz tudo quando lança, confirma quando dá certo e recusa corpo async', () => {
  const db = abrirBanco(':memory:');
  migrar(db);
  const inserir = () =>
    db.prepare("INSERT INTO usuarios (email, senha_hash, papel, nome, criado_em) VALUES ('a@b.br', 'x', 'agricultor', 'A', 'agora')").run();
  const linhas = () => db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;

  assert.throws(
    () =>
      emTransacao(db, () => {
        inserir();
        throw new Error('falhou no meio');
      }),
    /falhou no meio/,
  );
  assert.equal(linhas(), 0, 'o ROLLBACK desfez a linha inserida antes do erro');

  assert.equal(
    emTransacao(db, () => {
      inserir();
      return 'pronto';
    }),
    'pronto',
  );
  assert.equal(linhas(), 1);

  // corpo async: o COMMIT sairia antes do fim dele; a função é recusada e o que ela já tinha feito é desfeito
  db.exec('DELETE FROM usuarios');
  assert.throws(() => emTransacao(db, async () => inserir()), /Promise/);
  assert.equal(linhas(), 0);
  assert.equal(emTransacao(db, () => 'ok'), 'ok'); // um BEGIN a mais falharia se o ROLLBACK não tivesse rodado
  db.close();
});

// O CREATE TABLE IF NOT EXISTS não mexe numa tabela que já existe: o banco criado antes da coluna entregas.item (o volume de um
// docker compose antigo, um app.db de desenvolvimento) a ganha no migrar(), sem perder as entregas que já estavam lá.
test('migrar acrescenta entregas.item a um banco antigo, guarda as entregas e pode rodar de novo', () => {
  const db = abrirBanco(':memory:');
  db.exec(`CREATE TABLE entregas (
    id INTEGER PRIMARY KEY, proposta_id INTEGER NOT NULL, produto_id TEXT NOT NULL,
    quantidade REAL NOT NULL, valor REAL NOT NULL, data TEXT NOT NULL, no_prazo INTEGER NOT NULL)`);
  db.exec("INSERT INTO entregas (proposta_id, produto_id, quantidade, valor, data, no_prazo) VALUES (1, 'alface', 10, 70.3, '2026-08-05', 1)");
  const colunas = () => db.prepare('PRAGMA table_info(entregas)').all().map((coluna) => coluna.name);
  assert.ok(!colunas().includes('item'), 'o banco de antes não tem a coluna');

  migrar(db);
  migrar(db); // idempotente: a segunda vez não tenta acrescentar de novo
  assert.equal(colunas().filter((nome) => nome === 'item').length, 1);
  assert.deepEqual({ ...db.prepare('SELECT produto_id, item, quantidade FROM entregas').get() }, { produto_id: 'alface', item: null, quantidade: 10 });
  db.exec("INSERT INTO entregas (proposta_id, produto_id, item, quantidade, valor, data, no_prazo) VALUES (1, 'abobora', 3, 5, 34.35, '2026-08-06', 0)");
  assert.equal(db.prepare('SELECT item FROM entregas WHERE produto_id = ?').get('abobora').item, 3);

  const novo = abrirBanco(':memory:');
  migrar(novo); // banco novo: a coluna já vem do CREATE TABLE
  assert.ok(novo.prepare('PRAGMA table_info(entregas)').all().some((coluna) => coluna.name === 'item'));
  db.close();
  novo.close();
});
