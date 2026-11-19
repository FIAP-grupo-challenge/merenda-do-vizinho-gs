// Usuários de demonstração, todos com a senha demo1234 e todos em Catalão (GO), a cidade da chamada
// de demonstração. Os agricultores são cooperados da cooperativa@demo.br e plantam itens dessa chamada.
// Idempotente: o index.js chama a cada subida, e quem já existe não é mexido.
const { hashSenha } = require('./auth');
const { emTransacao } = require('./db');
const { capacidadeNoPeriodo } = require('./regras-pnae');
// A chamada pública 003/2026 de Catalão (GO), lida do PDF do edital e conferida à mão (semente/chamada-demo.json)
const CHAMADA_DEMO = require('../semente/chamada-demo.json');

const SENHA_DEMO = 'demo1234';
const TODO_ANO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// quantidade_semana na unidade do edital de Catalão (alface e couve em peça, cheiro-verde em feixe, milho em atilho)
const AGRICULTORES = [
  {
    email: 'ana@demo.br',
    nome: 'Ana Souza',
    perfil: { mulher_titular: 1, jovem: 1, organico: 1 },
    produtos: [['alface', 25], ['mandioca', 30]],
  },
  {
    email: 'bruno@demo.br',
    nome: 'Bruno Lima',
    perfil: { ja_vendeu_pnae: 1, vendido_no_ano_reais: 12000 },
    produtos: [['tomate', 30], ['pepino', 20]],
  },
  {
    email: 'carla@demo.br',
    nome: 'Carla Ferreira',
    perfil: { mulher_titular: 1, grupo_prioritario: '["quilombola"]' },
    produtos: [['alface', 20], ['couve', 20], ['cheiro-verde', 30]],
  },
  {
    email: 'davi@demo.br',
    nome: 'Davi Rocha',
    perfil: { jovem: 1, grupo_prioritario: '["assentado"]' },
    produtos: [['mandioca', 25], ['milho-verde', 15], ['abobora', 25]],
  },
  {
    email: 'elisa@demo.br',
    nome: 'Elisa Martins',
    perfil: { mulher_titular: 1, organico: 1 },
    produtos: [['brocolis', 8], ['couve-flor', 8], ['alface', 15]],
  },
  {
    email: 'fabio@demo.br',
    nome: 'Fábio Alves',
    perfil: { ja_vendeu_pnae: 1, vendido_no_ano_reais: 38000 }, // perto do limite de R$ 40 mil por ano
    produtos: [['alface', 15], ['mandioca', 20]],
  },
];

// o que o perfil de cada agricultor acima não disser
const PERFIL_PADRAO = { mulher_titular: 0, jovem: 0, organico: 0, ja_vendeu_pnae: 0, vendido_no_ano_reais: 0, grupo_prioritario: '[]' };

function semear(db) {
  const senhaHash = hashSenha(SENHA_DEMO);
  const agora = new Date().toISOString();
  const buscar = db.prepare('SELECT id FROM usuarios WHERE email = ?');
  const inserir = db.prepare('INSERT INTO usuarios (email, senha_hash, papel, nome, criado_em) VALUES (?, ?, ?, ?, ?)');
  // devolve o id e se o usuário acabou de ser criado
  const garantir = (email, papel, nome) => {
    const existente = buscar.get(email);
    if (existente) return { id: existente.id, novo: false };
    return { id: Number(inserir.run(email, senhaHash, papel, nome, agora).lastInsertRowid), novo: true };
  };

  emTransacao(db, () => {
    const prefeitura = garantir('prefeitura@demo.br', 'prefeitura', 'Prefeitura Municipal de Catalão');

    const cooperativa = garantir('cooperativa@demo.br', 'cooperativa', 'Cooperativa Vizinhos do Campo');
    if (cooperativa.novo) {
      db.prepare('INSERT INTO cooperativas (usuario_id, nome, cnpj, municipio, uf) VALUES (?, ?, ?, ?, ?)').run(
        cooperativa.id,
        'Cooperativa Vizinhos do Campo',
        '11222333000181', // CNPJ de exemplo, só para a demonstração
        'Catalão',
        'GO',
      );
    }

    const inserirAgricultor = db.prepare(
      `INSERT INTO agricultores (usuario_id, municipio, uf, cooperativa_id, mulher_titular, jovem, organico,
         ja_vendeu_pnae, vendido_no_ano_reais, grupo_prioritario)
       VALUES (:usuario_id, 'Catalão', 'GO', :cooperativa_id, :mulher_titular, :jovem, :organico,
         :ja_vendeu_pnae, :vendido_no_ano_reais, :grupo_prioritario)`,
    );
    const inserirProduto = db.prepare(
      'INSERT INTO produtos_agricultor (agricultor_id, produto_id, quantidade_semana, meses_safra) VALUES (?, ?, ?, ?)',
    );
    const agricultores = [];
    for (const { email, nome, perfil, produtos } of AGRICULTORES) {
      const agricultor = garantir(email, 'agricultor', nome);
      agricultores.push(agricultor.id);
      if (!agricultor.novo) continue;
      inserirAgricultor.run({ ...PERFIL_PADRAO, ...perfil, usuario_id: agricultor.id, cooperativa_id: cooperativa.id });
      for (const [produtoId, quantidadeSemana] of produtos) {
        inserirProduto.run(agricultor.id, produtoId, quantidadeSemana, JSON.stringify(TODO_ANO));
      }
    }
    semearChamada(db, prefeitura.id, agricultores);
  });
}

// A chamada de Catalão já publicada, com origem 'cache' (a leitura conferida à mão): a demonstração não depende da IA
// nem de clicar em "Publicar". Vem com o interesse dos seis agricultores: cada um oferece o que produz no período, em
// cada produto que a chamada pede. Data de publicação: o início do recebimento dos projetos no edital.
function semearChamada(db, prefeituraId, agricultores) {
  if (db.prepare("SELECT 1 FROM chamadas WHERE prefeitura_id = ? AND origem = 'cache'").get(prefeituraId)) return;
  const publicadaEm = `${CHAMADA_DEMO.data_publicacao}T12:00:00.000Z`;
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO chamadas (prefeitura_id, dados, status, origem, criada_em, publicada_em)
       VALUES (?, ?, 'publicada', 'cache', ?, ?)`,
    )
    .run(prefeituraId, JSON.stringify(CHAMADA_DEMO), publicadaEm, publicadaEm);
  const pedidos = new Set(CHAMADA_DEMO.itens.map((item) => item.produto_id));
  const produtos = db.prepare('SELECT produto_id, quantidade_semana FROM produtos_agricultor WHERE agricultor_id = ?');
  const inserir = db.prepare('INSERT INTO interesses (agricultor_id, chamada_id, produto_id, quantidade) VALUES (?, ?, ?, ?)');
  for (const id of agricultores) {
    for (const { produto_id, quantidade_semana } of produtos.all(id)) {
      if (!pedidos.has(produto_id)) continue;
      inserir.run(id, lastInsertRowid, produto_id, capacidadeNoPeriodo(quantidade_semana, CHAMADA_DEMO.semanas_fornecimento));
    }
  }
}

module.exports = { semear };
