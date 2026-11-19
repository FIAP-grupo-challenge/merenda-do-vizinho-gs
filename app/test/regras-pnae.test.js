const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
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
  arredondar,
} = require('../src/regras-pnae');

test('minimoDoAno: 30% até 2025 e 45% a partir de 2026', () => {
  assert.equal(minimoDoAno(2025), 0.3);
  assert.equal(minimoDoAno(2026), 0.45);
  assert.equal(minimoDoAno('2026'), 0.45); // o ano de uma consulta ?ano=2026
});

test('minimoDoAno sem ano, ou com um que não é ano, falha em vez de valer 30% em silêncio', () => {
  for (const ruim of [undefined, null, NaN, Infinity, '', 'abc']) {
    assert.throws(() => minimoDoAno(ruim), /minimoDoAno: o ano deve ter 4 dígitos/, String(ruim));
  }
});

test('constantes de compartilhado/regras-pnae.json, limite restante, capacidade no período e centavos', () => {
  assert.deepEqual([LIMITE_ANUAL_AGRICULTOR_REAIS, SEMANAS_PADRAO, DIAS_MINIMOS_CHAMADA], [40000, 40, 20]);
  assert.equal(limiteRestanteReais(38000), 2000);
  assert.equal(limiteRestanteReais(38000.1), 1999.9); // 40000 - 38000.1 dá 1999.9000000000015 sem arredondar
  assert.equal(limiteRestanteReais(45000), 0);
  assert.equal(capacidadeNoPeriodo(30, 36), 1080);
  assert.equal(capacidadeNoPeriodo(30, null), 1200); // a chamada não diz as semanas: vale SEMANAS_PADRAO
  assert.equal(arredondar(1.005), 1.01); // 1.005 * 100 dá 100.49999999999999 em JavaScript
  assert.equal(arredondar(0.1 + 0.2), 0.3);
});

test('limiteRestanteReais sem o vendido no ano falha em vez de devolver NaN', () => {
  for (const ruim of [undefined, NaN, 'abc']) {
    assert.throws(() => limiteRestanteReais(ruim), /vendido_no_ano_reais deve ser um número/, String(ruim));
  }
});

test('SEMANAS_PADRAO vem do JSON e a variável de ambiente troca', () => {
  const semanas = (env) =>
    execFileSync(process.execPath, ['-p', 'require("./src/regras-pnae").SEMANAS_PADRAO'], {
      cwd: path.join(__dirname, '..'),
      env,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  assert.equal(semanas({}), '40');
  assert.equal(semanas({ SEMANAS_PADRAO: '' }), '40'); // vazia vale como ausente, como no config.js
  assert.equal(semanas({ SEMANAS_PADRAO: '36' }), '36');
  assert.throws(() => semanas({ SEMANAS_PADRAO: 'quarenta' }), /SEMANAS_PADRAO deve ser/);
  assert.throws(() => semanas({ SEMANAS_PADRAO: '0' }), /SEMANAS_PADRAO deve ser/);
});

test('prazo mínimo de 20 dias', () => {
  assert.equal(prazoMinimoOk({ data_publicacao: '2026-03-01', prazo_envio: '2026-03-15' }), false);
  assert.equal(prazoMinimoOk({ data_publicacao: '2026-03-01', prazo_envio: '2026-03-20' }), false); // 19 dias
  assert.equal(prazoMinimoOk({ data_publicacao: '2026-03-01', prazo_envio: '2026-03-21' }), true);
  assert.equal(prazoMinimoOk({ data_publicacao: '2026-02-20', prazo_envio: '2026-03-12' }), true); // fevereiro de 28 dias
  assert.equal(prazoMinimoOk({ data_publicacao: null, prazo_envio: '2026-03-15' }), true);
  assert.equal(prazoMinimoOk({ data_publicacao: '2026-03-01', prazo_envio: null }), true);
});

test('lerGruposPrioritarios aceita o texto JSON do SQLite ou uma lista e ignora o que não conhece', () => {
  assert.deepEqual(lerGruposPrioritarios('["assentado"]'), ['assentado']);
  assert.deepEqual(lerGruposPrioritarios(['indigena', 'cigano']), ['indigena']);
  assert.deepEqual(lerGruposPrioritarios('["quilombola", "quilombola"]'), ['quilombola']);
  assert.deepEqual(lerGruposPrioritarios('[]'), []);
  assert.deepEqual(lerGruposPrioritarios(null), []);
});

test('pontos RITS e prioridade', () => {
  const nenhum = { mulher_titular: 0, jovem: 0, organico: 0, grupo_prioritario: '[]' };
  const mulherJovemOrganica = { ...nenhum, mulher_titular: 1, jovem: 1, organico: 1 };
  assert.equal(pontosRits(mulherJovemOrganica), 2);
  assert.equal(prioridadeDoAgricultor(mulherJovemOrganica), 6);
  assert.equal(pontosRits(nenhum), 0);
  assert.equal(prioridadeDoAgricultor(nenhum), 11);
  // um ponto por grupo prioritário
  for (const grupo of ['assentado', 'indigena', 'quilombola']) {
    assert.equal(pontosRits({ ...nenhum, grupo_prioritario: JSON.stringify([grupo]) }), 1, grupo);
  }
  const todos = { mulher_titular: 1, jovem: 1, organico: 0, grupo_prioritario: '["assentado", "indigena", "quilombola"]' };
  assert.equal(pontosRits(todos), 5);
  assert.equal(prioridadeDoAgricultor(todos), 1);
});

test('versaoRegra pela data do edital', () => {
  assert.equal(versaoRegra({ data_publicacao: '2026-10-22' }), 'res4-original');
  assert.equal(versaoRegra({ data_publicacao: '2026-10-23' }), 'res17');
  assert.equal(versaoRegra({ data_publicacao: null }), 'res17');
});
