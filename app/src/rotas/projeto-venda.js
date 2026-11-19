// Projeto de venda nos campos do modelo do FNDE: o da cooperativa (grupo formal, a partir da proposta conjunta) e o
// individual do agricultor (a partir do que ele marcou em interesses). CPF e CAF saem com máscara, como em toda tela.
const { exigirLogin, exigirPapel } = require('../auth');
const { montarPropostaConjunta } = require('../agrupamento');
const { ErroHttp, responderJson } = require('../http-util');
const { montarProjetoVenda } = require('../projeto-venda');
const { participante } = require('../proposta');
const { mascararCaf, mascararCpf } = require('../validacao');

function registrar(roteador, { db }) {
  const buscarAgricultor = db.prepare(
    'SELECT a.*, u.nome FROM agricultores a JOIN usuarios u ON u.id = a.usuario_id WHERE a.usuario_id = ?',
  );
  // o agricultor como montarProjetoVenda o quer
  const fornecedor = (a) => ({
    id: a.usuario_id,
    nome: a.nome,
    cpf: mascararCpf(a.cpf),
    caf: mascararCaf(a.caf),
    municipio: a.municipio,
    uf: a.uf,
    mulher_titular: a.mulher_titular,
  });

  roteador.get('/api/cooperativa/propostas/:id/projeto-venda', exigirLogin, exigirPapel('cooperativa'), async (req, res, ctx) => {
    const proposta = db.prepare('SELECT * FROM propostas WHERE id = ? AND cooperativa_id = ?').get(ctx.params.id, ctx.usuario.id);
    if (!proposta) throw new ErroHttp(404, 'Proposta não encontrada.');
    const { nome, cnpj, municipio, uf } = db.prepare('SELECT * FROM cooperativas WHERE usuario_id = ?').get(ctx.usuario.id);
    const chamada = JSON.parse(db.prepare('SELECT dados FROM chamadas WHERE id = ?').get(proposta.chamada_id).dados);
    const itens = JSON.parse(proposta.itens);
    // quem está na divisão, em ordem alfabética (mesmo quem saiu da cooperativa depois: a proposta é o retrato)
    const ids = new Set(itens.flatMap((item) => item.alocacoes.map((a) => a.agricultor_id)));
    const agricultores = [...ids].map((id) => fornecedor(buscarAgricultor.get(id))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const proponente = { tipo: 'grupo-formal', nome, cnpj, municipio, uf };
    responderJson(res, 200, montarProjetoVenda({ chamada, proponente, itens, agricultores }));
  });

  // A proposta individual: os itens que o agricultor marcou, cortados pelo que ele produz e pelo limite do ano.
  roteador.get('/api/agricultor/chamadas/:id/projeto-venda', exigirLogin, exigirPapel('agricultor'), async (req, res, ctx) => {
    const linha = db.prepare("SELECT id, dados FROM chamadas WHERE id = ? AND status = 'publicada'").get(ctx.params.id);
    if (!linha) throw new ErroHttp(404, 'Chamada não encontrada.');
    const chamada = { id: linha.id, dados: JSON.parse(linha.dados) };
    const eu = buscarAgricultor.get(ctx.usuario.id);
    const sozinho = participante(db, eu, chamada);
    if (Object.keys(sozinho.capacidades).length === 0) throw new ErroHttp(400, 'Marque primeiro, na chamada, o que você quer vender.');
    const { itens } = montarPropostaConjunta(chamada.dados, [sozinho]);
    const dados = fornecedor(eu);
    const proponente = { tipo: 'individual', nome: eu.nome, cpf: dados.cpf, caf: dados.caf, municipio: eu.municipio, uf: eu.uf };
    responderJson(res, 200, montarProjetoVenda({ chamada: chamada.dados, proponente, itens, agricultores: [dados] }));
  });
}

module.exports = { registrar };
