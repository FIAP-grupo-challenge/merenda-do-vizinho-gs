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
test('api() troca a falha de rede por uma mensagem em português e repassa o erro do servidor, com o status', async () => {
  const codigo = fs.readFileSync(path.join(WEB, 'src', 'lib', 'api.js'), 'utf8');
  const { api } = await import(`data:text/javascript,${encodeURIComponent(codigo)}`);
  Object.assign(globalThis, { localStorage: { getItem: () => null, removeItem() {} }, location: {} });

  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(api('GET', '/api/eu'), { message: 'Sem conexão com o servidor. Confira a internet e tente de novo.' });
  // sem status: a tela da câmara fria para de consultar com 401 ou 403, mas com a rede fora continua tentando
  await assert.rejects(api('GET', '/api/eu'), (erro) => erro.status === undefined);

  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ erro: 'Confira o e-mail.' }) });
  await assert.rejects(api('POST', '/api/cadastro', {}), { message: 'Confira o e-mail.', status: 400 });
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => Promise.reject(new Error('não é JSON')) });
  await assert.rejects(api('GET', '/api/eu'), { message: 'Não deu certo. Tente de novo.', status: 500 });
});

// Texto do servidor (e dos PDFs) entra na tela só por interpolação {...}, que o Svelte escapa.
test('nenhuma tela põe HTML de fora na página: nada de {@html} nem innerHTML em web/src', () => {
  const fontes = fs.readdirSync(path.join(WEB, 'src'), { recursive: true }).filter((nome) => /\.(svelte|js)$/.test(nome));
  assert.ok(fontes.includes(path.join('paginas', 'Entrar.svelte')), 'a busca não achou as telas');
  for (const fonte of fontes) {
    assert.doesNotMatch(fs.readFileSync(path.join(WEB, 'src', fonte), 'utf8'), /\{@html|innerHTML/, fonte);
  }
});

// Número escrito num campo: as telas do agricultor usam campo de texto + lerNumero, e não <input type="number">, que depende
// do idioma do navegador e não avisa (num Chrome em inglês, "10,5" vira 105 e "1234,56" vira 123456; em português, "12.000" vira 12).
// formato.js não tem imports, então carrega sozinho (a página de cada tela é que o importa).
test('lerNumero entende o número do jeito brasileiro e recusa o que não é número, com a mensagem em português', async () => {
  const codigo = fs.readFileSync(path.join(WEB, 'src', 'lib', 'formato.js'), 'utf8');
  const { lerNumero, escreverNumero } = await import(`data:text/javascript,${encodeURIComponent(codigo)}`);

  const entendidos = [
    ['10', 10],
    [' 25 ', 25],
    ['007', 7],
    ['10,5', 10.5],
    ['10.5', 10.5],
    ['1.5', 1.5],
    ['1.2345', 1.2345],
    ['1234,56', 1234.56],
    ['1.234,56', 1234.56],
    ['12.000,5', 12000.5],
    ['12.000', 12000], // ponto que separa grupos de 3 dígitos é milhar
    ['1.234', 1234],
    ['1.234.567', 1234567],
    ['0,5', 0.5],
    ['0.5', 0.5],
    ['0.500', 0.5], // não é milhar: ninguém escreve 500 assim
    ['10,', 10], // a pessoa ainda está escrevendo: não é erro
    ['10.', 10],
  ];
  for (const [texto, valor] of entendidos) assert.deepEqual(lerNumero(texto), { valor, erro: '' }, texto);

  // campo vazio não é erro: quem exige o campo confere o null
  for (const vazio of ['', '   ', null, undefined]) assert.deepEqual(lerNumero(vazio), { valor: null, erro: '' }, String(vazio));

  const lixo = ['abc', '10 kg', 'R$ 10', '1 000', '-5', '1e5', 'Infinity', '1,2,3', '1.23,4', '1.234.5', '1.000.00', '1,234.56', ',5', '.5', ',', '.', '9'.repeat(400)];
  for (const texto of lixo) assert.deepEqual(lerNumero(texto), { valor: null, erro: 'Escreva só números, como 10, 10,5 ou 1.234,56.' }, texto.slice(0, 20));

  // escreverNumero é o caminho de volta (o formulário mostra o número salvo no campo de texto) e não perde casas
  assert.equal(escreverNumero(38000), '38000');
  assert.equal(escreverNumero(1234.5), '1234,5');
  assert.equal(escreverNumero(null), '');
  for (const n of [0, 0.1, 30.5, 1234.56, 10.12345, 38000, 0.1 + 0.2, 1e21]) assert.equal(lerNumero(escreverNumero(n)).valor, n, String(n));
});

const lerPagina = (nome) => fs.readFileSync(path.join(WEB, 'src', 'paginas', nome), 'utf8');

test('as telas do agricultor não usam <input type="number">: os números são campos de texto lidos por lerNumero', () => {
  for (const nome of ['Agricultor.svelte', 'Chamada.svelte']) {
    const fonte = lerPagina(nome);
    assert.doesNotMatch(fonte, /type="number"/, nome);
    assert.match(fonte, /<CampoNumero/, nome);
  }
  const campo = fs.readFileSync(path.join(WEB, 'src', 'lib', 'CampoNumero.svelte'), 'utf8');
  assert.match(campo, /type="text"/);
  assert.match(campo, /inputmode="decimal"/);
});

test('o aviso do chat fica embaixo da caixa de mensagem, ligado a ela, com o texto da decisão', () => {
  const fonte = lerPagina('Chamada.svelte');
  const AVISO = 'Não escreva seu nome, telefone, e-mail nem CPF aqui.';
  assert.equal(fonte.split(AVISO).length - 1, 1, 'o aviso aparece uma vez só');
  assert.doesNotMatch(fonte, /Não escreva CPF, CAF/, 'o aviso antigo, em cima da conversa e sem o nome, saiu');
  const caixa = fonte.match(/<input[^>]*\bid="pergunta"[^>]*>/);
  assert.ok(caixa, 'a caixa de mensagem (#pergunta) sumiu');
  assert.ok(fonte.indexOf(AVISO) > fonte.indexOf(caixa[0]), 'o aviso vem depois da caixa de mensagem');
  const aviso = fonte.match(/<p[^>]*\bid="([^"]+)"[^>]*>Não escreva seu nome, telefone, e-mail nem CPF aqui\.<\/p>/);
  assert.ok(aviso, 'o aviso precisa de um id');
  assert.ok(caixa[0].includes(`aria-describedby="${aviso[1]}"`), 'a caixa precisa de aria-describedby apontando para o aviso');
});

