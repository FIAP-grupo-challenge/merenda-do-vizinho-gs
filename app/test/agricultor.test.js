const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { criarClienteIa } = require('../src/cliente-ia');
const { perfilParaIa } = require('../src/perfil-ia');
const { subirApp } = require('./ajuda');

// A chamada de Catalão (GO) no formato da IA (T2), com os preços do edital real. A semente com a chamada é da T9:
// até lá, cada teste grava a sua. O contato é o da prefeitura (documento público), e mesmo assim não vai para a IA.
const item = (produto, produto_id, unidade, quantidade, preco_unitario) => ({
  produto,
  produto_id,
  unidade,
  quantidade,
  preco_unitario,
  valor_total: null,
  entrega: null,
  observacoes: null,
});
const CATALAO = {
  numero: '001/2026',
  orgao: 'Fundo Municipal de Educação de Catalão',
  municipio: 'Catalão',
  uf: 'GO',
  data_publicacao: '2026-07-09',
  prazo_envio: '2026-07-30',
  periodo_fornecimento: null,
  semanas_fornecimento: null,
  local_entrega: null,
  documentos_exigidos: ['Extrato do CAF', 'Projeto de venda assinado'],
  criterios_prioridade: [],
  contato: 'Secretaria Municipal de Educação, (64) 3441-0000',
  itens: [item('Alface', 'alface', 'pç', 2280, 7.03), item('Mandioca', 'mandioca', 'kg', 2800, 11.71), item('Tomate', 'tomate', 'kg', 1768, 12.04)],
};
const TODO_ANO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CPF = '529.982.247-25';
const CAF = 'GO052025.01.000012345CAF';

const idDe = (app, email) => app.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email).id;
const linhaDe = (app, email) => ({ ...app.db.prepare('SELECT * FROM agricultores WHERE usuario_id = ?').get(idDe(app, email)) });

function gravarChamada(app, dados, status = 'publicada') {
  const publicada = status === 'publicada' ? '2026-07-09T12:00:00.000Z' : null;
  return Number(
    app.db
      .prepare('INSERT INTO chamadas (prefeitura_id, dados, status, origem, criada_em, publicada_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(idDe(app, 'prefeitura@demo.br'), JSON.stringify(dados), status, 'regras', '2026-07-09T12:00:00.000Z', publicada).lastInsertRowid,
  );
}

// O corpo inteiro do formulário Meu sítio: o PUT troca tudo, menos o CPF e o CAF quando eles não vêm.
const perfilValido = (mudar = {}) => ({
  municipio: 'Catalão',
  uf: 'GO',
  grupo_prioritario: [],
  organico: true,
  mulher_titular: true,
  jovem: true,
  ja_vendeu_pnae: false,
  cooperativa_id: null,
  vendido_no_ano_reais: 0,
  produtos: [{ produto_id: 'alface', quantidade_semana: 25, meses_safra: TODO_ANO }],
  aceite_termo: true,
  ...mudar,
});

// Todas as chaves de qualquer nível do JSON.
function todasAsChaves(valor) {
  if (Array.isArray(valor)) return valor.flatMap(todasAsChaves);
  if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([chave, filho]) => [chave, ...todasAsChaves(filho)]);
  return [];
}

// Uma porta onde nada escuta: a IA "fora do ar" de verdade, com o cliente real.
async function portaSemNinguem() {
  const servidor = net.createServer();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const { port } = servidor.address();
  await new Promise((resolve) => servidor.close(resolve));
  return port;
}

const RESPOSTA_IA = {
  origem: 'regras',
  resposta: 'O prazo vai até 30/07/2026.\n\nVale o texto da chamada. Confirme com a prefeitura ou com a assistência técnica (Emater).',
  sugestao: { itens: [{ produto_id: 'alface', quantidade: 1000 }] },
  checklist: ['Extrato do CAF', 'Projeto de venda assinado'],
};

