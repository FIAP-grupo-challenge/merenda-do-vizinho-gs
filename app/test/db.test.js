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
