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
// O servidor lê o corpo antes do login, então o limite é a defesa: o Content-Length acima dele é recusado sem ler
// nada, e passar dele no meio da leitura para a leitura. Depois do 413, quem fecha a conexão é o servidor.
function lerCorpoJson(req, limiteBytes) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    const recusar = () => {
      partes.length = 0;
      req.pause(); // não lê nem guarda o resto
      const limite = limiteBytes >= 1048576 ? `${limiteBytes / 1048576} MB` : `${limiteBytes / 1024} KB`;
      reject(new ErroHttp(413, `O envio passa do limite de ${limite}. Mande um arquivo ou um texto menor.`));
    };
    // o cliente desistiu no meio do envio (ECONNRESET "aborted"): ninguém lê a resposta, e não é erro do servidor
    req.on('error', () => reject(new ErroHttp(400, 'O envio foi interrompido.')));
    if (Number(req.headers['content-length']) > limiteBytes) return recusar();
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > limiteBytes) return recusar();
      partes.push(parte);
    });
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
  '.woff2': 'font/woff2', // a Inter das telas, em public/fonts/
  '.txt': 'text/plain; charset=utf-8', // a licença OFL da Inter, ao lado da fonte
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
