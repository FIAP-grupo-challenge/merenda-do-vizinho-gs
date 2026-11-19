// Câmara fria: confere a leitura que o dispositivo manda (o Arduino ou o simulador de iot/) e diz que alertas ela pede.
// Sem banco nem rede: a rota (rotas/iot.js) grava a leitura e abre ou resolve os alertas.
const { validarData } = require('./validacao');

const MINUTO_MS = 60 * 1000;
// ISO 8601 com o fuso (Z ou ±hh:mm): sem ele, a hora seria lida no fuso do servidor
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
// validarData pega o dia que não existe: o JavaScript leria 2026-02-30 como 2 de março, em silêncio
const momentoValido = (m) => typeof m === 'string' && ISO_COM_FUSO.test(m) && validarData(m.slice(0, 10)) && !Number.isNaN(Date.parse(m));
const entre = (valor, minimo, maximo) => typeof valor === 'number' && valor >= minimo && valor <= maximo;
const emNumero = (valor) => valor.toLocaleString('pt-BR');

// As faixas recusam o que nenhum sensor da câmara lê: é defeito ou erro de envio, e não vira alerta.
// Sem momento (o Arduino não tem relógio), vale a hora do servidor.
function validarLeitura({ dispositivo, temperatura_c, peso_kg, porta_aberta, momento }) {
  const erros = [];
  if (typeof dispositivo !== 'string' || !dispositivo.trim() || dispositivo.length > 40) {
    erros.push('O dispositivo deve ter um nome de 1 a 40 caracteres.');
  }
  if (!entre(temperatura_c, -30, 60)) erros.push('A temperatura deve ser um número de -30 a 60 °C.');
  if (!entre(peso_kg, 0, 5000)) erros.push('O peso deve ser um número de 0 a 5000 kg.');
  if (typeof porta_aberta !== 'boolean') erros.push('porta_aberta deve ser true (aberta) ou false (fechada).');
  if (momento != null && !momentoValido(momento)) {
    erros.push('O momento deve ser uma data ISO 8601 com fuso, como 2026-11-18T22:24:36+00:00.');
  }
  return { ok: erros.length === 0, erros };
}

// Os alertas que a leitura pede, um de cada tipo, e os dois podem valer juntos (a porta aberta esquenta a câmara):
// temperatura acima de config.limiteTempC, e porta aberta há mais de config.minutosPortaAberta minutos.
// portaAbertaDesde é o momento da primeira leitura com a porta aberta (null com ela fechada); quem chama o guarda
// entre as leituras de cada dispositivo. A leitura já vem validada e com o momento.
function avaliarLeitura(leitura, portaAbertaDesde, config) {
  const alertas = [];
  if (leitura.temperatura_c > config.limiteTempC) {
    alertas.push({
      tipo: 'temperatura',
      mensagem:
        `Temperatura de ${emNumero(leitura.temperatura_c)} °C em ${leitura.dispositivo}, ` +
        `acima do limite de ${emNumero(config.limiteTempC)} °C.`,
    });
  }
  const desde = leitura.porta_aberta ? (portaAbertaDesde ?? leitura.momento) : null;
  if (desde && Date.parse(leitura.momento) - Date.parse(desde) > config.minutosPortaAberta * MINUTO_MS) {
    const minutos = `${emNumero(config.minutosPortaAberta)} ${config.minutosPortaAberta === 1 ? 'minuto' : 'minutos'}`;
    alertas.push({ tipo: 'porta', mensagem: `A porta de ${leitura.dispositivo} está aberta há mais de ${minutos}.` });
  }
  return { alertas, portaAbertaDesde: desde };
}

module.exports = { validarLeitura, avaliarLeitura };
