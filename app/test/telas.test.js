// Telas responsivas (Global Constraints): toda página nova de public/ entra nesta conferência sozinha.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUBLICA = path.join(__dirname, '..', 'public');

test('toda página .html de public/ tem a meta viewport e carrega /css/estilo.css', () => {
  const paginas = fs.readdirSync(PUBLICA, { recursive: true }).filter((nome) => nome.endsWith('.html'));
  assert.ok(paginas.includes('index.html'));
  for (const pagina of paginas) {
    const html = fs.readFileSync(path.join(PUBLICA, pagina), 'utf8');
    assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'), `${pagina}: falta a meta viewport`);
    assert.ok(html.includes('<link rel="stylesheet" href="/css/estilo.css">'), `${pagina}: falta o /css/estilo.css`);
    assert.doesNotMatch(html, /user-scalable\s*=\s*(no|0)|maximum-scale/i, `${pagina}: bloqueia o zoom`);
  }
});

test('estilo.css começa pelo celular, tem a quebra de 768 px, alvos de 44 px e a classe .rolavel', () => {
  const css = fs.readFileSync(path.join(PUBLICA, 'css', 'estilo.css'), 'utf8');
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.doesNotMatch(css, /@media \(max-width/, 'celular primeiro: só min-width');
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.rolavel \{[^}]*overflow-x: auto/);
  assert.match(css, /\.topo :focus-visible \{[^}]*outline-color: #fff/, 'o anel de foco azul some no verde do topo');
});

// api.js é um script de navegador (funções globais): roda aqui com um navegador de mentira.
test('api() troca a falha de rede por uma mensagem em português e repassa o erro do servidor', async () => {
  const codigo = fs.readFileSync(path.join(PUBLICA, 'js', 'api.js'), 'utf8');
  const navegador = { localStorage: { getItem: () => null, removeItem() {} }, location: {} };
  vm.runInNewContext(codigo, navegador);

  navegador.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(navegador.api('GET', '/api/eu'), { message: 'Sem conexão com o servidor. Confira a internet e tente de novo.' });

  navegador.fetch = async () => ({ ok: false, status: 400, json: async () => ({ erro: 'Confira o e-mail.' }) });
  await assert.rejects(navegador.api('POST', '/api/cadastro', {}), { message: 'Confira o e-mail.' });
  navegador.fetch = async () => ({ ok: false, status: 500, json: async () => Promise.reject(new Error('não é JSON')) });
  await assert.rejects(navegador.api('GET', '/api/eu'), { message: 'Não deu certo. Tente de novo.' });
});
