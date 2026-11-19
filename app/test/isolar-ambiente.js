// Carregado pelo `npm test` (node --require) antes de cada arquivo de teste: a SEMANAS_PADRAO exportada no terminal não vale.
// O regras-pnae.js lê a variável quando é importado (40 semanas sem ela), e com 36 oito testes falham, e com "abc" o arquivo cai.
// O teste da variável (regras-pnae.test.js) a passa de propósito a um processo filho.
delete process.env.SEMANAS_PADRAO;
