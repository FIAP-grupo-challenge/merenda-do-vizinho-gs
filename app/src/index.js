// Sobe o app: lê a configuração, migra e semeia o banco e escuta na porta (3000 por padrão).
const { lerConfig } = require('./config');
const { abrirBanco, migrar } = require('./db');
const { semear } = require('./semente');
const { criarClienteIa } = require('./cliente-ia');
const { criarServidor } = require('./servidor');

const config = lerConfig();
const db = abrirBanco(config.caminhoBanco);
migrar(db);
semear(db);
criarServidor({ db, config, ia: criarClienteIa(config.iaUrl) }).listen(config.porta, () => {
  console.log(`Merenda do Vizinho em http://localhost:${config.porta}`);
});
