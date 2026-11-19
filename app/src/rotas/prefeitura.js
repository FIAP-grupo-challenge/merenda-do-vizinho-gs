// Rotas da prefeitura: ler a chamada com a IA, conferir e publicar, ver as propostas e as entregas, e a meta do ano.
const { exigirLogin, exigirPapel } = require('../auth');
const { produtoExiste } = require('../catalogo');
const { ErroHttp, responderJson } = require('../http-util');
const { totalDaProposta } = require('../proposta');
const { DIAS_MINIMOS_CHAMADA, arredondar, minimoDoAno, prazoMinimoOk } = require('../regras-pnae');
const { validarData, validarUf } = require('../validacao');

// Campos de texto da chamada: [rótulo nas mensagens, tamanho máximo].
const TEXTOS = {
  numero: ['O número', 50],
  orgao: ['O órgão', 200],
  municipio: ['O município', 100],
  periodo_fornecimento: ['O período de fornecimento', 200],
  local_entrega: ['O local de entrega', 500],
  contato: ['O contato', 300],
};
const LISTAS = { documentos_exigidos: 'Os documentos exigidos', criterios_prioridade: 'Os critérios de prioridade' };

// Texto opcional: aparado, e vazio vira null.
function lerTexto(valor, rotulo, maximo) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string' || valor.trim().length > maximo) {
    throw new ErroHttp(400, `${rotulo}: escreva um texto de até ${maximo} letras.`);
  }
  return valor.trim() || null;
}

function lerNumeroPositivo(valor, rotulo) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > 1e7) {
    throw new ErroHttp(400, `${rotulo} precisa ser um número maior que zero.`);
  }
  return valor;
}

// Os itens vêm inteiros: incluir, trocar ou remover é mandar a lista nova. O valor total é refeito (quantidade × preço).
function lerItens(itens) {
  if (!Array.isArray(itens) || itens.length > 200) throw new ErroHttp(400, 'Mande os itens numa lista (até 200).');
  return itens.map((item, i) => {
    const nome = `Item ${i + 1}`;
    if (!item || typeof item !== 'object') throw new ErroHttp(400, `${nome}: confira os dados.`);
    const produto = lerTexto(item.produto, `${nome}, alimento`, 200);
    const unidade = lerTexto(item.unidade, `${nome}, unidade`, 30);
    if (!produto || !unidade) throw new ErroHttp(400, `${nome}: escreva o alimento e a unidade.`);
    const produto_id = item.produto_id ?? null;
    if (produto_id !== null && !produtoExiste(produto_id)) throw new ErroHttp(400, `${nome}: escolha um produto do catálogo.`);
    const quantidade = lerNumeroPositivo(item.quantidade, `${nome}: a quantidade`);
    const preco_unitario = lerNumeroPositivo(item.preco_unitario, `${nome}: o preço`);
    return {
      produto,
      produto_id,
      unidade,
      quantidade,
      preco_unitario,
      valor_total: arredondar(quantidade * preco_unitario),
      entrega: lerTexto(item.entrega, `${nome}, entrega`, 500),
      observacoes: lerTexto(item.observacoes, `${nome}, observações`, 500),
    };
  });
}

// Só os campos que vieram no corpo, já conferidos; os outros ficam como estão na chamada.
function lerCampos(corpo) {
  const campos = {};
  const veio = (campo) => Object.hasOwn(corpo, campo);
  for (const [campo, [rotulo, maximo]] of Object.entries(TEXTOS)) {
    if (veio(campo)) campos[campo] = lerTexto(corpo[campo], rotulo, maximo);
  }
  if (veio('uf')) {
    const uf = lerTexto(corpo.uf, 'A UF', 2)?.toUpperCase() ?? null;
    if (uf !== null && !validarUf(uf)) throw new ErroHttp(400, 'Escolha uma UF que exista.');
    campos.uf = uf;
  }
  for (const campo of ['data_publicacao', 'prazo_envio']) {
    if (!veio(campo)) continue;
    const data = corpo[campo] || null;
    if (data !== null && !validarData(data)) throw new ErroHttp(400, 'Escreva as datas no formato AAAA-MM-DD, como 2026-07-30.');
    campos[campo] = data;
  }
  if (veio('semanas_fornecimento')) {
    const semanas = corpo.semanas_fornecimento;
    if (semanas !== null && !(typeof semanas === 'number' && semanas > 0 && semanas <= 53)) {
      throw new ErroHttp(400, 'As semanas de fornecimento vão de 1 a 53 (ou fica em branco).');
    }
    campos.semanas_fornecimento = semanas;
  }
  for (const [campo, rotulo] of Object.entries(LISTAS)) {
    if (!veio(campo)) continue;
    const lista = corpo[campo];
    if (!Array.isArray(lista) || lista.length > 50) throw new ErroHttp(400, `${rotulo} vão numa lista (até 50).`);
    campos[campo] = lista.map((linha) => lerTexto(linha, rotulo, 500)).filter(Boolean);
  }
  if (veio('itens')) campos.itens = lerItens(corpo.itens);
  return campos;
}

