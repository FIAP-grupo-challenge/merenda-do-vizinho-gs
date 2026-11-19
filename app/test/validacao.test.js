const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validarCpf, validarCaf, validarEmail, mascararCpf, mascararCaf } = require('../src/validacao');
const { lerConfig } = require('../src/config');
const { ENV_TESTE } = require('./env-teste');

test('validarCpf', () => {
  assert.ok(validarCpf('529.982.247-25'));
  assert.ok(validarCpf('52998224725'));
  assert.ok(!validarCpf('111.111.111-11'));
  assert.ok(!validarCpf('123'));
  assert.ok(!validarCpf('529.982.247-26'));
  assert.ok(!validarCpf('529a982b247c25'));
  assert.ok(!validarCpf(null));
});

test('validarCaf, validarEmail e as máscaras', () => {
  assert.ok(validarCaf('GO052025.01.000012345CAF'));
  assert.ok(validarCaf('12/34-5'));
  assert.ok(!validarCaf('ABCD'));
  assert.ok(!validarCaf('x'.repeat(31)));
  assert.ok(!validarCaf('GO05 2025'));
  assert.ok(!validarCaf(12345));

  assert.ok(validarEmail('ana@demo.br'));
  assert.ok(!validarEmail('ana@demo'));
  assert.ok(!validarEmail('ana demo@demo.br'));
  assert.ok(!validarEmail(undefined));

  assert.equal(mascararCpf('123.456.789-09'), '***.456.789-**');
  assert.equal(mascararCpf('12345678909'), '***.456.789-**');
  assert.equal(mascararCaf('GO052025.01.000012345CAF'), '****5CAF');
  assert.equal(mascararCpf(null), null);
  assert.equal(mascararCaf(''), null);
});

test('config sem JWT_SEGREDO lança erro', () => {
  assert.throws(() => lerConfig({ ...ENV_TESTE, JWT_SEGREDO: undefined }), /JWT_SEGREDO/);
  assert.throws(() => lerConfig({ ...ENV_TESTE, JWT_SEGREDO: '' }), /JWT_SEGREDO/); // chave vazia nunca vale
  assert.throws(() => lerConfig({ ...ENV_TESTE, CHAVE_SERVICO: '' }), /CHAVE_SERVICO/);
  assert.throws(() => lerConfig({ ...ENV_TESTE, CHAVE_DISPOSITIVO: undefined }), /CHAVE_DISPOSITIVO/);
  assert.throws(() => lerConfig({ ...ENV_TESTE, LIMITE_TEMP_C: 'dez' }), /LIMITE_TEMP_C/);
});

// O app não sobe com o texto de exemplo do .env.example nem com segredo curto, e a mensagem diz qual variável trocar.
test('config recusa o texto de exemplo e o segredo com menos de 16 caracteres, e não imprime o valor', () => {
  const exemplo = fs.readFileSync(path.join(__dirname, '..', '..', '.env.example'), 'utf8');
  for (const nome of ['JWT_SEGREDO', 'CHAVE_SERVICO', 'CHAVE_DISPOSITIVO']) {
    const doModelo = exemplo.match(new RegExp(`^${nome}=(.*)$`, 'm'))[1];
    assert.throws(() => lerConfig({ ...ENV_TESTE, [nome]: doModelo }), new RegExp(`${nome} no \\.env.*exemplo.*16 caracteres`), `${nome} do .env.example`);
    assert.throws(() => lerConfig({ ...ENV_TESTE, [nome]: 'x'.repeat(15) }), new RegExp(`${nome} no \\.env`));
    assert.doesNotThrow(() => lerConfig({ ...ENV_TESTE, [nome]: 'x'.repeat(16) })); // 16 caracteres já valem
  }
  assert.throws(() => lerConfig({ ...ENV_TESTE, JWT_SEGREDO: 'curto-123' }), (erro) => !erro.message.includes('curto-123'));
});

test('config usa DATA_REFERENCIA e, vazia, usa hoje', () => {
  assert.deepEqual(lerConfig(ENV_TESTE), {
    porta: 3000,
    jwtSegredo: ENV_TESTE.JWT_SEGREDO,
    chaveServico: ENV_TESTE.CHAVE_SERVICO,
    chaveDispositivo: ENV_TESTE.CHAVE_DISPOSITIVO,
    iaUrl: 'http://localhost:3001',
    caminhoBanco: './merenda.db',
    limiteTempC: 10,
    minutosPortaAberta: 2,
    dataReferencia: '2026-07-15',
  });
  const agora = new Date();
  const hoje = [agora.getFullYear(), agora.getMonth() + 1, agora.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
  assert.equal(lerConfig({ ...ENV_TESTE, DATA_REFERENCIA: '' }).dataReferencia, hoje);
  assert.equal(lerConfig({ ...ENV_TESTE, DATA_REFERENCIA: undefined }).dataReferencia, hoje);
  assert.throws(() => lerConfig({ ...ENV_TESTE, DATA_REFERENCIA: '2026-02-30' }), /DATA_REFERENCIA/);
  assert.throws(() => lerConfig({ ...ENV_TESTE, DATA_REFERENCIA: '15/07/2026' }), /DATA_REFERENCIA/);
  const outra = lerConfig({ ...ENV_TESTE, PORT: '8080', LIMITE_TEMP_C: '0', IA_URL: 'http://ia:3001' });
  assert.deepEqual([outra.porta, outra.limiteTempC, outra.iaUrl], [8080, 0, 'http://ia:3001']);
});
