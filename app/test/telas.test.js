// Telas responsivas (Global Constraints). As telas ficam em web/ e o `vite build` gera public/, que o servidor serve:
// estes testes conferem o public/ GERADO (o `npm test` roda o build antes). Toda página nova entra aqui sozinha.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', 'web');
const PUBLICA = path.join(__dirname, '..', 'public');

// sem o build, a falha diz o que fazer, em vez de um ENOENT
function exigirBuild() {
  assert.ok(fs.existsSync(path.join(PUBLICA, 'index.html')), 'app/public/ não foi gerada: rode "npm run build" (o "npm test" já roda o build antes)');
}

test('o build gerou cada página de web/, e toda página gerada tem a meta viewport e carrega /css/estilo.css', () => {
  exigirBuild();
  const geradas = fs.readdirSync(PUBLICA, { recursive: true }).filter((nome) => nome.endsWith('.html'));
  for (const pagina of fs.readdirSync(WEB).filter((nome) => nome.endsWith('.html'))) {
    assert.ok(geradas.includes(pagina), `${pagina}: o build não gerou a página (falta no rolldownOptions.input do vite.config.js)`);
  }
  for (const pagina of geradas) {
    const html = fs.readFileSync(path.join(PUBLICA, pagina), 'utf8');
    assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'), `${pagina}: falta a meta viewport`);
    assert.ok(html.includes('<link rel="stylesheet" href="/css/estilo.css">'), `${pagina}: falta o /css/estilo.css`);
    assert.doesNotMatch(html, /user-scalable\s*=\s*(no|0)|maximum-scale/i, `${pagina}: bloqueia o zoom`);
  }
});

test('estilo.css começa pelo celular, tem a quebra de 768 px, alvos de 44 px e a classe .rolavel', () => {
  exigirBuild();
  const css = fs.readFileSync(path.join(PUBLICA, 'css', 'estilo.css'), 'utf8');
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.doesNotMatch(css, /@media \(max-width/, 'celular primeiro: só min-width');
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.rolavel \{[^}]*overflow-x: auto/);
  assert.match(css, /\.topo :focus-visible \{[^}]*outline-color: #fff/, 'o anel de foco azul some no verde do topo');
});

// api.js é um ES module de navegador: roda aqui como módulo (data: URL), com localStorage, location e fetch de mentira.
// Cada arquivo de teste roda no seu processo, então trocar estes globais não vaza para os outros testes.
test('api() troca a falha de rede por uma mensagem em português e repassa o erro do servidor', async () => {
  const codigo = fs.readFileSync(path.join(WEB, 'src', 'lib', 'api.js'), 'utf8');
  const { api } = await import(`data:text/javascript,${encodeURIComponent(codigo)}`);
  Object.assign(globalThis, { localStorage: { getItem: () => null, removeItem() {} }, location: {} });

  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(api('GET', '/api/eu'), { message: 'Sem conexão com o servidor. Confira a internet e tente de novo.' });

  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ erro: 'Confira o e-mail.' }) });
  await assert.rejects(api('POST', '/api/cadastro', {}), { message: 'Confira o e-mail.' });
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => Promise.reject(new Error('não é JSON')) });
  await assert.rejects(api('GET', '/api/eu'), { message: 'Não deu certo. Tente de novo.' });
});

// Texto do servidor (e dos PDFs) entra na tela só por interpolação {...}, que o Svelte escapa.
test('nenhuma tela põe HTML de fora na página: nada de {@html} nem innerHTML em web/src', () => {
  const fontes = fs.readdirSync(path.join(WEB, 'src'), { recursive: true }).filter((nome) => /\.(svelte|js)$/.test(nome));
  assert.ok(fontes.includes(path.join('paginas', 'Entrar.svelte')), 'a busca não achou as telas');
  for (const fonte of fontes) {
    assert.doesNotMatch(fs.readFileSync(path.join(WEB, 'src', fonte), 'utf8'), /\{@html|innerHTML/, fonte);
  }
});
