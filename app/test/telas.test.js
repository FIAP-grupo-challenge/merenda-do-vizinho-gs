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

// Página de papel aberta direto, sem entrar (ou com a sessão vencida), não fica só com uma mensagem de erro: vai para a tela de entrar.
test('api() manda para a tela de entrar o 401 sem login ou com a sessão vencida, e deixa a mensagem do login com senha errada', async () => {
  const codigo = fs.readFileSync(path.join(WEB, 'src', 'lib', 'api.js'), 'utf8');
  const { api } = await import(`data:text/javascript,${encodeURIComponent(codigo)}`);
  let removidos = 0;
  const sessao = (token) => {
    removidos = 0;
    Object.assign(globalThis, { localStorage: { getItem: () => token, removeItem: () => removidos++ }, location: {} });
  };
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ erro: 'Entre na sua conta para continuar.' }) });

  sessao(null); // abriu /agricultor.html (ou outra página de papel) sem ter entrado
  await assert.rejects(api('GET', '/api/agricultor/oportunidades'), { message: 'Entre na sua conta para continuar.', status: 401 });
  assert.equal(location.href, '/');

  sessao('token-vencido'); // a sessão de 8 h acabou: o token velho sai e a pessoa volta para entrar
  await assert.rejects(api('GET', '/api/eu'), { status: 401 });
  assert.deepEqual([location.href, removidos], ['/', 1]);

  sessao(null); // senha errada na própria tela de entrar: a mensagem aparece lá, a página não recarrega
  await assert.rejects(api('POST', '/api/login', { email: 'ana@demo.br', senha: 'errada' }), { status: 401 });
  assert.equal(location.href, undefined);
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
// toda tela e todo componente de web/src, com o código-fonte: [caminho dentro de web/src, texto]
const fontesSvelte = () =>
  fs
    .readdirSync(path.join(WEB, 'src'), { recursive: true })
    .filter((nome) => nome.endsWith('.svelte'))
    .map((nome) => [nome, fs.readFileSync(path.join(WEB, 'src', nome), 'utf8')]);

// O produto se chama Colhe, com a frase "da roça para a merenda". Merenda do Vizinho era o nome de trabalho: fica só nos
// nomes técnicos (pasta, repositório, projetos do Docker), nunca no que a pessoa lê na tela.
test('as telas dizem Colhe e não Merenda do Vizinho', () => {
  const paginas = fs.readdirSync(WEB).filter((nome) => nome.endsWith('.html'));
  assert.equal(paginas.length, 7, 'a busca não achou as 7 páginas');
  for (const pagina of paginas) assert.match(fs.readFileSync(path.join(WEB, pagina), 'utf8'), /<title>[^<|]+ \| Colhe<\/title>/, pagina);
  for (const nome of fs.readdirSync(path.join(WEB, 'src', 'paginas')).filter((arquivo) => arquivo.endsWith('.svelte'))) {
    assert.deepEqual(lerPagina(nome).match(/<h1\b[\s\S]*?<\/h1>/g), ['<h1>Colhe</h1>'], nome);
  }
  assert.match(lerPagina('Entrar.svelte'), /<h1>Colhe<\/h1>\s*<p class="dica">da roça para a merenda<\/p>/, 'a frase vem embaixo do nome');
  for (const nome of fs.readdirSync(WEB, { recursive: true }).filter((arquivo) => fs.statSync(path.join(WEB, arquivo)).isFile())) {
    assert.ok(!fs.readFileSync(path.join(WEB, nome), 'utf8').includes('Merenda do Vizinho'), nome);
  }
});