test('perfil com CPF inválido ou sem aceite devolve 400', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('ana@demo.br');
  const salvar = (corpo) => app.pedir('PUT', '/api/agricultor/perfil', { corpo, token });

  // a Ana da semente nunca aceitou o termo: o primeiro salvamento exige o aceite
  const { aceite_termo, ...semAceite } = perfilValido();
  assert.equal((await salvar(semAceite)).status, 400);
  assert.equal((await salvar(perfilValido({ aceite_termo: false }))).status, 400);
  const invalido = await salvar(perfilValido({ cpf: '529.982.247-26' })); // dígito verificador errado
  assert.equal(invalido.status, 400);
  assert.ok(invalido.corpo.erro, 'a tela mostra o motivo');
  assert.equal((await salvar(perfilValido({ cpf: '111.111.111-11' }))).status, 400);
  assert.equal((await salvar(perfilValido({ caf: 'x' }))).status, 400);
  assert.equal(linhaDe(app, 'ana@demo.br').aceite_termo_em, null, 'nada foi gravado');

  // controle: com aceite e CPF válido, salva; depois, o aceite não é pedido de novo e o momento do aceite fica
  assert.equal((await salvar(perfilValido({ cpf: CPF }))).status, 200);
  const aceite = linhaDe(app, 'ana@demo.br').aceite_termo_em;
  assert.ok(!Number.isNaN(Date.parse(aceite)), aceite);
  assert.equal((await salvar(semAceite)).status, 200);
  assert.equal(linhaDe(app, 'ana@demo.br').aceite_termo_em, aceite);
});

test('PUT perfil valida UF, catálogo, meses, quantidade, vendido e grupos, e grava produtos e critérios', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('ana@demo.br');
  const salvar = (corpo) => app.pedir('PUT', '/api/agricultor/perfil', { corpo, token });
  const produto = (mudar) => ({ produtos: [{ produto_id: 'alface', quantidade_semana: 25, meses_safra: TODO_ANO, ...mudar }] });

  const invalidos = {
    'UF que não existe': { uf: 'XX' },
    'município vazio': { municipio: '  ' },
    'produto fora do catálogo': produto({ produto_id: 'pizza' }),
    'mês 13': produto({ meses_safra: [1, 13] }),
    'mês 0': produto({ meses_safra: [0] }),
    'sem mês': produto({ meses_safra: [] }),
    'quantidade 0': produto({ quantidade_semana: 0 }),
    'quantidade em texto': produto({ quantidade_semana: '25' }),
    'produto repetido': { produtos: [{ produto_id: 'alface', quantidade_semana: 1, meses_safra: [1] }, { produto_id: 'alface', quantidade_semana: 2, meses_safra: [2] }] },
    'sem lista de produtos': { produtos: undefined },
    'vendido negativo': { vendido_no_ano_reais: -1 },
    'vendido em texto': { vendido_no_ano_reais: '100' },
    'sem vendido': { vendido_no_ano_reais: undefined },
    'grupo em texto': { grupo_prioritario: 'quilombola' },
  };
  for (const [caso, mudar] of Object.entries(invalidos)) {
    assert.equal((await salvar(perfilValido(mudar))).status, 400, caso);
  }

  const salvo = await salvar(
    perfilValido({
      municipio: ' Goiânia ',
      grupo_prioritario: ['quilombola', 'desconhecido', 'assentado', 'quilombola'],
      organico: false,
      jovem: false,
      ja_vendeu_pnae: true,
      vendido_no_ano_reais: 1234.5,
      produtos: [
        { produto_id: 'mandioca', quantidade_semana: 30.5, meses_safra: [12, 1, 1] },
        { produto_id: 'alface', quantidade_semana: 25, meses_safra: TODO_ANO },
      ],
    }),
  );
  assert.equal(salvo.status, 200);
  const linha = linhaDe(app, 'ana@demo.br');
  assert.deepEqual(
    [linha.municipio, linha.uf, linha.grupo_prioritario, linha.organico, linha.mulher_titular, linha.jovem, linha.ja_vendeu_pnae, linha.vendido_no_ano_reais],
    ['Goiânia', 'GO', '["assentado","quilombola"]', 0, 1, 0, 1, 1234.5],
  );
  // a lista de produtos troca inteira; os meses ficam em ordem e sem repetição
  const produtos = app.db.prepare('SELECT produto_id, quantidade_semana, meses_safra FROM produtos_agricultor WHERE agricultor_id = ? ORDER BY id').all(idDe(app, 'ana@demo.br'));
  assert.deepEqual(produtos.map((p) => ({ ...p })), [
    { produto_id: 'mandioca', quantidade_semana: 30.5, meses_safra: '[1,12]' },
    { produto_id: 'alface', quantidade_semana: 25, meses_safra: JSON.stringify(TODO_ANO) },
  ]);
  // a resposta do PUT é o perfil, como o GET devolve
  assert.deepEqual(salvo.corpo, (await app.pedir('GET', '/api/agricultor/perfil', { token })).corpo);
  assert.deepEqual(salvo.corpo.grupo_prioritario, ['assentado', 'quilombola']);
  assert.deepEqual(salvo.corpo.produtos[0], { produto_id: 'mandioca', quantidade_semana: 30.5, meses_safra: [1, 12] });
  assert.equal(salvo.corpo.ja_vendeu_pnae, true);
});

