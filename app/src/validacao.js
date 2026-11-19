// Validações e máscaras de dados pessoais. CPF e CAF nunca saem da tela sem máscara.

// Com ou sem máscara: 529.982.247-25 ou 52998224725.
function validarCpf(cpf) {
  if (typeof cpf !== 'string') return false;
  const d = cpf.replace(/[.\s-]/g, '');
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  // dígito verificador: pesos n+1 até 2 sobre os n primeiros dígitos; resto 10 vira 0
  const digito = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    return ((soma * 10) % 11) % 10;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

// Não há formato oficial publicado do número do CAF (fatos-pnae.md, seção 3); o padrão visto é
// XX052025.01.000000000CAF. Por isso só limita tamanho e caracteres. O número do CAF é dado pessoal
// (Portaria MDA 19/2025, art. 39, V) e recebe o mesmo cuidado do CPF.
function validarCaf(caf) {
  return typeof caf === 'string' && /^[A-Za-z0-9./-]{5,30}$/.test(caf);
}

function validarEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// AAAA-MM-DD de um dia que existe (2026-02-30 não vale).
function validarData(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const data = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().startsWith(texto);
}

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

function validarUf(uf) {
  return UFS.includes(uf);
}

// '123.456.789-09' vira '***.456.789-**'. Vazio vira null.
function mascararCpf(cpf) {
  if (!cpf) return null;
  const d = String(cpf).replace(/\D/g, '');
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

// Mostra só os 4 últimos caracteres: 'GO052025.01.000012345CAF' vira '****5CAF'. Vazio vira null.
function mascararCaf(caf) {
  if (!caf) return null;
  return `****${String(caf).slice(-4)}`;
}

module.exports = { validarCpf, validarCaf, validarEmail, validarData, validarUf, mascararCpf, mascararCaf };
