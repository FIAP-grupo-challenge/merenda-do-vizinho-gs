// Comum a todas as telas: chamar a API do app com o token da sessão.
// Uso: import { api, sair } from '../lib/api.js'; const dados = await api('POST', '/api/login', { email, senha });
// Se a resposta for um erro, lança Error com a mensagem do servidor (o campo "erro").
export async function api(metodo, caminho, corpo) {
  const token = localStorage.getItem('token');
  const cabecalhos = {};
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  let resposta;
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    // o fetch só lança quando a resposta nem chegou (internet caiu, servidor fora do ar); sem isto a tela mostraria "Failed to fetch"
    throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.');
  }
  const dados = await resposta.json().catch(() => ({}));
  // sessão vencida (8 h) ou inválida: volta para a tela de entrar
  if (resposta.status === 401 && token) sair();
  if (!resposta.ok) throw new Error(dados.erro || 'Não deu certo. Tente de novo.');
  return dados;
}

export function sair() {
  localStorage.removeItem('token');
  location.href = '/';
}
