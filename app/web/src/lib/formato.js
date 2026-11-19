// Números, dinheiro e datas do jeito brasileiro, para as telas.
export const reais = (valor) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const numero = (valor) => valor.toLocaleString('pt-BR');
// 'AAAA-MM-DD' (o formato das chamadas) vira 'DD/MM/AAAA'
export const data = (texto) => texto.slice(0, 10).split('-').reverse().join('/');

// Número escrito num campo de texto, do jeito de quem digita no Brasil. O <input type="number"> depende do idioma do
// navegador ("10,5" vira 105 num Chrome em inglês, "12.000" vira 12 num em português) e não avisa: por isso os campos de
// número são de texto (inputmode="decimal") e este leitor entende o texto sempre do mesmo jeito. Sem imports: os testes o carregam sozinho.
//
//   lerNumero(texto) -> { valor, erro }
//     valor: o número (finito, 0 ou mais), ou null quando o campo está vazio ou o texto não é número
//     erro:  '' quando está tudo certo (campo vazio também); senão a mensagem em português, para mostrar ao lado do campo
//   Entende "10", "10,5", "10.5", "1234,56", "1.234,56", "12.000", "1.234.567" e "10," (a pessoa ainda está escrevendo).
//   A vírgula é sempre o decimal. O ponto sozinho é milhar quando separa grupos de 3 dígitos ("12.000", "1.234"); senão
//   é decimal ("10.5", "0.500"). Recusa letras, "R$", sinal de menos, espaço no meio, mais de uma vírgula, ponto de milhar
//   fora do lugar ("1.23,4") e decimal em inglês ("1,234.56").
//   Quem exige o campo confere o null; quem exige mínimo (quantidade maior que zero) confere o valor.
const MILHAR = /^[1-9]\d{0,2}(\.\d{3})+$/; // "12.000", "1.234.567"; "0.500" não é milhar
const SO_NUMEROS = 'Escreva só números, como 10, 10,5 ou 1.234,56.';

export function lerNumero(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return { valor: null, erro: '' };
  let normal = ''; // o mesmo número no formato do JavaScript: ponto decimal e sem pontos de milhar
  if (t.includes(',')) {
    const [inteira, decimais, ...sobra] = t.split(',');
    if (!sobra.length && /^\d*$/.test(decimais) && (/^\d+$/.test(inteira) || MILHAR.test(inteira))) {
      normal = `${inteira.replace(/\./g, '')}.${decimais || '0'}`;
    }
  } else if (MILHAR.test(t)) {
    normal = t.replace(/\./g, '');
  } else if (/^\d+\.?\d*$/.test(t)) {
    normal = t;
  }
  const valor = Number(normal);
  return normal && Number.isFinite(valor) ? { valor, erro: '' } : { valor: null, erro: SO_NUMEROS };
}

// O contrário de lerNumero: o número como a pessoa o escreve ("1234,5"), sem ponto de milhar e sem perder casas decimais.
export const escreverNumero = (valor) => (Number.isFinite(valor) ? valor.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 20 }) : '');
