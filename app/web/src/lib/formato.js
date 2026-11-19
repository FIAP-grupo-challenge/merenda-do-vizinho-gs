// Números, dinheiro e datas do jeito brasileiro, para as telas.
export const reais = (valor) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const numero = (valor) => valor.toLocaleString('pt-BR');
// 'AAAA-MM-DD' (o formato das chamadas) vira 'DD/MM/AAAA'
export const data = (texto) => texto.slice(0, 10).split('-').reverse().join('/');
