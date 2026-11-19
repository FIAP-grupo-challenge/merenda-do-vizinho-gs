// Exportação do app para o data lake: pseudonimizada, sem nome, CPF, CAF, e-mail, telefone nem critério da RITS (LGPD).
const crypto = require('node:crypto');

// HMAC do id: o mesmo agricultor tem o mesmo pseudônimo em toda exportação, e o id não sai do app.
function pseudonimo(id, segredo) {
  return crypto.createHmac('sha256', segredo).update(String(id)).digest('hex').slice(0, 12);
}

// Listas fechadas, as chaves da fixture do contrato (dados/tests/fixtures/exportacao-app.json): campo que a IA devolve a mais
// (local de entrega, documentos, critérios, valor total, observações em texto livre) só sai se alguém decidir aqui.
const CHAVES_DA_CHAMADA = ['numero', 'orgao', 'municipio', 'uf', 'data_publicacao', 'prazo_envio'];
const CHAVES_DO_ITEM = ['produto', 'produto_id', 'quantidade', 'unidade', 'preco_unitario'];

// Só as chaves dadas; a que faltar sai null, para a exportação ter sempre as mesmas chaves.
const so = (objeto, chaves) => Object.fromEntries(chaves.map((chave) => [chave, objeto?.[chave] ?? null]));

// O contato sai null: é telefone e e-mail do edital, nada no pipeline lê o campo e o data lake não precisa deles.
const dadosDaChamada = (dados) => ({
  ...so(dados, CHAVES_DA_CHAMADA),
  contato: null,
  itens: (dados?.itens ?? []).map((item) => so(item, CHAVES_DO_ITEM)),
});

// `desde` corta cada coleção pela sua data; sem ele, vem tudo. Agricultores não têm data: vêm sempre inteiros.
function exportar(db, { desde, segredo }) {
  const corte = Date.parse(desde);
  // shortcut: lê a tabela inteira e filtra em JS; quando a exportação ficar lenta (leituras a cada poucos segundos), filtrar no WHERE
  const noPeriodo = (sql, campo) =>
    db
      .prepare(sql)
      .all()
      .filter((linha) => desde === undefined || Date.parse(linha[campo]) >= corte);

  const agricultores = db
    .prepare('SELECT usuario_id, municipio, uf, organico, ja_vendeu_pnae FROM agricultores')
    .all()
    .map((linha) => ({
      pseudonimo: pseudonimo(linha.usuario_id, segredo),
      municipio: linha.municipio,
      uf: linha.uf,
      organico: Boolean(linha.organico),
      ja_vendeu_pnae: Boolean(linha.ja_vendeu_pnae),
    }));

  const chamadas = noPeriodo('SELECT id, prefeitura_id, dados, status, origem, criada_em, publicada_em FROM chamadas', 'criada_em').map(
    (linha) => ({ ...linha, dados: dadosDaChamada(JSON.parse(linha.dados)) }),
  );

  // O item sai só com os campos do contrato: um campo novo gravado nele não sai sem ser decidido aqui.
  // A proposta conjunta da T7 (agrupamento.js) chama de quantidade_pedida o que o contrato chama de quantidade.
  // Na alocação, o agricultor_id vira o pseudônimo, e a alocação sai só com ele e com a quantidade; sem agricultor_id, não sai.
  const propostas = noPeriodo('SELECT id, chamada_id, cooperativa_id, itens, status, criada_em FROM propostas', 'criada_em').map(
    (linha) => ({
      ...linha,
      itens: JSON.parse(linha.itens).map((item) => ({
        ...so(item, CHAVES_DO_ITEM),
        quantidade: item.quantidade ?? item.quantidade_pedida ?? null,
        alocacoes: (item.alocacoes ?? [])
          .filter((alocacao) => alocacao?.agricultor_id != null)
          .map((alocacao) => ({ pseudonimo: pseudonimo(alocacao.agricultor_id, segredo), quantidade: alocacao.quantidade ?? null })),
      })),
    }),
  );

  const entregas = noPeriodo('SELECT id, proposta_id, produto_id, quantidade, valor, data, no_prazo FROM entregas', 'data').map(
    (linha) => ({ ...linha, no_prazo: Boolean(linha.no_prazo) }),
  );

  const leituras = noPeriodo('SELECT id, dispositivo, momento, temperatura_c, peso_kg, porta_aberta FROM leituras', 'momento').map(
    (linha) => ({ ...linha, porta_aberta: Boolean(linha.porta_aberta) }),
  );

  return { gerado_em: new Date().toISOString(), agricultores, chamadas, propostas, entregas, leituras };
}

module.exports = { pseudonimo, exportar };
