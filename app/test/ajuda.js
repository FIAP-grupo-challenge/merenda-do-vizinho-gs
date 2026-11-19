// Ajuda dos testes. Só exporta funções: importar este arquivo não abre servidor nem banco.
const { lerConfig } = require('../src/config');
const { abrirBanco, migrar } = require('../src/db');
const { semear } = require('../src/semente');
const { criarServidor } = require('../src/servidor');

const ENV_TESTE = {
  JWT_SEGREDO: 'segredo-so-dos-testes',
  CHAVE_SERVICO: 'chave-servico-dos-testes',
  CHAVE_DISPOSITIVO: 'chave-dispositivo-dos-testes',
  DATA_REFERENCIA: '2026-07-15',
};

// Sobe o app como o index.js faz (banco migrado e semeado), mas em memória e numa porta livre.
// `ia` é o cliente da IA: nos testes, um objeto falso com saude, extrairChamada e assistente.
async function subirApp({ ia = {}, env = {} } = {}) {
  const config = lerConfig({ ...ENV_TESTE, ...env });
  const db = abrirBanco(':memory:');
  migrar(db);
  semear(db);
  const servidor = criarServidor({ db, config, ia });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${servidor.address().port}`;

  // corpo: um objeto vai como JSON; um texto vai como está (para testar JSON quebrado e corpo grande).
  async function pedir(metodo, caminho, { corpo, token } = {}) {
    const headers = {};
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const resposta = await fetch(url + caminho, {
      method: metodo,
      headers,
      body: corpo === undefined || typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    });
    const texto = await resposta.text();
    const ehJson = (resposta.headers.get('content-type') || '').includes('application/json');
    return { status: resposta.status, corpo: ehJson ? JSON.parse(texto) : texto, headers: resposta.headers };
  }

  // Entra com um usuário (os da semente usam demo1234) e devolve o token.
  async function entrar(email, senha = 'demo1234') {
    const { status, corpo } = await pedir('POST', '/api/login', { corpo: { email, senha } });
    if (status !== 200) throw new Error(`login de ${email} devolveu ${status}`);
    return corpo.token;
  }

  async function fechar() {
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    db.close();
  }

  return { url, db, config, pedir, entrar, fechar };
}

// Resposta falsa para testar o roteador sem rede: guarda o status e o corpo de responderJson.
function respostaFalsa() {
  return {
    status: null,
    corpo: null,
    writableEnded: false,
    writeHead(status) {
      this.status = status;
      return this;
    },
    end(corpo) {
      this.corpo = corpo;
      this.writableEnded = true;
    },
  };
}

module.exports = { ENV_TESTE, subirApp, respostaFalsa };
