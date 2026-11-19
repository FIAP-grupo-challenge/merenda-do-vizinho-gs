// Cliente HTTP do serviço de IA (Python, porta 3001).
const { ErroHttp } = require('./http-util');

// acima dos limites da própria IA (90 s na extração, 60 s no assistente), para ela responder antes
const TEMPO_LIMITE_MS = 120_000;

// Cada função devolve o JSON da IA. Se der errado, lança ErroHttp: o 4xx da IA (PDF ilegível,
// corpo inválido) volta igual, com a mensagem dela; IA fora do ar, lenta ou com erro vira 502.
function criarClienteIa(baseUrl) {
  async function chamar(caminho, corpo) {
    let resposta;
    let dados;
    try {
      resposta = await fetch(baseUrl.replace(/\/+$/, '') + caminho, {
        method: corpo === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      dados = await resposta.json();
    } catch {
      throw new ErroHttp(502, 'O serviço de IA não respondeu. Tente de novo em instantes.');
    }
    if (resposta.ok) return dados;
    const status = resposta.status >= 400 && resposta.status < 500 ? resposta.status : 502;
    throw new ErroHttp(status, (dados && dados.erro) || 'O serviço de IA deu erro.');
  }

  return {
    saude: () => chamar('/saude'),
    extrairChamada: (corpo) => chamar('/extrair-chamada', corpo),
    assistente: (corpo) => chamar('/assistente', corpo),
  };
}

module.exports = { criarClienteIa };
