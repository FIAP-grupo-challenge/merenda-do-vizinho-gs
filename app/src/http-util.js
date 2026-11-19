// Ferramentas de HTTP do app: erro com status, resposta JSON, leitura do corpo e arquivos estáticos.
const fs = require('node:fs/promises');
const path = require('node:path');

// Erro que vira resposta { erro } com o status dado (o servidor trata).
class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

function responderJson(res, status, objeto) {
  const corpo = JSON.stringify(objeto);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo) });
  res.end(corpo);
}

// Lê o corpo como objeto JSON. Corpo vazio vale {}.
function lerCorpoJson(req, limiteBytes) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho <= limiteBytes) {
        partes.push(parte);
      } else {
        // solta o que guardou e segue lendo e descartando o resto: com a conexão cortada, o cliente não veria o 413
        partes.length = 0;
        reject(new ErroHttp(413, `o corpo passa do limite de ${Math.round(limiteBytes / 1024 / 1024)} MB`));
      }
    });
    req.on('error', reject);
    req.on('end', () => {
      if (tamanho > limiteBytes) return;
      const texto = Buffer.concat(partes).toString('utf8');
      if (!texto.trim()) return resolve({});
      let corpo;
      try {
        corpo = JSON.parse(texto);
      } catch {
        return reject(new ErroHttp(400, 'JSON inválido'));
      }
      if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
        return reject(new ErroHttp(400, 'o corpo deve ser um objeto JSON'));
      }
      resolve(corpo);
    });
  });
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// Serve um arquivo de pastaPublica. Devolve false quando não serve (o servidor responde 404).
async function servirEstatico(req, res, pastaPublica) {
  if (req.method !== 'GET') return false;
  let caminho;
  try {
    caminho = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return false; // %xx quebrado
  }
  // olha o caminho cru e já decodificado: pega '../' e também '%2e%2e/'
  if (caminho.includes('..')) return false;
  if (caminho.endsWith('/')) caminho += 'index.html';
  const tipo = TIPOS[path.extname(caminho)];
  if (!tipo) return false;
  let conteudo;
  try {
    conteudo = await fs.readFile(path.join(pastaPublica, caminho));
  } catch {
    return false; // não existe, é pasta ou o nome é inválido
  }
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': conteudo.length });
  res.end(conteudo);
  return true;
}

module.exports = { ErroHttp, responderJson, lerCorpoJson, servirEstatico };