test('GET perfil devolve CPF e CAF mascarados; cooperativa inexistente devolve 400', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const token = await app.entrar('ana@demo.br');
  const salvar = (corpo) => app.pedir('PUT', '/api/agricultor/perfil', { corpo, token });
  const cooperativa = idDe(app, 'cooperativa@demo.br');

  const salvo = await salvar(perfilValido({ cpf: CPF, caf: CAF, cooperativa_id: cooperativa }));
  assert.equal(salvo.status, 200);
  const { status, corpo } = await app.pedir('GET', '/api/agricultor/perfil', { token });
  assert.equal(status, 200);
  assert.equal(corpo.cpf, '***.982.247-**');
  assert.equal(corpo.caf, '****5CAF');
  assert.equal(corpo.cooperativa_id, cooperativa);
  for (const resposta of [corpo, salvo.corpo]) {
    const texto = JSON.stringify(resposta);
    for (const dado of ['52998224725', CPF, CAF]) assert.ok(!texto.includes(dado), `${dado} saiu sem máscara`);
  }
  // no banco, o CPF fica só com os números e o CAF como foi escrito
  assert.deepEqual([linhaDe(app, 'ana@demo.br').cpf, linhaDe(app, 'ana@demo.br').caf], ['52998224725', CAF]);

  // sem cpf e caf no corpo, ficam os de antes
  assert.equal((await salvar(perfilValido({ cooperativa_id: cooperativa }))).status, 200);
  assert.deepEqual([linhaDe(app, 'ana@demo.br').cpf, linhaDe(app, 'ana@demo.br').caf], ['52998224725', CAF]);

  // cooperativa que não existe, ou um usuário que não é cooperativa: 400, e a de antes fica
  for (const cooperativa_id of [99999, idDe(app, 'prefeitura@demo.br'), String(cooperativa), 'Cooperativa Vizinhos do Campo']) {
    assert.equal((await salvar(perfilValido({ cooperativa_id }))).status, 400, String(cooperativa_id));
  }
  assert.equal(linhaDe(app, 'ana@demo.br').cooperativa_id, cooperativa);
  // controle: null tira a cooperativa
  assert.equal((await salvar(perfilValido({ cooperativa_id: null }))).status, 200);
  assert.equal(linhaDe(app, 'ana@demo.br').cooperativa_id, null);

  const cooperativas = await app.pedir('GET', '/api/agricultor/cooperativas', { token });
  assert.equal(cooperativas.status, 200);
  assert.deepEqual(cooperativas.corpo, [{ id: cooperativa, nome: 'Cooperativa Vizinhos do Campo', municipio: 'Catalão', uf: 'GO' }]);
});

