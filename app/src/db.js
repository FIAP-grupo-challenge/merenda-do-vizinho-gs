// Banco SQLite (node:sqlite). Colunas JSON guardam texto JSON; booleanos guardam 0 ou 1
// (o node:sqlite não aceita true/false como parâmetro). Datas e momentos em ISO 8601.
const { DatabaseSync } = require('node:sqlite');

function abrirBanco(caminho) {
  return new DatabaseSync(caminho);
}

// Idempotente: roda a cada subida do app.
function migrar(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      papel TEXT NOT NULL CHECK (papel IN ('agricultor', 'cooperativa', 'prefeitura')),
      nome TEXT NOT NULL,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agricultores (
      usuario_id INTEGER PRIMARY KEY,
      municipio TEXT,
      uf TEXT,
      caf TEXT,
      cpf TEXT,
      -- array JSON com zero ou mais de: "assentado", "indigena", "quilombola"
      grupo_prioritario TEXT NOT NULL DEFAULT '[]',
      organico INTEGER NOT NULL DEFAULT 0,
      mulher_titular INTEGER NOT NULL DEFAULT 0,
      jovem INTEGER NOT NULL DEFAULT 0,
      ja_vendeu_pnae INTEGER NOT NULL DEFAULT 0,
      cooperativa_id INTEGER,
      aceite_termo_em TEXT,
      vendido_no_ano_reais REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS produtos_agricultor (
      id INTEGER PRIMARY KEY,
      agricultor_id INTEGER NOT NULL,
      produto_id TEXT NOT NULL,
      quantidade_semana REAL NOT NULL,
      meses_safra TEXT -- array JSON de meses, de 1 a 12
    );

    CREATE TABLE IF NOT EXISTS cooperativas (
      usuario_id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      cnpj TEXT NOT NULL,
      municipio TEXT NOT NULL,
      uf TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chamadas (
      id INTEGER PRIMARY KEY,
      prefeitura_id INTEGER NOT NULL,
      dados TEXT NOT NULL, -- JSON da chamada, no formato da IA
      status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicada')),
      origem TEXT,
      criada_em TEXT NOT NULL,
      publicada_em TEXT
    );

    CREATE TABLE IF NOT EXISTS interesses (
      id INTEGER PRIMARY KEY,
      agricultor_id INTEGER NOT NULL,
      chamada_id INTEGER NOT NULL,
      produto_id TEXT NOT NULL,
      quantidade REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS propostas (
      id INTEGER PRIMARY KEY,
      chamada_id INTEGER NOT NULL,
      cooperativa_id INTEGER NOT NULL,
      itens TEXT NOT NULL, -- JSON
      status TEXT NOT NULL,
      criada_em TEXT NOT NULL,
      UNIQUE (chamada_id, cooperativa_id)
    );

    CREATE TABLE IF NOT EXISTS leituras (
      id INTEGER PRIMARY KEY,
      dispositivo TEXT NOT NULL,
      momento TEXT NOT NULL,
      temperatura_c REAL NOT NULL,
      peso_kg REAL NOT NULL,
      porta_aberta INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alertas (
      id INTEGER PRIMARY KEY,
      dispositivo TEXT NOT NULL,
      tipo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      momento TEXT NOT NULL,
      resolvido INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS entregas (
      id INTEGER PRIMARY KEY,
      proposta_id INTEGER NOT NULL,
      produto_id TEXT NOT NULL,
      quantidade REAL NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      no_prazo INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repasses (
      prefeitura_id INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      valor REAL NOT NULL,
      PRIMARY KEY (prefeitura_id, ano)
    );
  `);
}

// Roda funcao() numa transação: tudo grava, ou nada grava. A funcao é síncrona, e não pode ser async.
function emTransacao(db, funcao) {
  db.exec('BEGIN');
  try {
    const resultado = funcao();
    // com async, o COMMIT sairia antes do fim da funcao, e o que viesse depois do primeiro await ficaria fora da transação
    if (resultado instanceof Promise) throw new TypeError('emTransacao: a funcao não pode ser async nem devolver Promise');
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

module.exports = { abrirBanco, migrar, emTransacao };
