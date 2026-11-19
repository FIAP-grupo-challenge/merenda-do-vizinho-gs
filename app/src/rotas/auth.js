// Cadastro, login e "quem sou eu".
const { hashSenha, conferirSenha, emitirToken, exigirLogin } = require('../auth');
const { emTransacao } = require('../db');
const { ErroHttp, responderJson } = require('../http-util');
const { validarEmail, validarUf } = require('../validacao');

const PAPEIS = ['agricultor', 'cooperativa', 'prefeitura'];

// texto sem espaços nas pontas; '' se não for texto
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

function registrar(roteador, { db, config }) {
  // { email, senha, papel, nome }; a cooperativa manda também cnpj, municipio e uf
  roteador.post('/api/cadastro', async (req, res, ctx) => {
    const { senha, papel } = ctx.corpo;
    const email = texto(ctx.corpo.email).toLowerCase();
    const nome = texto(ctx.corpo.nome);
    if (!validarEmail(email)) throw new ErroHttp(400, 'Confira o e-mail.');
    if (typeof senha !== 'string' || senha.length < 8) throw new ErroHttp(400, 'A senha precisa ter pelo menos 8 caracteres.');
    if (!PAPEIS.includes(papel)) throw new ErroHttp(400, 'Escolha: agricultor, cooperativa ou prefeitura.');
    if (!nome || nome.length > 120) throw new ErroHttp(400, 'Escreva o nome, com até 120 letras.');
    let cooperativa;
    if (papel === 'cooperativa') {
      cooperativa = {
        cnpj: texto(ctx.corpo.cnpj).replace(/[./\s-]/g, ''),
        municipio: texto(ctx.corpo.municipio),
        uf: texto(ctx.corpo.uf).toUpperCase(),
      };
      if (!/^\d{14}$/.test(cooperativa.cnpj)) throw new ErroHttp(400, 'O CNPJ precisa ter 14 números.');
      if (!cooperativa.municipio || cooperativa.municipio.length > 100) throw new ErroHttp(400, 'Escreva o município.');
      if (!validarUf(cooperativa.uf)) throw new ErroHttp(400, 'Escolha a UF.');
    }
    if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) {
      throw new ErroHttp(409, 'Este e-mail já tem conta. Use a aba Entrar.');
    }

    const id = emTransacao(db, () => {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO usuarios (email, senha_hash, papel, nome, criado_em) VALUES (?, ?, ?, ?, ?)')
        .run(email, hashSenha(senha), papel, nome, new Date().toISOString());
      const novo = Number(lastInsertRowid);
      if (papel === 'agricultor') db.prepare('INSERT INTO agricultores (usuario_id) VALUES (?)').run(novo);
      if (cooperativa) {
        db.prepare('INSERT INTO cooperativas (usuario_id, nome, cnpj, municipio, uf) VALUES (?, ?, ?, ?, ?)').run(
          novo,
          nome,
          cooperativa.cnpj,
          cooperativa.municipio,
          cooperativa.uf,
        );
      }
      return novo;
    });
    responderJson(res, 201, { token: emitirToken({ id, papel }, config.jwtSegredo) });
  });

  roteador.post('/api/login', async (req, res, ctx) => {
    const usuario = db
      .prepare('SELECT id, papel, nome, senha_hash FROM usuarios WHERE email = ?')
      .get(texto(ctx.corpo.email).toLowerCase());
    if (!usuario || !conferirSenha(ctx.corpo.senha, usuario.senha_hash)) throw new ErroHttp(401, 'E-mail ou senha não conferem.');
    responderJson(res, 200, { token: emitirToken(usuario, config.jwtSegredo), papel: usuario.papel, nome: usuario.nome });
  });

  roteador.get('/api/eu', exigirLogin, async (req, res, ctx) => {
    const eu = db.prepare('SELECT id, papel, nome, email FROM usuarios WHERE id = ?').get(ctx.usuario.id);
    if (!eu) throw new ErroHttp(401, 'Entre na sua conta para continuar.');
    responderJson(res, 200, eu);
  });
}

module.exports = { registrar };
