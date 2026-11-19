// Configuração lida do ambiente (o npm start carrega o .env da raiz). Variável vazia vale como ausente.
const { validarData } = require('./validacao');

const SEGREDOS = ['JWT_SEGREDO', 'CHAVE_SERVICO', 'CHAVE_DISPOSITIVO'];

function lerConfig(env = process.env) {
  for (const nome of SEGREDOS) {
    if (!env[nome]) throw new Error(`falta ${nome} no .env (copie o .env.example e preencha)`);
  }
  // o "hoje" das oportunidades: a demonstração usa chamadas reais de 2026 que já fecharam
  const dataReferencia = env.DATA_REFERENCIA || dataDeHoje();
  if (!validarData(dataReferencia)) throw new Error('DATA_REFERENCIA deve ser uma data válida no formato AAAA-MM-DD');
  return {
    porta: numero(env, 'PORT', 3000),
    jwtSegredo: env.JWT_SEGREDO,
    chaveServico: env.CHAVE_SERVICO,
    chaveDispositivo: env.CHAVE_DISPOSITIVO,
    iaUrl: env.IA_URL || 'http://localhost:3001',
    caminhoBanco: env.CAMINHO_BANCO || './merenda.db',
    limiteTempC: numero(env, 'LIMITE_TEMP_C', 10),
    minutosPortaAberta: numero(env, 'MINUTOS_PORTA_ABERTA', 2),
    dataReferencia,
  };
}

function numero(env, nome, padrao) {
  if (!env[nome]) return padrao;
  const valor = Number(env[nome]);
  if (!Number.isFinite(valor)) throw new Error(`${nome} deve ser um número`);
  return valor;
}

// a data local, não a de Greenwich: no Brasil, depois das 21 h o UTC já está no dia seguinte
function dataDeHoje() {
  const agora = new Date();
  return [agora.getFullYear(), agora.getMonth() + 1, agora.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

module.exports = { lerConfig };