test('oportunidades mostra chamada publicada da mesma UF com alface', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const id = gravarChamada(app, CATALAO);
  const rascunho = gravarChamada(app, CATALAO, 'rascunho');
  const outraUf = gravarChamada(app, { ...CATALAO, municipio: 'Uberlândia', uf: 'MG' });
  const token = await app.entrar('ana@demo.br');

  const { status, corpo } = await app.pedir('GET', '/api/agricultor/oportunidades', { token });
  assert.equal(status, 200);
  const ids = corpo.map((o) => o.chamada_id);
  assert.ok(ids.includes(id), 'a chamada publicada de GO aparece');
  assert.ok(!ids.includes(rascunho) && !ids.includes(outraUf), 'rascunho e outra UF não aparecem');

  const catalao = corpo.find((o) => o.chamada_id === id);
  assert.equal(catalao.mesma_cidade, true);
  assert.equal(catalao.versao_regra, 'res4-original'); // publicada até 22/10/2026: a tela avisa "seleção anterior, sem RITS"
  // o cartão mostra a quantidade e a unidade que o edital pede; tomate, que ela não planta, fica fora
  const alface = catalao.itens.find((i) => i.produto_id === 'alface');
  assert.deepEqual([alface.unidade, alface.quantidade_pedida], ['pç', 2280]);
  assert.ok(!catalao.itens.some((i) => i.produto_id === 'tomate'));
  assert.ok(catalao.ganho_total > 0);
});

test('vendido_no_ano_reais de 39000 limita o ganho a R$ 1000', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const id = gravarChamada(app, CATALAO);
  const token = await app.entrar('ana@demo.br');
  const ganho = async (vendido_no_ano_reais) => {
    assert.equal((await app.pedir('PUT', '/api/agricultor/perfil', { corpo: perfilValido({ vendido_no_ano_reais }), token })).status, 200);
    const { corpo } = await app.pedir('GET', '/api/agricultor/oportunidades', { token });
    return corpo.find((o) => o.chamada_id === id);
  };

  // 25 pç por semana × 40 semanas (a chamada não diz as semanas) = 1000 pç, × R$ 7,03 = R$ 7.030
  const livre = await ganho(0);
  assert.deepEqual([livre.ganho_total, livre.itens[0].quantidade_max, livre.itens[0].ganho_estimado], [7030, 1000, 7030]);
  // R$ 39 mil já vendidos: sobra R$ 1 mil do limite anual; o ganho do item não é cortado, só o total
  const perto = await ganho(39000);
  assert.deepEqual([perto.ganho_total, perto.itens[0].ganho_estimado], [1000, 7030]);
});

test('com DATA_REFERENCIA=2026-07-15, a chamada de Catalão aparece para a agricultora de demonstração', async () => {
  for (const [data, aparece] of [['2026-07-15', true], ['2026-11-18', false]]) {
    const app = await subirApp({ env: { DATA_REFERENCIA: data } });
    try {
      const id = gravarChamada(app, CATALAO); // prazo 2026-07-30
      const token = await app.entrar('ana@demo.br');
      const { corpo } = await app.pedir('GET', '/api/agricultor/oportunidades', { token });
      assert.equal(corpo.some((o) => o.chamada_id === id), aparece, data);
    } finally {
      await app.fechar();
    }
  }
});

test('perfilParaIa: só município, UF, produtos, orgânico e se há prioridade, sem dado pessoal nem critério do RITS', () => {
  // controle positivo: a linha de origem tem nome, CPF, CAF, e-mail e os critérios do RITS
  const linha = {
    usuario_id: 5,
    nome: 'Carla Ferreira',
    email: 'carla@demo.br',
    municipio: 'Catalão',
    uf: 'GO',
    cpf: '52998224725',
    caf: CAF,
    grupo_prioritario: '["quilombola"]',
    organico: 0,
    mulher_titular: 0,
    jovem: 0,
    ja_vendeu_pnae: 1,
    cooperativa_id: 2,
    aceite_termo_em: '2026-07-10T10:00:00.000Z',
    vendido_no_ano_reais: 100,
  };
  const produtos = [{ id: 9, agricultor_id: 5, produto_id: 'alface', quantidade_semana: 20, meses_safra: '[1,2,3]' }];
  const esperado = { municipio: 'Catalão', uf: 'GO', produtos: [{ produto_id: 'alface', quantidade_semana: 20, meses_safra: [1, 2, 3] }], organico: false, prioridade_rits: true };
  assert.deepEqual(perfilParaIa(linha, produtos), esperado);
  // sem nenhum ponto do RITS, a prioridade é falsa; o 1 do SQLite vira true
  assert.deepEqual(perfilParaIa({ ...linha, grupo_prioritario: '[]', organico: 1 }, produtos), { ...esperado, organico: true, prioridade_rits: false });
  assert.equal(perfilParaIa({ ...linha, grupo_prioritario: '[]', jovem: 1 }, produtos).prioridade_rits, true);
});

