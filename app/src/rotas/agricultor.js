// Rotas do agricultor (só o papel agricultor): Meu sítio (o perfil), as cooperativas do formulário, as oportunidades,
// a chamada, o assistente da IA e o interesse numa chamada.
const { exigirLogin, exigirPapel } = require('../auth');
const { produtoExiste } = require('../catalogo');
const { oportunidades } = require('../casamento');
const { emTransacao } = require('../db');
const { ErroHttp, responderJson } = require('../http-util');
const { perfilParaIa, produtosEmLista } = require('../perfil-ia');
const { arredondar, lerGruposPrioritarios, limiteRestanteReais } = require('../regras-pnae');
const { mascararCaf, mascararCpf, validarCaf, validarCpf, validarUf } = require('../validacao');

// Dado pessoal escrito no chat não sai do app: CPF (11 dígitos, com ou sem pontos e traço, o mesmo teste da IA) e e-mail.
const CPF_NO_TEXTO = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/;
const EMAIL_NO_TEXTO = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const numeroValido = (valor) => typeof valor === 'number' && Number.isFinite(valor);
const ehMes = (mes) => Number.isInteger(mes) && mes >= 1 && mes <= 12;
const umOuZero = (valor) => (valor ? 1 : 0); // o node:sqlite não grava true/false

// Confere o PUT, que é o formulário Meu sítio inteiro, e devolve as colunas a gravar. CPF e CAF só trocam quando vêm.
function lerFormulario(corpo, cooperativaExiste) {
  const municipio = typeof corpo.municipio === 'string' ? corpo.municipio.trim() : '';
  if (!municipio || municipio.length > 100) throw new ErroHttp(400, 'Escreva o município.');
  if (!validarUf(corpo.uf)) throw new ErroHttp(400, 'Escolha a UF.');
  if (corpo.cpf !== undefined && !validarCpf(corpo.cpf)) throw new ErroHttp(400, 'Confira o CPF: os números não conferem.');
  if (corpo.caf !== undefined && !validarCaf(corpo.caf)) throw new ErroHttp(400, 'Confira o número do CAF, como está no extrato.');
  const cooperativa_id = corpo.cooperativa_id ?? null;
  if (cooperativa_id !== null && !(Number.isInteger(cooperativa_id) && cooperativaExiste(cooperativa_id))) {
    throw new ErroHttp(400, 'Escolha uma cooperativa da lista, ou nenhuma.');
  }
  if (!(numeroValido(corpo.vendido_no_ano_reais) && corpo.vendido_no_ano_reais >= 0)) {
    throw new ErroHttp(400, 'Escreva quanto você já vendeu para a merenda neste ano, em reais (0 se ainda não vendeu).');
  }
  const grupos = corpo.grupo_prioritario ?? [];
  if (!Array.isArray(grupos)) throw new ErroHttp(400, 'grupo_prioritario deve ser uma lista.');
  if (!Array.isArray(corpo.produtos)) throw new ErroHttp(400, 'Mande a lista de produtos do sítio.');
  const vistos = new Set();
  const produtos = corpo.produtos.map((produto) => {
    const { produto_id, quantidade_semana, meses_safra } = produto ?? {};
    if (!produtoExiste(produto_id)) throw new ErroHttp(400, 'Escolha cada produto da lista.');
    if (vistos.has(produto_id)) throw new ErroHttp(400, `${produto_id}: o produto aparece duas vezes.`);
    vistos.add(produto_id);
    if (!(numeroValido(quantidade_semana) && quantidade_semana > 0)) throw new ErroHttp(400, `${produto_id}: escreva quanto você colhe por semana.`);
    if (!(Array.isArray(meses_safra) && meses_safra.length && meses_safra.every(ehMes))) {
      throw new ErroHttp(400, `${produto_id}: marque os meses de colheita.`);
    }
    return { produto_id, quantidade_semana, meses_safra: JSON.stringify([...new Set(meses_safra)].sort((a, b) => a - b)) };
  });
  return {
    produtos,
    colunas: {
      municipio,
      uf: corpo.uf,
      cpf: corpo.cpf === undefined ? null : corpo.cpf.replace(/\D/g, ''), // só os números; null mantém o de antes
      caf: corpo.caf ?? null,
      grupo_prioritario: JSON.stringify(lerGruposPrioritarios(grupos)),
      organico: umOuZero(corpo.organico),
      mulher_titular: umOuZero(corpo.mulher_titular),
      jovem: umOuZero(corpo.jovem),
      ja_vendeu_pnae: umOuZero(corpo.ja_vendeu_pnae),
      cooperativa_id,
      vendido_no_ano_reais: arredondar(corpo.vendido_no_ano_reais),
    },
  };
}