test('nenhuma tela usa <input type="number">: os números são campos de texto lidos por lerNumero', () => {
  const fontes = fontesSvelte();
  assert.ok(fontes.some(([nome]) => nome === path.join('paginas', 'Entrar.svelte')), 'a busca não achou as telas');
  for (const [nome, fonte] of fontes) assert.doesNotMatch(fonte, /type\s*=\s*\{?\s*["']?number/, nome);
  // as telas que pedem número digitado usam o CampoNumero: um campo trocado por outra coisa, ou que sumiu, não passa
  for (const nome of ['Agricultor', 'Chamada', 'CamaraFria', 'Cooperativa', 'Prefeitura']) {
    assert.match(lerPagina(`${nome}.svelte`), /<CampoNumero/, nome);
  }
  const campo = fs.readFileSync(path.join(WEB, 'src', 'lib', 'CampoNumero.svelte'), 'utf8');
  assert.match(campo, /type="text"/);
  assert.match(campo, /inputmode="decimal"/);
});

// As telas da prefeitura, da cooperativa, do projeto de venda e da câmara fria tinham cada uma a sua cópia destes formatadores.
// O texto que eles escrevem é o de antes: 2 casas nas quantidades (numero(x, 2)), "sem data" quando não há data.
test('os formatadores ficam em formato.js: nenhuma tela tem cópia de reais, numero, data ou plural, e o texto é o de antes', async () => {
  for (const [nome, fonte] of fontesSvelte()) assert.doesNotMatch(fonte, /\b(?:const|function) (?:reais|numero|data|plural)\b\s*[=(]/, nome);

  const codigo = fs.readFileSync(path.join(WEB, 'src', 'lib', 'formato.js'), 'utf8');
  const { reais, numero, data, plural, nomeDoItem } = await import(`data:text/javascript,${encodeURIComponent(codigo)}`);
  assert.equal(reais(99243.1), 'R$\u00a099.243,10');
  assert.equal(numero(2280), '2.280');
  assert.equal(numero(12.3456), '12,346'); // o padrão (3 casas) é o das telas do agricultor e do eco dos campos de número
  assert.equal(numero(12.3456, 2), '12,35'); // as quantidades da prefeitura, da cooperativa e da câmara fria
  assert.equal(numero(1234567.891, 2), '1.234.567,89');
  assert.equal(numero(null, 2), '0');
  assert.equal(numero(undefined), '0');
  assert.equal(data('2026-07-30'), '30/07/2026');
  assert.equal(data('2026-07-09T12:00:00.000Z'), '09/07/2026'); // o momento em que a chamada foi publicada
  for (const vazio of [null, undefined, '']) assert.equal(data(vazio), 'sem data', String(vazio));
  assert.equal(plural(1, 'proposta', 'propostas'), '1 proposta');
  assert.equal(plural(0, 'proposta', 'propostas'), '0 propostas');
  assert.equal(plural(2, 'entrega registrada', 'entregas registradas'), '2 entregas registradas');

  // a entrega aparece com o nome do item da proposta, pela posição: Catalão tem duas abóboras (7,00 a unidade e 6,87 o quilo)
  const proposta = {
    itens: [
      { produto_id: 'abobora', produto: 'Abóbora Cabotiá' },
      { produto_id: 'alface', produto: 'Alface' },
      { produto_id: 'abobora', produto: 'Abóbora verde' },
    ],
  };
  assert.equal(nomeDoItem(proposta, { produto_id: 'abobora', item: 2 }), 'Abóbora verde');
  assert.equal(nomeDoItem(proposta, { produto_id: 'abobora', item: 0 }), 'Abóbora Cabotiá');
  assert.equal(nomeDoItem(proposta, { produto_id: 'alface', item: 1 }), 'Alface');
  assert.equal(nomeDoItem(proposta, { produto_id: 'abobora', item: null }), 'Abóbora Cabotiá', 'entrega antiga, sem a posição: o primeiro do produto');
  assert.equal(nomeDoItem(proposta, { produto_id: 'alface', item: 9 }), 'Alface', 'posição que a proposta não tem');
  assert.equal(nomeDoItem(proposta, { produto_id: 'tomate', item: null }), 'tomate', 'produto que a proposta não tem: o próprio id');
  assert.match(lerPagina('Prefeitura.svelte'), /nomeDoItem\(proposta, entrega\)/, 'a tabela de entregas usa o nome do item, não o do produto');
});

test('o termo de uso diz, uma vez só, que o CPF e o CAF aparecem só em parte na tela e no projeto de venda', () => {
  const fonte = lerPagina('Agricultor.svelte');
  const frase = 'O CPF e o CAF aparecem só em parte, na tela e no projeto de venda: você escreve o número completo à mão.';
  assert.ok(fonte.includes(`<li>${frase}</li>`), 'a frase do termo mudou');
  assert.equal(fonte.split('só em parte').length - 1, 1, 'o "só em parte" não se repete');
  assert.doesNotMatch(fonte, /vão no projeto de venda/, 'a frase antiga, que dizia que o CPF e o CAF vão no projeto, saiu');
});

// O percentual da tela sai só das entregas registradas no app: sem a frase, parecia a parte oficial da agricultura familiar.
test('a meta do ano diz que só conta as entregas registradas neste app, no texto que o botão Ouvir lê', () => {
  const fonte = lerPagina('Prefeitura.svelte');
  const frase = 'Conta só as entregas registradas neste app.';
  assert.equal(fonte.split(frase).length - 1, 1, 'a frase aparece uma vez só');
  const paragrafo = fonte.match(/<p id="texto-meta">([\s\S]*?)<\/p>/);
  assert.ok(paragrafo, 'o parágrafo da meta (#texto-meta) sumiu');
  assert.match(paragrafo[1], /em alimentos da agricultura familiar\.\s+Conta só as entregas registradas neste app\.\s+\{#if /, 'a frase vem logo depois do total recebido');
});

// O "Voltar" da chamada era só um link de texto, mais baixo que o toque de 44 px do resto da tela (.botao tem min-height: 44px).
test('o link de voltar da chamada é um botão de pelo menos 44 px de altura', () => {
  assert.match(lerPagina('Chamada.svelte'), /<a class="botao botao-secundario" href="\/agricultor\.html">Voltar para as oportunidades<\/a>/);
  const css = fs.readFileSync(path.join(WEB, 'public', 'css', 'estilo.css'), 'utf8');
  assert.match(css, /(?:^|\n)button,\n\.botao \{[^}]*min-height: 44px/, 'a regra de .botao perdeu o min-height de 44 px');
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
