// Câmara fria: o dispositivo manda as leituras (POST /api/leituras, com a chave no cabeçalho X-Chave-Dispositivo), e o app
// as grava e abre ou resolve os alertas. A cooperativa vê as leituras e os alertas e registra as entregas à prefeitura.
const { chaveConfere, exigirLogin, exigirPapel } = require('../auth');
const { avaliarLeitura, validarLeitura } = require('../camara-fria');
const { emTransacao } = require('../db');
const { ErroHttp, responderJson } = require('../http-util');
const { arredondar } = require('../regras-pnae');
const { validarData } = require('../validacao');

const TIPOS_DE_ALERTA = ['temperatura', 'porta'];
const emNumero = (valor) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function registrar(roteador, { db, config }) {
  // Desde quando a porta de cada dispositivo está aberta. Um por servidor e só na memória: zera quando o app reinicia.
  const portaAbertaDesde = new Map();
  const soCooperativa = [exigirLogin, exigirPapel('cooperativa')];
  const inserirLeitura = db.prepare(
    'INSERT INTO leituras (dispositivo, momento, temperatura_c, peso_kg, porta_aberta) VALUES (?, ?, ?, ?, ?)',
  );
  const buscarAberto = db.prepare('SELECT id FROM alertas WHERE dispositivo = ? AND tipo = ? AND resolvido = 0');
  const inserirAlerta = db.prepare('INSERT INTO alertas (dispositivo, tipo, mensagem, momento) VALUES (?, ?, ?, ?)');
  const resolver = db.prepare('UPDATE alertas SET resolvido = 1 WHERE id = ?');
  const buscarProposta = db.prepare('SELECT id, itens FROM propostas WHERE id = ? AND cooperativa_id = ?');

  const exigirChaveDispositivo = async (req, res) => {
    if (!chaveConfere(req.headers['x-chave-dispositivo'], config.chaveDispositivo)) {
      responderJson(res, 401, { erro: 'Chave do dispositivo inválida.' });
    }
  };

  // Um alerta aberto por tipo e dispositivo: leitura fora da faixa com um já aberto não grava outro, e a primeira leitura
  // de volta à faixa daquele tipo o resolve. Responde 201 com os alertas que a leitura pede (vazio quando está tudo bem).
  roteador.post('/api/leituras', exigirChaveDispositivo, async (req, res, ctx) => {
    const { ok, erros } = validarLeitura(ctx.corpo);
    if (!ok) throw new ErroHttp(400, erros.join(' '));
    const { dispositivo, temperatura_c, peso_kg, porta_aberta } = ctx.corpo;
    // gravado em UTC, venha com o fuso que vier
    const momento = new Date(ctx.corpo.momento ?? Date.now()).toISOString();
    const { alertas, portaAbertaDesde: desde } = avaliarLeitura(
      { dispositivo, temperatura_c, peso_kg, porta_aberta, momento },
      portaAbertaDesde.get(dispositivo) ?? null,
      config,
    );
    emTransacao(db, () => {
      inserirLeitura.run(dispositivo, momento, temperatura_c, peso_kg, porta_aberta ? 1 : 0);
      for (const tipo of TIPOS_DE_ALERTA) {
        const alerta = alertas.find((a) => a.tipo === tipo);
        const aberto = buscarAberto.get(dispositivo, tipo);
        if (alerta && !aberto) inserirAlerta.run(dispositivo, tipo, alerta.mensagem, momento);
        // porta ainda aberta não resolve: depois de um reinício a conta recomeça do zero, mas o alerta aberto continua valendo
        if (!alerta && aberto && !(tipo === 'porta' && porta_aberta)) resolver.run(aberto.id);
      }
    });
    portaAbertaDesde.set(dispositivo, desde);
    responderJson(res, 201, { alertas });
  });

  // shortcut: toda câmara é da cooperativa (um dispositivo e uma chave no .env); com mais de uma cooperativa usando, ligar
  // cada dispositivo à sua e filtrar aqui.
  roteador.get('/api/cooperativa/camara-fria', ...soCooperativa, async (req, res) => {
    const leituras = db
      .prepare('SELECT id, dispositivo, momento, temperatura_c, peso_kg, porta_aberta FROM leituras ORDER BY id DESC LIMIT 10')
      .all()
      .map((leitura) => ({ ...leitura, porta_aberta: Boolean(leitura.porta_aberta) }));
    const alertas = db.prepare('SELECT id, dispositivo, tipo, mensagem, momento FROM alertas WHERE resolvido = 0 ORDER BY id').all();
    responderJson(res, 200, { leituras, alertas, limite_temp_c: config.limiteTempC, minutos_porta_aberta: config.minutosPortaAberta });
  });

  // { proposta_id, item, quantidade, data, no_prazo }. `item` é a posição do item na proposta (0 = o primeiro): o mesmo
  // produto pode vir em dois itens de preços diferentes (as abóboras de Catalão). valor = quantidade × preço do item.
  roteador.post('/api/cooperativa/entregas', ...soCooperativa, async (req, res, ctx) => {
    const { proposta_id, item, quantidade, data, no_prazo } = ctx.corpo;
    // o node:sqlite não aceita booleano nem objeto como parâmetro: o tipo é conferido antes da busca
    const proposta = Number.isInteger(proposta_id) && buscarProposta.get(proposta_id, ctx.usuario.id);
    if (!proposta) throw new ErroHttp(400, 'Escolha uma proposta da sua cooperativa.');
    const escolhido = Number.isInteger(item) ? JSON.parse(proposta.itens)[item] : undefined;
    if (!escolhido) throw new ErroHttp(400, 'Escolha um alimento da proposta.');
    const entregue = typeof quantidade === 'number' ? arredondar(quantidade) : NaN;
    if (!(entregue > 0)) throw new ErroHttp(400, 'A quantidade entregue deve ser um número maior que zero.');
    if (entregue > escolhido.quantidade) {
      const [entrega, oferta] = [entregue, escolhido.quantidade].map(emNumero);
      const mensagem = `${escolhido.produto}: a entrega (${entrega} ${escolhido.unidade}) passa do que a proposta oferece (${oferta}).`;
      throw new ErroHttp(400, mensagem);
    }
    if (!validarData(data)) throw new ErroHttp(400, 'A data da entrega deve ser um dia que existe, no formato 2026-08-05.');
    if (typeof no_prazo !== 'boolean') throw new ErroHttp(400, 'Diga se a entrega foi no prazo (true ou false).');

    const valor = arredondar(entregue * escolhido.preco_unitario);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO entregas (proposta_id, produto_id, item, quantidade, valor, data, no_prazo) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(proposta.id, escolhido.produto_id, item, entregue, valor, data, no_prazo ? 1 : 0);
    responderJson(res, 201, {
      id: Number(lastInsertRowid),
      proposta_id: proposta.id,
      produto_id: escolhido.produto_id,
      quantidade: entregue,
      valor,
      data,
      no_prazo,
    });
  });
}

module.exports = { registrar };