// Da conversa, só papel e texto vão para a IA, e a última fala é do agricultor (a IA responde a ele).
// CPF, e-mail ou o CAF dele escritos no chat são barrados aqui, antes de sair do app.
function lerMensagens(mensagens, caf) {
  const formatoOk =
    Array.isArray(mensagens) &&
    mensagens.every((m) => ['agricultor', 'assistente'].includes(m?.papel) && typeof m.texto === 'string' && m.texto.trim()) &&
    (mensagens.length === 0 || mensagens.at(-1).papel === 'agricultor');
  if (!formatoOk) throw new ErroHttp(400, 'Escreva a sua pergunta para o assistente.');
  const pessoal = (texto) => CPF_NO_TEXTO.test(texto) || EMAIL_NO_TEXTO.test(texto) || Boolean(caf && texto.toLowerCase().includes(caf.toLowerCase()));
  if (mensagens.some((m) => pessoal(m.texto))) {
    throw new ErroHttp(400, 'Para a sua segurança, não escreva CPF, CAF nem e-mail no chat. O assistente não precisa deles.');
  }
  return mensagens.map(({ papel, texto }) => ({ papel, texto }));
}

// Quando a IA barra dado pessoal no texto do chat, ela responde 400 com `campos` (ia/privacidade.py). A tela mostra qual
// dado tirar, em português; o texto fica no campo e não é enviado de novo. Outro erro da IA passa como veio.
const DADO_BARRADO = { cpf: 'o CPF', email: 'o e-mail', telefone: 'o telefone', banco: 'os dados do banco' };
function dadoBarradoPelaIa(erro) {
  if (!(erro instanceof ErroHttp && erro.status === 400 && Array.isArray(erro.campos) && erro.campos.length)) return erro;
  const nomes = [...new Set(erro.campos.map((campo) => DADO_BARRADO[campo] ?? 'os dados pessoais'))];
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0];
  return new ErroHttp(400, `Tire ${lista} do texto e envie de novo.`);
}

// { itens: [{ produto_id, quantidade }] }: só produto da chamada que ele planta, cada um uma vez, com quantidade > 0.
function lerInteresse(itens, naChamada, meus) {
  if (!Array.isArray(itens) || itens.length === 0) throw new ErroHttp(400, 'Escreva quanto você quer vender de pelo menos um produto.');
  const vistos = new Set();
  return itens.map((item) => {
    const { produto_id, quantidade } = item ?? {};
    if (!naChamada.includes(produto_id) || !meus.includes(produto_id)) {
      throw new ErroHttp(400, 'Só dá para oferecer produto desta chamada que está no seu sítio.');
    }
    if (vistos.has(produto_id)) throw new ErroHttp(400, 'Cada produto entra uma vez só.');
    vistos.add(produto_id);
    if (!(numeroValido(quantidade) && quantidade > 0)) throw new ErroHttp(400, 'A quantidade precisa ser maior que zero.');
    return { produto_id, quantidade };
  });
}