// Avisos das regras sobre a chamada como está agora (somem quando a prefeitura corrige).
function avisosDasRegras(dados) {
  if (prazoMinimoOk(dados)) return [];
  return [
    `prazo menor que ${DIAS_MINIMOS_CHAMADA} dias corridos entre a publicação e o fim do envio dos projetos ` +
      '(Res. CD/FNDE 4/2026, art. 32); confira as datas',
  ];
}

function registrar(roteador, { db, config, ia }) {
  const soPrefeitura = [exigirLogin, exigirPapel('prefeitura')];

  function chamadaDa(ctx) {
    const linha = db.prepare('SELECT * FROM chamadas WHERE id = ? AND prefeitura_id = ?').get(ctx.params.id, ctx.usuario.id);
    if (!linha) throw new ErroHttp(404, 'Chamada não encontrada.');
    return { ...linha, dados: JSON.parse(linha.dados) };
  }

  function rascunhoDa(ctx) {
    const chamada = chamadaDa(ctx);
    if (chamada.status !== 'rascunho') throw new ErroHttp(409, 'A chamada já está publicada e não muda mais.');
    return chamada;
  }

  const buscarEntregas = db.prepare(
    'SELECT id, produto_id, quantidade, valor, data, no_prazo FROM entregas WHERE proposta_id = ? ORDER BY data, id',
  );

  // A chamada com as propostas recebidas. A prefeitura vê o total de cada item, não quem planta o quê.
  function detalhar({ id, status, origem, criada_em, publicada_em, dados }) {
    const propostas = db
      .prepare(
        `SELECT p.id, p.itens, p.status, p.criada_em, c.nome, c.municipio, c.uf
         FROM propostas p JOIN cooperativas c ON c.usuario_id = p.cooperativa_id WHERE p.chamada_id = ? ORDER BY p.id`,
      )
      .all(id)
      .map((p) => {
        const itens = JSON.parse(p.itens);
        return {
          id: p.id,
          cooperativa: { nome: p.nome, municipio: p.municipio, uf: p.uf },
          status: p.status,
          criada_em: p.criada_em,
          itens: itens.map(({ alocacoes, ...item }) => item),
          total: totalDaProposta(itens),
          entregas: buscarEntregas.all(p.id).map((e) => ({ ...e, no_prazo: Boolean(e.no_prazo) })),
        };
      });
    return { id, status, origem, criada_em, publicada_em, chamada: dados, avisos: avisosDasRegras(dados), propostas };
  }

  const gravarDados = (id, dados) => db.prepare('UPDATE chamadas SET dados = ? WHERE id = ?').run(JSON.stringify(dados), id);

  // { pdf_base64 } ou { texto }: a IA lê, e a chamada fica como rascunho para a prefeitura conferir.
  roteador.post('/api/prefeitura/chamadas', ...soPrefeitura, async (req, res, ctx) => {
    const { pdf_base64, texto } = ctx.corpo;
    let entrada;
    if (pdf_base64 !== undefined) {
      // JVBER é '%PDF' em base64: o começo de todo PDF
      if (typeof pdf_base64 !== 'string' || !pdf_base64.startsWith('JVBER')) throw new ErroHttp(400, 'O arquivo não é um PDF.');
      entrada = { pdf_base64 };
    } else if (typeof texto === 'string' && texto.trim()) {
      entrada = { texto };
    } else {
      throw new ErroHttp(400, 'Mande o PDF da chamada.');
    }
    const leitura = await ia.extrairChamada(entrada); // IA fora do ar ou lenta: o cliente já lança o 502
    const { chamada, avisos } = leitura ?? {};
    if (!chamada || typeof chamada !== 'object' || !Array.isArray(chamada.itens) || !Array.isArray(avisos)) {
      throw new ErroHttp(502, 'A IA respondeu fora do formato esperado. Tente de novo.');
    }
    const { lastInsertRowid } = db
      .prepare("INSERT INTO chamadas (prefeitura_id, dados, status, origem, criada_em) VALUES (?, ?, 'rascunho', ?, ?)")
      .run(ctx.usuario.id, JSON.stringify(chamada), leitura.origem ?? null, new Date().toISOString());
    responderJson(res, 201, {
      id: Number(lastInsertRowid),
      chamada,
      origem: leitura.origem ?? null,
      modelo: leitura.modelo ?? null,
      duracao_ms: leitura.duracao_ms ?? null,
      avisos: [...avisos, ...avisosDasRegras(chamada)],
    });
  });

  roteador.get('/api/prefeitura/chamadas', ...soPrefeitura, async (req, res, ctx) => {
    const chamadas = db
      .prepare(
        `SELECT c.id, c.dados, c.status, c.origem, c.criada_em, c.publicada_em,
           (SELECT COUNT(*) FROM propostas p WHERE p.chamada_id = c.id) AS propostas
         FROM chamadas c WHERE c.prefeitura_id = ? ORDER BY c.id DESC`,
      )
      .all(ctx.usuario.id)
      .map(({ dados, ...linha }) => {
        const { numero, municipio, uf, prazo_envio } = JSON.parse(dados);
        return { ...linha, numero, municipio, uf, prazo_envio };
      });
    responderJson(res, 200, chamadas);
  });

  roteador.get('/api/prefeitura/chamadas/:id', ...soPrefeitura, async (req, res, ctx) => {
    responderJson(res, 200, detalhar(chamadaDa(ctx)));
  });

  roteador.put('/api/prefeitura/chamadas/:id', ...soPrefeitura, async (req, res, ctx) => {
    const chamada = rascunhoDa(ctx);
    chamada.dados = { ...chamada.dados, ...lerCampos(ctx.corpo) };
    gravarDados(chamada.id, chamada.dados);
    responderJson(res, 200, detalhar(chamada));
  });

  // Publicar exige pelo menos 1 item conferido e a UF, que é por onde cooperativas e agricultores acham a chamada.
  roteador.post('/api/prefeitura/chamadas/:id/publicar', ...soPrefeitura, async (req, res, ctx) => {
    const chamada = rascunhoDa(ctx);
    if (chamada.dados.itens.length === 0) throw new ErroHttp(400, 'Inclua pelo menos um item antes de publicar.');
    chamada.dados.itens = lerItens(chamada.dados.itens); // os itens que vieram da IA e não passaram por uma edição
    if (!validarUf(chamada.dados.uf)) throw new ErroHttp(400, 'Escolha a UF da chamada antes de publicar.');
    chamada.status = 'publicada';
    chamada.publicada_em = new Date().toISOString();
    db.prepare("UPDATE chamadas SET dados = ?, status = 'publicada', publicada_em = ? WHERE id = ?").run(
      JSON.stringify(chamada.dados),
      chamada.publicada_em,
      chamada.id,
    );
    responderJson(res, 200, detalhar(chamada));
  });

  // Repasse do FNDE no ano: a base da meta de compra da agricultura familiar.
  roteador.put('/api/prefeitura/repasse', ...soPrefeitura, async (req, res, ctx) => {
    const { ano, valor } = ctx.corpo;
    if (!/^\d{4}$/.test(ano)) throw new ErroHttp(400, 'O ano deve ter 4 números, como 2026.');
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > 1e12) {
      throw new ErroHttp(400, 'O repasse deve ser um valor em reais maior que zero.');
    }
    db.prepare(
      `INSERT INTO repasses (prefeitura_id, ano, valor) VALUES (?, ?, ?)
       ON CONFLICT (prefeitura_id, ano) DO UPDATE SET valor = excluded.valor`,
    ).run(ctx.usuario.id, Number(ano), arredondar(valor));
    responderJson(res, 200, { ano: Number(ano), valor: arredondar(valor) });
  });

  // Compras da agricultura familiar no ano (as entregas das propostas das chamadas desta prefeitura) contra o repasse.
  roteador.get('/api/prefeitura/resumo', ...soPrefeitura, async (req, res, ctx) => {
    const ano = ctx.query.ano ?? config.dataReferencia.slice(0, 4);
    if (!/^\d{4}$/.test(ano)) throw new ErroHttp(400, 'O ano deve ter 4 números, como 2026.');
    const { compras } = db
      .prepare(
        `SELECT COALESCE(SUM(e.valor), 0) AS compras FROM entregas e
         JOIN propostas p ON p.id = e.proposta_id JOIN chamadas c ON c.id = p.chamada_id
         WHERE c.prefeitura_id = ? AND substr(e.data, 1, 4) = ?`,
      )
      .get(ctx.usuario.id, ano);
    const linha = db.prepare('SELECT valor FROM repasses WHERE prefeitura_id = ? AND ano = ?').get(ctx.usuario.id, Number(ano));
    const repasse = linha?.valor ?? null;
    const compras_af_reais = arredondar(compras);
    responderJson(res, 200, {
      ano: Number(ano),
      compras_af_reais,
      repasse,
      percentual: repasse === null ? null : compras_af_reais / repasse,
      minimo: minimoDoAno(ano),
    });
  });
}

module.exports = { registrar };
