// Servidor HTTP do app, sem Express: a API em /api/ e as telas de public/.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { criarRoteador } = require('./roteador');
const { ErroHttp, lerCorpoJson, responderJson, servirEstatico } = require('./http-util');

// O corpo é lido antes das rotas, ou seja, antes do login: o padrão é pequeno, e 256 KB sobram para um formulário.
const LIMITE_CORPO = 256 * 1024;
// Só o PDF da chamada chega em base64 e precisa de mais: 10 MB, o mesmo limite da IA. Outra rota grande entra aqui.
// shortcut: o corpo é lido antes do login, então quem não tem conta também o enche (até 256 KB, ou 10 MB nesta rota);
// se isso virar problema, conferir o token antes de ler.
const LIMITES_POR_ROTA = { 'POST /api/prefeitura/chamadas': 10 * 1024 * 1024 };
const PASTA_ROTAS = path.join(__dirname, 'rotas');
const PASTA_PUBLICA = path.join(__dirname, '..', 'public');

// Carrega cada arquivo de src/rotas/, que exporta registrar(roteador, { db, config, ia }).
// Rota nova é arquivo novo nessa pasta; este arquivo não muda. (`pastaRotas` é só para os testes trocarem a pasta.)
function criarServidor({ db, config, ia, pastaRotas = PASTA_ROTAS }) {
  const roteador = criarRoteador();
  for (const arquivo of fs.readdirSync(pastaRotas).filter((nome) => nome.endsWith('.js')).sort()) {
    require(path.join(pastaRotas, arquivo)).registrar(roteador, { db, config, ia });
  }

  return http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        const limite = LIMITES_POR_ROTA[`${req.method} ${req.url.split('?')[0]}`] ?? LIMITE_CORPO;
        const corpo = req.method === 'POST' || req.method === 'PUT' ? await lerCorpoJson(req, limite) : {};
        // ctx: o roteador põe params e query, e o exigirLogin põe usuario
        const atendeu = await roteador.tratar(req, res, { config, corpo });
        if (!atendeu) responderJson(res, 404, { erro: 'Rota não encontrada.' });
      } else if (!(await servirEstatico(req, res, PASTA_PUBLICA))) {
        responderJson(res, 404, { erro: 'Página não encontrada.' });
      }
    } catch (erro) {
      // Todo erro que não é ErroHttp fica no log, venha quando vier. A pilha nunca vai para o cliente.
      if (!(erro instanceof ErroHttp)) console.error(erro);
      if (res.writableEnded) return; // a resposta já saiu inteira: não há o que trocar, e cortar a conexão a truncaria
      if (res.headersSent) return res.destroy(); // começou e não acabou: corta, senão o cliente toma o pedaço por completo
      if (erro instanceof ErroHttp) {
        // 413: o resto do corpo não foi lido e não será. Fecha a conexão depois da resposta, em vez de ler e jogar fora
        if (erro.status === 413) res.setHeader('Connection', 'close');
        return responderJson(res, erro.status, { erro: erro.message });
      }
      responderJson(res, 500, { erro: 'Erro interno. Tente de novo.' });
    }
  });
}

module.exports = { criarServidor };