test('assistente não envia dados pessoais para a IA', async (t) => {
  const recebidos = [];
  const app = await subirApp({ ia: { assistente: async (corpo) => (recebidos.push(corpo), RESPOSTA_IA) } });
  t.after(app.fechar);
  const id = gravarChamada(app, CATALAO);
  const token = await app.entrar('carla@demo.br');
  // controle positivo: a Carla tem nome, e-mail, CPF, CAF e critérios do RITS no banco
  const salvo = await app.pedir('PUT', '/api/agricultor/perfil', {
    corpo: perfilValido({ cpf: CPF, caf: CAF, grupo_prioritario: ['quilombola'], mulher_titular: true, jovem: true }),
    token,
  });
  assert.equal(salvo.status, 200);
  const origem = { ...linhaDe(app, 'carla@demo.br'), ...app.db.prepare('SELECT nome, email FROM usuarios WHERE email = ?').get('carla@demo.br') };
  assert.deepEqual(
    [origem.nome, origem.email, origem.cpf, origem.caf, origem.grupo_prioritario, origem.mulher_titular, origem.jovem],
    ['Carla Ferreira', 'carla@demo.br', '52998224725', CAF, '["quilombola"]', 1, 1],
  );

  // a tela manda uma chave a mais numa mensagem: ela não pode passar adiante
  const mensagens = [
    { papel: 'assistente', texto: 'Quanto você colhe por semana?' },
    { papel: 'agricultor', texto: 'consigo 30 por semana de alface', email: 'carla@demo.br' },
  ];
  const resposta = await app.pedir('POST', `/api/agricultor/chamadas/${id}/assistente`, { corpo: { mensagens }, token });
  assert.equal(resposta.status, 200);
  assert.deepEqual(resposta.corpo, RESPOSTA_IA, 'a resposta da IA volta para a tela como veio');

  assert.equal(recebidos.length, 1);
  const [corpo] = recebidos;
  assert.deepEqual(Object.keys(corpo).sort(), ['chamada', 'mensagens', 'perfil']);
  const proibidas = ['nome', 'cpf', 'caf', 'nis', 'email', 'e_mail', 'telefone', 'celular', 'endereco', 'banco', 'agencia', 'conta', 'conta_bancaria', 'pix', 'grupo_prioritario', 'mulher_titular', 'jovem', 'assentado', 'indigena', 'quilombola', 'contato'];
  assert.deepEqual(todasAsChaves(corpo).filter((chave) => proibidas.includes(chave)), []);
  const texto = JSON.stringify(corpo);
  for (const dado of ['52998224725', CPF, CAF, 'Carla Ferreira', 'carla@demo.br', 'quilombola', '3441-0000']) {
    assert.ok(!texto.includes(dado), `${dado} chegou à IA`);
  }
  // o que vai: a chamada sem o contato, o perfil da T4 e só papel e texto de cada mensagem
  const { contato, ...chamadaSemContato } = CATALAO;
  assert.deepEqual(corpo.chamada, chamadaSemContato);
  assert.deepEqual(corpo.perfil, perfilParaIa(linhaDe(app, 'carla@demo.br'), [{ produto_id: 'alface', quantidade_semana: 25, meses_safra: JSON.stringify(TODO_ANO) }]));
  assert.equal(corpo.perfil.prioridade_rits, true);
  assert.deepEqual(corpo.mensagens, mensagens.map(({ papel, texto: conteudo }) => ({ papel, texto: conteudo })));
});

