// Senhas com scrypt e sessões com JWT (HS256, 8 h).
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { responderJson } = require('./http-util');

const TAMANHO_HASH = 64;

function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  return `scrypt$${sal}$${crypto.scryptSync(senha, sal, TAMANHO_HASH).toString('hex')}`;
}

function conferirSenha(senha, armazenado) {
  // sem String(senha): um corpo sem senha viraria 'undefined', que é uma senha válida de 9 letras
  if (typeof senha !== 'string') return false;
  const [algoritmo, sal, hash] = String(armazenado).split('$');
  if (algoritmo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'hex');
  const calculado = crypto.scryptSync(senha, sal, TAMANHO_HASH);
  // timingSafeEqual: o tempo da comparação não revela quantos bytes bateram
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

function emitirToken({ id, papel }, segredo) {
  return jwt.sign({ id, papel }, segredo, { algorithm: 'HS256', expiresIn: '8h' });
}

// Manipulador de rota: confere o "Authorization: Bearer <token>" e põe { id, papel } em ctx.usuario.
async function exigirLogin(req, res, ctx) {
  const [tipo, token] = String(req.headers.authorization || '').split(' ');
  try {
    if (tipo !== 'Bearer' || !token) throw new Error('sem token');
    const { id, papel } = jwt.verify(token, ctx.config.jwtSegredo, { algorithms: ['HS256'] });
    ctx.usuario = { id, papel };
  } catch {
    responderJson(res, 401, { erro: 'Entre na sua conta para continuar.' });
  }
}

// Manipulador de rota, depois do exigirLogin: só deixa passar os papéis dados.
function exigirPapel(...papeis) {
  return async (req, res, ctx) => {
    if (!ctx.usuario || !papeis.includes(ctx.usuario.papel)) {
      responderJson(res, 403, { erro: 'Esta parte do app não é para o seu tipo de conta.' });
    }
  };
}

module.exports = { hashSenha, conferirSenha, emitirToken, exigirLogin, exigirPapel };
