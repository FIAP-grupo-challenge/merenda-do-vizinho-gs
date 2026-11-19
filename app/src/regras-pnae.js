// Regras do PNAE, cada uma num lugar só e com a fonte. Os números ficam em compartilhado/regras-pnae.json,
// o mesmo arquivo que a IA lê. Fontes conferidas em planejamento/pesquisa/fatos-pnae.md.
const REGRAS = require('../../compartilhado/regras-pnae.json');

// Mínimo da verba federal do PNAE comprado da agricultura familiar: 45% desde 01/01/2026 e 30% até 2025
// (Lei 11.947/2009, art. 14, redação da Lei 15.226/2025). O ano vem como número ou como texto de 4 dígitos
// (uma consulta ?ano=2026); sem ano, falha em vez de valer 30% em silêncio.
function minimoDoAno(ano) {
  if (!/^\d{4}$/.test(ano)) throw new Error('minimoDoAno: o ano deve ter 4 dígitos, como 2026');
  return ano >= 2026 ? 0.45 : 0.3;
}

// R$ 40.000 por agricultor (CAF PF), por ano civil, por entidade executora (Res. CD/FNDE 4/2026, art. 38, redação da Res. 17/2026).
const LIMITE_ANUAL_AGRICULTOR_REAIS = REGRAS.limite_anual_agricultor_reais;

// Semanas de fornecimento quando a chamada não diz: 200 dias letivos (LDB, art. 24, I) ÷ 5 dias = 40.
// A variável de ambiente SEMANAS_PADRAO troca; vazia vale como ausente, como no config.js.
const SEMANAS_PADRAO = lerSemanasPadrao(process.env.SEMANAS_PADRAO);

function lerSemanasPadrao(texto) {
  if (!texto) return REGRAS.semanas_padrao;
  const semanas = Number(texto);
  if (!Number.isFinite(semanas) || semanas <= 0) throw new Error('SEMANAS_PADRAO deve ser um número maior que zero');
  return semanas;
}

// O edital recebe projetos por pelo menos 20 dias corridos, contados da publicação (Res. CD/FNDE 4/2026, art. 32,
// parágrafo único). Conta como o modelo de edital (item 11.6): exclui o dia do início e inclui o do vencimento.
const DIAS_MINIMOS_CHAMADA = REGRAS.dias_minimos_chamada;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

function prazoMinimoOk(chamada) {
  if (!chamada.data_publicacao || !chamada.prazo_envio) return true;
  // datas AAAA-MM-DD são lidas em UTC: a diferença dá dias inteiros, sem horário de verão
  return (Date.parse(chamada.prazo_envio) - Date.parse(chamada.data_publicacao)) / UM_DIA_MS >= DIAS_MINIMOS_CHAMADA;
}

// RITS, o Ranking de Impacto Territorial e Social (Res. CD/FNDE 4/2026, art. 36, §§ 5º a 9º, redação da Res. 17/2026):
// 1 ponto por critério, até 5. Mulher e jovem de 15 a 29 anos vêm dos próprios campos; os grupos vêm de
// grupo_prioritario, um array JSON com zero ou mais destes:
const GRUPOS_PRIORITARIOS = ['assentado', 'indigena', 'quilombola'];

// Aceita o texto JSON do SQLite ou uma lista; o que não for um dos três grupos é ignorado, e cada um conta uma vez.
function lerGruposPrioritarios(valor) {
  const lista = typeof valor === 'string' ? JSON.parse(valor) : valor;
  return Array.isArray(lista) ? GRUPOS_PRIORITARIOS.filter((grupo) => lista.includes(grupo)) : [];
}

function pontosRits(agricultor) {
  return (agricultor.mulher_titular ? 1 : 0) + (agricultor.jovem ? 1 : 0) + lerGruposPrioritarios(agricultor.grupo_prioritario).length;
}

// Menor é mais prioritário: primeiro os pontos do RITS e, no empate, a produção orgânica ou agroecológica (art. 36, § 10).
function prioridadeDoAgricultor(agricultor) {
  return (5 - pontosRits(agricultor)) * 2 + (agricultor.organico ? 0 : 1);
}

// Edital publicado até 22/10/2026 segue a regra da data dele, a seleção da Res. 4 original, sem RITS
// (Res. CD/FNDE 17/2026, art. 3º; DOU de 23/10/2026). O app usa a regra nova e avisa.
function versaoRegra(chamada) {
  return chamada.data_publicacao && chamada.data_publicacao <= '2026-10-22' ? 'res4-original' : 'res17';
}

function limiteRestanteReais(vendidoNoAnoReais) {
  const restante = LIMITE_ANUAL_AGRICULTOR_REAIS - vendidoNoAnoReais;
  // sem o vendido_no_ano_reais a conta daria NaN, e o ganho_total e a ordem das oportunidades se perderiam em silêncio
  if (!Number.isFinite(restante)) throw new Error('vendido_no_ano_reais deve ser um número');
  return arredondar(Math.max(0, restante));
}

// Quanto o agricultor entrega no período: quantidade por semana × semanas da chamada (ou SEMANAS_PADRAO).
function capacidadeNoPeriodo(quantidadeSemana, semanas) {
  return arredondar(quantidadeSemana * (semanas ?? SEMANAS_PADRAO));
}

// Itens contados em unidade inteira: pé de alface, maço, dúzia, bandeja e caixa não se dividem, então a divisão da proposta
// e a edição dela só trabalham com números inteiros. kg, g, l, litro, ml (e o que não está na lista) seguem com centésimos.
// Compara sem maiúsculas, sem acento e sem o ponto final ("Un."), como a IA lê as unidades do edital.
const UNIDADES_INTEIRAS = new Set(
  [
    'pç', 'pc', 'peça', 'unidade', 'un', 'unid', 'maço', 'molho', 'fx', 'feixe', 'atilho',
    'dz', 'dúzia', 'duzia', 'bandeja', 'cx', 'caixa', 'pct', 'pacote',
    'und', 'mlh', 'pact', 'pcte', // abreviações que aparecem nas chamadas reais da avaliação
  ].map(normalizarUnidade),
);

function normalizarUnidade(unidade) {
  return String(unidade).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim().replace(/\.$/, '');
}

function unidadeInteira(unidade) {
  return UNIDADES_INTEIRAS.has(normalizarUnidade(unidade));
}

// Dinheiro e quantidades têm 2 casas. O toPrecision(15) tira o ruído do ponto flutuante antes de arredondar:
// em JavaScript, 1.005 * 100 dá 100.49999999999999.
function centesimos(valor) {
  return Number((valor * 100).toPrecision(15));
}

function arredondar(valor) {
  return Math.round(centesimos(valor)) / 100;
}

module.exports = {
  minimoDoAno,
  LIMITE_ANUAL_AGRICULTOR_REAIS,
  SEMANAS_PADRAO,
  DIAS_MINIMOS_CHAMADA,
  prazoMinimoOk,
  lerGruposPrioritarios,
  pontosRits,
  prioridadeDoAgricultor,
  versaoRegra,
  limiteRestanteReais,
  capacidadeNoPeriodo,
  unidadeInteira,
  centesimos,
  arredondar,
};