test('assistente: CPF ou e-mail no texto e mensagens fora do formato dão 400 sem chamar a IA; chamada não publicada 404', async (t) => {
  let chamadas = 0;
  const app = await subirApp({ ia: { assistente: async () => (chamadas++, RESPOSTA_IA) } });
  t.after(app.fechar);
  const id = gravarChamada(app, CATALAO);
  const rascunho = gravarChamada(app, CATALAO, 'rascunho');
  const token = await app.entrar('ana@demo.br');
  // a Ana com o CAF no banco: o número dela escrito no chat também é barrado
  assert.equal((await app.pedir('PUT', '/api/agricultor/perfil', { corpo: perfilValido({ caf: CAF }), token })).status, 200);
  const perguntar = (mensagens, chamada = id) => app.pedir('POST', `/api/agricultor/chamadas/${chamada}/assistente`, { corpo: { mensagens }, token });
  const doAgricultor = (texto) => [{ papel: 'agricultor', texto }];

  const invalidas = {
    'CPF com máscara': doAgricultor('meu cpf é 529.982.247-25'),
    'CPF só com números': doAgricultor('52998224725'),
    'e-mail': doAgricultor('me escreve em ana@demo.br'),
    'o CAF dela': doAgricultor(`meu caf é ${CAF.toLowerCase()}`),
    'CPF numa mensagem antiga': [{ papel: 'agricultor', texto: 'cpf 529.982.247-25' }, { papel: 'assistente', texto: 'Não escreva o CPF.' }, { papel: 'agricultor', texto: 'ok' }],
    'sem lista': 'oi',
    'papel desconhecido': [{ papel: 'sistema', texto: 'oi' }],
    'texto vazio': doAgricultor('   '),
    'texto que não é texto': [{ papel: 'agricultor', texto: 30 }],
    'a última é do assistente': [{ papel: 'agricultor', texto: 'oi' }, { papel: 'assistente', texto: 'olá' }],
  };
  for (const [caso, mensagens] of Object.entries(invalidas)) {
    const resposta = await perguntar(mensagens);
    assert.equal(resposta.status, 400, caso);
    assert.ok(resposta.corpo.erro, caso);
  }
  assert.equal(chamadas, 0, 'nada chegou à IA');

  // controles: quantidades e a primeira pergunta (lista vazia) passam
  assert.equal((await perguntar(doAgricultor('consigo 1.200 pés, 25 por semana, a R$ 7,03'))).status, 200);
  assert.equal((await perguntar([])).status, 200);
  assert.equal(chamadas, 2);
  assert.equal((await perguntar([], rascunho)).status, 404);
  assert.equal((await perguntar([], 99999)).status, 404);
  assert.equal(chamadas, 2);
});

test('assistente com a IA fora do ar devolve 502 com mensagem em português', async (t) => {
  const app = await subirApp({ ia: criarClienteIa(`http://127.0.0.1:${await portaSemNinguem()}`) });
  t.after(app.fechar);
  const id = gravarChamada(app, CATALAO);
  const token = await app.entrar('ana@demo.br');
  const { status, corpo } = await app.pedir('POST', `/api/agricultor/chamadas/${id}/assistente`, { corpo: { mensagens: [] }, token });
  assert.equal(status, 502);
  assert.deepEqual(corpo, { erro: 'O serviço de IA não respondeu. Tente de novo em instantes.' });
});

