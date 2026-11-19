// Rotas da cooperativa: as chamadas publicadas da UF dela e a proposta conjunta, com a divisão entre os cooperados.
const { exigirLogin, exigirPapel } = require('../auth');
const { montarPropostaConjunta } = require('../agrupamento');
const { produtosDoCatalogo } = require('../catalogo');
const { ErroHttp, responderJson } = require('../http-util');
const { participante, totalDaProposta } = require('../proposta');
const { arredondar, unidadeInteira } = require('../regras-pnae');

// para as mensagens de erro, que a tela mostra como vieram
const NOMES = new Map(produtosDoCatalogo().map((produto) => [produto.id, produto.nome]));
const emReais = (valor) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const emNumero = (valor) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// O item como fica gravado: o de montarPropostaConjunta com a quantidade oferecida (`quantidade`, a chave que a
// exportação lê), o que falta e o valor, somado linha a linha em centavos como no projeto de venda.
function itemGravado({ produto_id, produto, unidade, preco_unitario, quantidade_pedida }, alocacoes) {
  const quantidade = arredondar(alocacoes.reduce((total, a) => total + a.quantidade, 0));
  const valor = arredondar(alocacoes.reduce((total, a) => total + arredondar(a.quantidade * preco_unitario), 0));
  const falta = arredondar(quantidade_pedida - quantidade);
  return { produto_id, produto, unidade, preco_unitario, quantidade_pedida, quantidade, falta, valor, alocacoes };
}

