// Build das telas: o código-fonte fica em web/ (um .html por página) e o `vite build` gera public/,
// que o servidor http serve. O `npm start` e o `npm test` rodam o build antes.
// Em CommonJS, como o resto do app: escrito com import, o Vite avisa que o arquivo é carregado como CommonJS.
const path = require('node:path');
const { defineConfig } = require('vite');
const { svelte } = require('@sveltejs/vite-plugin-svelte');

const WEB = path.join(__dirname, 'web');

module.exports = defineConfig({
  root: WEB,
  publicDir: 'public', // web/public/ vai para o build como está: /css/estilo.css continua com a mesma URL
  // configFile: false porque não há svelte.config.js (sem isso, o plugin avisa a cada build); só runes ($state, $props...)
  plugins: [svelte({ configFile: false, compilerOptions: { runes: true } })],
  build: {
    outDir: '../public', // app/public/, apagada e refeita a cada build
    emptyOutDir: true,
    // rolldownOptions é o rollupOptions do Vite 8 (o nome antigo ainda funciona, mas está obsoleto)
    rolldownOptions: {
      // Página nova: web/<pagina>.html entra aqui, senão o build não a gera.
      input: {
        index: path.join(WEB, 'index.html'),
      },
    },
  },
});