// A IA da T4 barra dado pessoal no texto do chat com 400 { erro, campos }: aqui, uma IA de mentira em HTTP, com o cliente de verdade.
test('assistente: o 400 da IA com campos vira uma frase em português na tela, e o texto não é enviado de novo', async (t) => {
  let resposta;
  let pedidos = 0;
  const iaFalsa = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      pedidos++;
      res.writeHead(resposta[0], { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(resposta[1]));
    });
  });
  await new Promise((resolve) => iaFalsa.listen(0, '127.0.0.1', resolve));
  t.after(() => iaFalsa.close());
  const ia = criarClienteIa(`http://127.0.0.1:${iaFalsa.address().port}`);
  const barrou = (campos) => [400, { erro: 'dados pessoais não são aceitos', campos }];

  // o cliente guarda os `campos` no erro (antes só ficava a mensagem da IA)
  resposta = barrou(['email', 'telefone']);
  await assert.rejects(ia.assistente({}), (erro) => {
    assert.deepEqual([erro.status, erro.message, erro.campos], [400, 'dados pessoais não são aceitos', ['email', 'telefone']]);
    return true;
  });
  resposta = [400, { erro: 'sem campos', campos: 'cpf' }]; // `campos` que não é lista não vale
  await assert.rejects(ia.assistente({}), (erro) => erro.status === 400 && erro.message === 'sem campos' && erro.campos === undefined);
  pedidos = 0;

  const app = await subirApp({ ia });
  t.after(app.fechar);
  const id = gravarChamada(app, CATALAO);
  const token = await app.entrar('ana@demo.br');
  const texto = 'consigo 30 por semana, meu zap é (64) 99999-8888'; // o app só barra CPF, e-mail e o CAF: o telefone é com a IA
  const perguntar = () => app.pedir('POST', `/api/agricultor/chamadas/${id}/assistente`, { corpo: { mensagens: [{ papel: 'agricultor', texto }] }, token });

  const frases = [
    [['telefone'], 'Tire o telefone do texto e envie de novo.'],
    [['email', 'telefone'], 'Tire o e-mail e o telefone do texto e envie de novo.'],
    [['banco', 'cpf', 'email', 'telefone'], 'Tire os dados do banco, o CPF, o e-mail e o telefone do texto e envie de novo.'],
    [['cpf'], 'Tire o CPF do texto e envie de novo.'],
    [['banco'], 'Tire os dados do banco do texto e envie de novo.'],
    [['nome', 'caf'], 'Tire os dados pessoais do texto e envie de novo.'], // chave que o app nunca manda, mas a IA sabe barrar
  ];
  for (const [campos, frase] of frases) {
    resposta = barrou(campos);
    const { status, corpo } = await perguntar();
    assert.deepEqual([status, corpo], [400, { erro: frase }], campos.join(','));
  }
  assert.equal(pedidos, frases.length, 'um pedido à IA por pergunta: o app não envia de novo sozinho');

  // sem `campos` (ou com a lista vazia) o erro da IA passa como veio
  for (const corpoDaIa of [{ erro: 'envie chamada, perfil e mensagens' }, { erro: 'dados pessoais não são aceitos', campos: [] }]) {
    resposta = [400, corpoDaIa];
    const { status, corpo } = await perguntar();
    assert.deepEqual([status, corpo], [400, { erro: corpoDaIa.erro }]);
  }
  // erro da própria IA (500, que o cliente troca por 502) não vira pedido para tirar dado, mesmo com `campos`
  resposta = [500, { erro: 'erro interno da IA', campos: ['cpf'] }];
  const falha = await perguntar();
  assert.deepEqual([falha.status, falha.corpo], [502, { erro: 'erro interno da IA' }]);
  // controle: a mesma pergunta sem dado barrado volta com a resposta da IA
  resposta = [200, RESPOSTA_IA];
  assert.deepEqual((await perguntar()).corpo, RESPOSTA_IA);
});

test('a tela da chamada recebe a chamada publicada; rascunho e inexistente dão 404', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const id = gravarChamada(app, CATALAO);
  const rascunho = gravarChamada(app, CATALAO, 'rascunho');
  const token = await app.entrar('ana@demo.br');
  const { status, corpo } = await app.pedir('GET', `/api/agricultor/chamadas/${id}`, { token });
  assert.equal(status, 200);
  assert.deepEqual(corpo, { ...CATALAO, id });
  assert.equal((await app.pedir('GET', `/api/agricultor/chamadas/${rascunho}`, { token })).status, 404);
  assert.equal((await app.pedir('GET', '/api/agricultor/chamadas/99999', { token })).status, 404);
});