function registrar(roteador, { db, config, ia }) {
  const soAgricultor = [exigirLogin, exigirPapel('agricultor')];

  function lerAgricultor(id) {
    const agricultor = db.prepare('SELECT * FROM agricultores WHERE usuario_id = ?').get(id);
    if (!agricultor) throw new ErroHttp(401, 'Entre na sua conta para continuar.'); // a conta sumiu: o token é velho
    return agricultor;
  }
  const lerProdutos = (id) =>
    db.prepare('SELECT produto_id, quantidade_semana, meses_safra FROM produtos_agricultor WHERE agricultor_id = ? ORDER BY id').all(id);

  function lerChamadaPublicada(id) {
    const linha = db.prepare("SELECT id, dados FROM chamadas WHERE id = ? AND status = 'publicada'").get(id);
    if (!linha) throw new ErroHttp(404, 'Chamada não encontrada ou ainda não publicada.');
    return { id: linha.id, dados: JSON.parse(linha.dados) };
  }

  // O perfil para a tela, com CPF e CAF mascarados.
  function perfilDaTela(id) {
    const agricultor = lerAgricultor(id);
    return {
      municipio: agricultor.municipio,
      uf: agricultor.uf,
      cpf: mascararCpf(agricultor.cpf),
      caf: mascararCaf(agricultor.caf),
      grupo_prioritario: lerGruposPrioritarios(agricultor.grupo_prioritario),
      organico: Boolean(agricultor.organico),
      mulher_titular: Boolean(agricultor.mulher_titular),
      jovem: Boolean(agricultor.jovem),
      ja_vendeu_pnae: Boolean(agricultor.ja_vendeu_pnae),
      cooperativa_id: agricultor.cooperativa_id,
      vendido_no_ano_reais: agricultor.vendido_no_ano_reais,
      aceite_termo_em: agricultor.aceite_termo_em,
      produtos: produtosEmLista(lerProdutos(id)),
    };
  }

  roteador.get('/api/agricultor/perfil', ...soAgricultor, async (req, res, ctx) => responderJson(res, 200, perfilDaTela(ctx.usuario.id)));

  roteador.put('/api/agricultor/perfil', ...soAgricultor, async (req, res, ctx) => {
    const { id } = ctx.usuario;
    const existe = (cooperativa) => Boolean(db.prepare('SELECT 1 FROM cooperativas WHERE usuario_id = ?').get(cooperativa));
    const { colunas, produtos } = lerFormulario(ctx.corpo, existe);
    // o termo é aceito uma vez, no primeiro salvamento, e o momento do aceite fica guardado
    if (!lerAgricultor(id).aceite_termo_em && ctx.corpo.aceite_termo !== true) {
      throw new ErroHttp(400, 'Para salvar, leia e aceite o termo de uso dos dados.');
    }
    emTransacao(db, () => {
      db.prepare(
        `UPDATE agricultores SET municipio = :municipio, uf = :uf, cpf = COALESCE(:cpf, cpf), caf = COALESCE(:caf, caf),
           grupo_prioritario = :grupo_prioritario, organico = :organico, mulher_titular = :mulher_titular, jovem = :jovem,
           ja_vendeu_pnae = :ja_vendeu_pnae, cooperativa_id = :cooperativa_id, vendido_no_ano_reais = :vendido_no_ano_reais,
           aceite_termo_em = COALESCE(aceite_termo_em, :agora)
         WHERE usuario_id = :id`,
      ).run({ ...colunas, agora: new Date().toISOString(), id });
      db.prepare('DELETE FROM produtos_agricultor WHERE agricultor_id = ?').run(id);
      const inserir = db.prepare('INSERT INTO produtos_agricultor (agricultor_id, produto_id, quantidade_semana, meses_safra) VALUES (?, ?, ?, ?)');
      for (const produto of produtos) inserir.run(id, produto.produto_id, produto.quantidade_semana, produto.meses_safra);
    });
    responderJson(res, 200, perfilDaTela(id));
  });

  roteador.get('/api/agricultor/cooperativas', ...soAgricultor, async (req, res) => {
    responderJson(res, 200, db.prepare('SELECT usuario_id AS id, nome, municipio, uf FROM cooperativas ORDER BY nome').all());
  });

  // As chamadas publicadas em que ele pode vender, com o "hoje" da configuração (a demonstração usa 2026-07-15).
  roteador.get('/api/agricultor/oportunidades', ...soAgricultor, async (req, res, ctx) => {
    const agricultor = lerAgricultor(ctx.usuario.id);
    const chamadas = db
      .prepare("SELECT id, status, dados FROM chamadas WHERE status = 'publicada' ORDER BY id")
      .all()
      .map((linha) => ({ ...linha, dados: JSON.parse(linha.dados) }));
    responderJson(
      res,
      200,
      oportunidades({
        agricultor,
        produtos: lerProdutos(agricultor.usuario_id),
        chamadas,
        hoje: config.dataReferencia,
        limiteRestanteReais: limiteRestanteReais(agricultor.vendido_no_ano_reais),
      }),
    );
  });

  // A chamada para a tela (o edital é público): resumo, itens e documentos.
  roteador.get('/api/agricultor/chamadas/:id', ...soAgricultor, async (req, res, ctx) => {
    const { id, dados } = lerChamadaPublicada(ctx.params.id);
    responderJson(res, 200, { ...dados, id });
  });

  // { mensagens } da tela; para a IA vão a chamada, o perfil sem dado pessoal e as mensagens. A resposta volta como veio.
  roteador.post('/api/agricultor/chamadas/:id/assistente', ...soAgricultor, async (req, res, ctx) => {
    const { dados } = lerChamadaPublicada(ctx.params.id);
    const agricultor = lerAgricultor(ctx.usuario.id);
    const mensagens = lerMensagens(ctx.corpo.mensagens, agricultor.caf);
    const { contato, ...chamada } = dados; // o contato da prefeitura fica no app: a IA não precisa dele
    const perfil = perfilParaIa(agricultor, lerProdutos(agricultor.usuario_id));
    let resposta;
    try {
      resposta = await ia.assistente({ chamada, perfil, mensagens });
    } catch (erro) {
      throw dadoBarradoPelaIa(erro);
    }
    responderJson(res, 200, resposta);
  });

  // O interesse dele nesta chamada, que troca o anterior. A cooperativa junta os interesses na proposta (T9),
  // e a proposta individual também sai daqui.
  roteador.post('/api/agricultor/chamadas/:id/interesse', ...soAgricultor, async (req, res, ctx) => {
    const { id: chamada, dados } = lerChamadaPublicada(ctx.params.id);
    const { id } = ctx.usuario;
    const itens = lerInteresse(
      ctx.corpo.itens,
      dados.itens.map((item) => item.produto_id),
      lerProdutos(id).map((produto) => produto.produto_id),
    );
    emTransacao(db, () => {
      db.prepare('DELETE FROM interesses WHERE agricultor_id = ? AND chamada_id = ?').run(id, chamada);
      const inserir = db.prepare('INSERT INTO interesses (agricultor_id, chamada_id, produto_id, quantidade) VALUES (?, ?, ?, ?)');
      for (const { produto_id, quantidade } of itens) inserir.run(id, chamada, produto_id, quantidade);
    });
    responderJson(res, 200, { itens });
  });
}

module.exports = { registrar };