function registrar(roteador, { db }) {
  const soCooperativa = [exigirLogin, exigirPapel('cooperativa')];
  const buscarNome = db.prepare('SELECT nome FROM usuarios WHERE id = ?');
  const buscarProposta = db.prepare('SELECT * FROM propostas WHERE id = ? AND cooperativa_id = ?');
  const buscarPropostaDaChamada = db.prepare('SELECT id FROM propostas WHERE chamada_id = ? AND cooperativa_id = ?');
  const dadosDa = (chamadaId) => JSON.parse(db.prepare('SELECT dados FROM chamadas WHERE id = ?').get(chamadaId).dados);

  function cooperativaDe(ctx) {
    const cooperativa = db.prepare('SELECT * FROM cooperativas WHERE usuario_id = ?').get(ctx.usuario.id);
    if (!cooperativa) throw new ErroHttp(404, 'Cooperativa não encontrada.');
    return cooperativa;
  }

  // Só as chamadas publicadas da UF da cooperativa.
  function chamadaPublicada(id, cooperativa) {
    const linha = db.prepare("SELECT id, dados FROM chamadas WHERE id = ? AND status = 'publicada'").get(id);
    const dados = linha && JSON.parse(linha.dados);
    if (!linha || dados.uf !== cooperativa.uf) throw new ErroHttp(404, 'Chamada não encontrada.');
    return { id: linha.id, dados };
  }

  function propostaDa(ctx) {
    const proposta = buscarProposta.get(ctx.params.id, ctx.usuario.id);
    if (!proposta) throw new ErroHttp(404, 'Proposta não encontrada.');
    return proposta;
  }

  // Os cooperados como montarPropostaConjunta os quer, com a capacidade de cada produto que marcaram na chamada.
  const cooperados = (cooperativa, chamada) =>
    db
      .prepare(
        `SELECT a.*, u.nome FROM agricultores a JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.cooperativa_id = ? ORDER BY a.usuario_id`,
      )
      .all(cooperativa.usuario_id)
      .map((agricultor) => participante(db, agricultor, chamada));

  // A proposta para a tela: a chamada resumida, os itens e o total; com alocações (e o nome de cada cooperado) no detalhe.
  function descrever(proposta, comAlocacoes) {
    const { numero, orgao, municipio, uf, prazo_envio } = dadosDa(proposta.chamada_id);
    const itens = JSON.parse(proposta.itens);
    const comNomes = (alocacoes) => alocacoes.map((a) => ({ ...a, nome: buscarNome.get(a.agricultor_id)?.nome ?? null }));
    return {
      id: proposta.id,
      chamada_id: proposta.chamada_id,
      status: proposta.status,
      criada_em: proposta.criada_em,
      chamada: { numero, orgao, municipio, uf, prazo_envio },
      itens: itens.map(({ alocacoes, ...item }) => (comAlocacoes ? { ...item, alocacoes: comNomes(alocacoes) } : item)),
      total: totalDaProposta(itens),
    };
  }

  roteador.get('/api/cooperativa/chamadas', ...soCooperativa, async (req, res, ctx) => {
    const cooperativa = cooperativaDe(ctx);
    const chamadas = db
      .prepare("SELECT id, dados FROM chamadas WHERE status = 'publicada' AND json_extract(dados, '$.uf') = ? ORDER BY id DESC")
      .all(cooperativa.uf)
      .map(({ id, dados }) => {
        const { numero, orgao, municipio, uf, data_publicacao, prazo_envio } = JSON.parse(dados);
        const proposta_id = buscarPropostaDaChamada.get(id, cooperativa.usuario_id)?.id ?? null;
        return { id, numero, orgao, municipio, uf, data_publicacao, prazo_envio, proposta_id };
      });
    responderJson(res, 200, chamadas);
  });

  // Monta a proposta conjunta com a divisão automática. Uma por cooperativa e chamada: chamar de novo recalcula.
  roteador.post('/api/cooperativa/chamadas/:id/proposta', ...soCooperativa, async (req, res, ctx) => {
    const cooperativa = cooperativaDe(ctx);
    const chamada = chamadaPublicada(ctx.params.id, cooperativa);
    const { itens: divididos } = montarPropostaConjunta(chamada.dados, cooperados(cooperativa, chamada));
    const itens = divididos.map((item) => itemGravado(item, item.alocacoes));
    if (itens.every((item) => item.quantidade === 0)) {
      throw new ErroHttp(400, 'Nenhum cooperado marcou interesse no que esta chamada pede. Peça aos agricultores que marquem na tela deles.');
    }
    const existente = buscarPropostaDaChamada.get(chamada.id, cooperativa.usuario_id);
    let id = existente?.id;
    if (existente) {
      db.prepare('UPDATE propostas SET itens = ? WHERE id = ?').run(JSON.stringify(itens), id);
    } else {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO propostas (chamada_id, cooperativa_id, itens, status, criada_em) VALUES (?, ?, ?, 'enviada', ?)")
        .run(chamada.id, cooperativa.usuario_id, JSON.stringify(itens), new Date().toISOString());
      id = Number(lastInsertRowid);
    }
    responderJson(res, existente ? 200 : 201, descrever(buscarProposta.get(id, cooperativa.usuario_id), true));
  });

  // As propostas da cooperativa, com a chamada, os itens e o total (a câmara fria registra as entregas a partir daqui).
  roteador.get('/api/cooperativa/propostas', ...soCooperativa, async (req, res, ctx) => {
    const propostas = db.prepare('SELECT * FROM propostas WHERE cooperativa_id = ? ORDER BY id DESC').all(ctx.usuario.id);
    responderJson(res, 200, propostas.map((proposta) => descrever(proposta, false)));
  });

  roteador.get('/api/cooperativa/propostas/:id', ...soCooperativa, async (req, res, ctx) => {
    responderJson(res, 200, descrever(propostaDa(ctx), true));
  });

  // A divisão editada na tela: { itens: [{ alocacoes: [{ agricultor_id, quantidade }] }] }, um por item, na ordem da proposta.
  // Vale se a soma de cada item não passa do pedido, se o que cada cooperado leva de um produto (somando os itens dele,
  // como as duas abóboras de Catalão) cabe na capacidade dele, e se o valor dele em todos os itens cabe no limite do ano.
  // Assim nenhuma alocação passa do teto: o menor valor entre a capacidade e o limite ÷ preço. Item contado em pç, maço,
  // dúzia etc. (unidadeInteira) só aceita número inteiro, como a divisão automática.
  roteador.put('/api/cooperativa/propostas/:id', ...soCooperativa, async (req, res, ctx) => {
    const cooperativa = cooperativaDe(ctx);
    const proposta = propostaDa(ctx);
    const itens = JSON.parse(proposta.itens);
    const enviados = ctx.corpo.itens;
    if (!Array.isArray(enviados) || enviados.length !== itens.length) {
      throw new ErroHttp(400, 'Mande a divisão de todos os itens da proposta.');
    }
    const chamada = { id: proposta.chamada_id, dados: dadosDa(proposta.chamada_id) };
    const membros = new Map(cooperados(cooperativa, chamada).map((c) => [c.agricultor_id, { ...c, reais: 0, quantidades: {} }]));

    const novos = itens.map((item, i) => {
      const alocacoes = enviados[i]?.alocacoes;
      if (!Array.isArray(alocacoes)) throw new ErroHttp(400, `${item.produto}: mande a lista de alocações.`);
      const lidas = alocacoes.map((a) => {
        const membro = membros.get(a?.agricultor_id);
        if (!membro) throw new ErroHttp(400, `${item.produto}: só entram cooperados desta cooperativa.`);
        if (typeof a.quantidade !== 'number' || !Number.isFinite(a.quantidade) || a.quantidade < 0) {
          throw new ErroHttp(400, `${item.produto}: a quantidade de ${membro.nome} precisa ser um número, zero ou mais.`);
        }
        if (unidadeInteira(item.unidade) && !Number.isInteger(a.quantidade)) {
          throw new ErroHttp(400, `${item.produto} é contada em ${item.unidade}: use número inteiro.`);
        }
        const quantidade = arredondar(a.quantidade);
        membro.reais = arredondar(membro.reais + arredondar(quantidade * item.preco_unitario));
        membro.quantidades[item.produto_id] = arredondar((membro.quantidades[item.produto_id] ?? 0) + quantidade);
        return { agricultor_id: membro.agricultor_id, quantidade };
      });
      if (new Set(lidas.map((a) => a.agricultor_id)).size !== lidas.length) {
        throw new ErroHttp(400, `${item.produto}: cada cooperado aparece uma vez só.`);
      }
      const novo = itemGravado(item, lidas);
      if (novo.quantidade > item.quantidade_pedida) {
        const [soma, pedido] = [novo.quantidade, item.quantidade_pedida].map(emNumero);
        throw new ErroHttp(400, `${item.produto}: a soma (${soma}) passa do que a chamada pede (${pedido}).`);
      }
      return novo;
    });
    for (const membro of membros.values()) {
      for (const [produtoId, quantidade] of Object.entries(membro.quantidades)) {
        const capacidade = membro.capacidades[produtoId] ?? 0;
        if (quantidade > capacidade) {
          const produto = NOMES.get(produtoId) ?? produtoId;
          const [leva, pode] = [quantidade, capacidade].map(emNumero);
          throw new ErroHttp(400, `${membro.nome}: ${leva} de ${produto}, somando os itens, passa do que marcou e pode entregar (${pode}).`);
        }
      }
      if (membro.reais > membro.limite_restante_reais) {
        const [valor, resta] = [membro.reais, membro.limite_restante_reais].map(emReais);
        throw new ErroHttp(400, `${membro.nome}: ${valor} passa do que resta do limite de R$ 40 mil no ano (${resta}).`);
      }
    }
    db.prepare('UPDATE propostas SET itens = ? WHERE id = ?').run(JSON.stringify(novos), proposta.id);
    responderJson(res, 200, descrever({ ...proposta, itens: JSON.stringify(novos) }, true));
  });
}

module.exports = { registrar };