test('interesse grava, substitui o anterior e recusa item fora da chamada', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const id = gravarChamada(app, CATALAO);
  const semMandioca = gravarChamada(app, { ...CATALAO, itens: CATALAO.itens.filter((i) => i.produto_id !== 'mandioca') });
  const rascunho = gravarChamada(app, CATALAO, 'rascunho');
  const ana = await app.entrar('ana@demo.br');
  const elisa = await app.entrar('elisa@demo.br'); // também planta alface
  const enviar = (itens, { chamada = id, token = ana } = {}) => app.pedir('POST', `/api/agricultor/chamadas/${chamada}/interesse`, { corpo: { itens }, token });
  const interesses = (email, chamada = id) =>
    app.db
      .prepare('SELECT produto_id, quantidade FROM interesses WHERE agricultor_id = ? AND chamada_id = ? ORDER BY id')
      .all(idDe(app, email), chamada)
      .map((linha) => [linha.produto_id, linha.quantidade]);

  assert.equal((await enviar([{ produto_id: 'alface', quantidade: 300 }], { token: elisa })).status, 200);
  const primeiro = await enviar([{ produto_id: 'alface', quantidade: 600 }, { produto_id: 'mandioca', quantidade: 800.5 }]);
  assert.equal(primeiro.status, 200);
  assert.deepEqual(primeiro.corpo, { itens: [{ produto_id: 'alface', quantidade: 600 }, { produto_id: 'mandioca', quantidade: 800.5 }] });
  assert.deepEqual(interesses('ana@demo.br'), [['alface', 600], ['mandioca', 800.5]]);

  // o novo interesse da Ana substitui o dela, e o da Elisa fica
  assert.equal((await enviar([{ produto_id: 'alface', quantidade: 900 }])).status, 200);
  assert.deepEqual(interesses('ana@demo.br'), [['alface', 900]]);
  assert.deepEqual(interesses('elisa@demo.br'), [['alface', 300]]);

  const recusados = {
    'tomate: está na chamada, mas ela não planta': [[{ produto_id: 'tomate', quantidade: 10 }]],
    'mandioca: ela planta, mas a chamada não pede': [[{ produto_id: 'mandioca', quantidade: 10 }], { chamada: semMandioca }],
    'quantidade 0': [[{ produto_id: 'alface', quantidade: 0 }]],
    'quantidade negativa': [[{ produto_id: 'alface', quantidade: -5 }]],
    'quantidade em texto': [[{ produto_id: 'alface', quantidade: '10' }]],
    'produto repetido': [[{ produto_id: 'alface', quantidade: 1 }, { produto_id: 'alface', quantidade: 2 }]],
    'lista vazia': [[]],
    'sem lista': [undefined],
    'item que não é objeto': [['alface']],
  };
  for (const [caso, [itens, opcoes]] of Object.entries(recusados)) {
    assert.equal((await enviar(itens, opcoes)).status, 400, caso);
  }
  assert.deepEqual(interesses('ana@demo.br'), [['alface', 900]], 'o pedido recusado não apaga o interesse de antes');
  assert.deepEqual(interesses('ana@demo.br', semMandioca), []);

  assert.equal((await enviar([{ produto_id: 'alface', quantidade: 1 }], { chamada: rascunho })).status, 404);
  assert.equal((await enviar([{ produto_id: 'alface', quantidade: 1 }], { chamada: 99999 })).status, 404);
  assert.deepEqual(interesses('ana@demo.br', rascunho), []);
});

test('prefeitura não acessa rota de agricultor (403)', async (t) => {
  const app = await subirApp();
  t.after(app.fechar);
  const id = gravarChamada(app, CATALAO);
  const rotas = [
    ['GET', '/api/agricultor/perfil'],
    ['PUT', '/api/agricultor/perfil', perfilValido()],
    ['GET', '/api/agricultor/cooperativas'],
    ['GET', '/api/agricultor/oportunidades'],
    ['GET', `/api/agricultor/chamadas/${id}`],
    ['POST', `/api/agricultor/chamadas/${id}/assistente`, { mensagens: [] }],
    ['POST', `/api/agricultor/chamadas/${id}/interesse`, { itens: [{ produto_id: 'alface', quantidade: 1 }] }],
  ];
  const prefeitura = await app.entrar('prefeitura@demo.br');
  const cooperativa = await app.entrar('cooperativa@demo.br');
  const contarInteresses = () => app.db.prepare('SELECT COUNT(*) AS n FROM interesses').get().n;
  const antes = contarInteresses(); // a semente da T9 já grava os interesses dos seis agricultores: o que vale é não crescer
  for (const [metodo, caminho, corpo] of rotas) {
    assert.equal((await app.pedir(metodo, caminho, { corpo, token: prefeitura })).status, 403, `${metodo} ${caminho}`);
    assert.equal((await app.pedir(metodo, caminho, { corpo, token: cooperativa })).status, 403, `${metodo} ${caminho}`);
    assert.equal((await app.pedir(metodo, caminho, { corpo })).status, 401, `${metodo} ${caminho} sem login`);
  }
  assert.equal(contarInteresses(), antes, 'nenhuma das rotas recusadas gravou interesse');
});