test('a tela diz o que vai para a IA: município, UF, produtos, orgânico e se tem prioridade (sim ou não), e não escrever dado pessoal no chat', () => {
  const fonte = lerPagina('Agricultor.svelte');
  assert.match(fonte, /recebe só o município, a UF, os produtos \([^)]*\), se a produção é orgânica e se você tem prioridade \(sim ou não\)/);
  assert.match(fonte, /não escreva nome, telefone, e-mail nem CPF/);
  assert.match(fonte, /A IA só fica sabendo se você tem prioridade \(sim ou não\)/);
  assert.doesNotMatch(fonte, /pontos de prioridade e não vai para a IA|nem as respostas sobre prioridade/, 'a frase antiga, que dizia que a prioridade não vai para a IA, saiu');
});

test('perto do limite anual o cartão só mostra o que a prefeitura pede, nunca a capacidade como se coubesse no limite', () => {
  const fonte = lerPagina('Agricultor.svelte');
  assert.doesNotMatch(fonte, /quantidade_max/, 'quantidade_max não é cortada pelo limite anual: não vai para a tela');
  assert.match(fonte, /O limite anual corta o total/);
});

test('os botões que enviam não ficam disabled enquanto enviam (o foco se perderia): um guarda ignora o segundo toque', () => {
  for (const [nome, marca] of [['Agricultor.svelte', 'salvando'], ['Chamada.svelte', 'enviando']]) {
    const fonte = lerPagina(nome);
    assert.doesNotMatch(fonte, new RegExp(`(?<![-\\w])disabled=\\{[^}]*\\b${marca}\\b`), `${nome}: botão disabled={${marca}}`);
    assert.match(fonte, new RegExp(`aria-disabled=\\{${marca}\\}`), nome);
    assert.match(fonte, new RegExp(`if \\(${marca}\\) return`), nome);
  }
});
