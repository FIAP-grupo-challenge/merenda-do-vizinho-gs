<!-- Tela de entrar e de criar conta (/ e /index.html). -->
<script>
  import { api } from '../lib/api.js';
  import Marca from '../lib/Marca.svelte';
  import Ouvir from '../lib/Ouvir.svelte';

  // quem abre a tela de entrar começa sem sessão (um token velho não atrapalha o login)
  localStorage.removeItem('token');

  const ABAS = [
    { id: 'entrar', nome: 'Entrar' },
    { id: 'cadastrar', nome: 'Cadastrar' },
  ];
  let aba = $state('entrar');
  let papel = $state('agricultor');
  const erro = $state({ entrar: '', cadastrar: '' });
  const enviando = $state({ entrar: false, cadastrar: false });

  // Abas: clique, ou setas do teclado com o foco numa aba
  function teclar(evento, i) {
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[evento.key];
    if (!passo) return;
    aba = ABAS[(i + passo + ABAS.length) % ABAS.length].id;
    document.getElementById(`aba-${aba}`).focus();
  }

  // Entrar e Cadastrar devolvem o token; depois, cada papel vai para a sua tela (/agricultor.html etc.)
  async function enviar(evento, caminho, qual) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));
    enviando[qual] = true;
    erro[qual] = '';
    try {
      const resposta = await api('POST', caminho, dados);
      localStorage.setItem('token', resposta.token);
      location.href = `/${resposta.papel || dados.papel}.html`;
    } catch (falha) {
      erro[qual] = falha.message;
      enviando[qual] = false;
    }
  }
</script>

<!-- a capa: o prato grande, como na abertura do pitch -->
<header class="topo capa">
  <Marca fileiras={7} />
  <h1>Colhe</h1>
  <p class="dica">da roça para a merenda</p>
</header>

<main class="estreita">
  <section class="abertura" aria-label="Sobre o app">
    <p id="apresentacao">Aqui, quem planta vende para a merenda das escolas da cidade. A prefeitura mostra o que precisa comprar, o agricultor diz o que tem para vender e a cooperativa junta tudo numa proposta.</p>
    <Ouvir alvo="apresentacao" />
  </section>

  <div class="abas" role="tablist" aria-label="Entrar ou criar conta">
    {#each ABAS as { id, nome }, i}
      <button
        type="button"
        role="tab"
        id="aba-{id}"
        aria-controls="painel-{id}"
        aria-selected={aba === id}
        tabindex={aba === id ? 0 : -1}
        onclick={() => (aba = id)}
        onkeydown={(evento) => teclar(evento, i)}>{nome}</button>
    {/each}
  </div>

  <div class="cartao painel" role="tabpanel" id="painel-entrar" aria-labelledby="aba-entrar" hidden={aba !== 'entrar'}>
    <form onsubmit={(evento) => enviar(evento, '/api/login', 'entrar')}>
      <label for="entrar-email">E-mail</label>
      <input id="entrar-email" name="email" type="email" autocomplete="username" required>

      <label for="entrar-senha">Senha</label>
      <input id="entrar-senha" name="senha" type="password" autocomplete="current-password" required>

      <p class="erro" role="alert">{erro.entrar}</p>
      <button type="submit" disabled={enviando.entrar}>Entrar</button>
    </form>
  </div>

  <div class="cartao painel" role="tabpanel" id="painel-cadastrar" aria-labelledby="aba-cadastrar" hidden={aba !== 'cadastrar'}>
    <form onsubmit={(evento) => enviar(evento, '/api/cadastro', 'cadastrar')}>
      <fieldset>
        <legend>Você é:</legend>
        <label class="opcao"><input type="radio" name="papel" value="agricultor" bind:group={papel}> Agricultor ou agricultora</label>
        <label class="opcao"><input type="radio" name="papel" value="cooperativa" bind:group={papel}> Cooperativa</label>
        <label class="opcao"><input type="radio" name="papel" value="prefeitura" bind:group={papel}> Prefeitura</label>
      </fieldset>

      <label for="cad-nome">Nome</label>
      <input id="cad-nome" name="nome" autocomplete="name" maxlength="120" required aria-describedby="dica-nome">
      <p class="dica" id="dica-nome">O seu nome, ou o nome da cooperativa ou da prefeitura.</p>

      <label for="cad-email">E-mail</label>
      <input id="cad-email" name="email" type="email" autocomplete="email" required>

      <label for="cad-senha">Senha</label>
      <input id="cad-senha" name="senha" type="password" autocomplete="new-password" minlength="8" required aria-describedby="dica-senha">
      <p class="dica" id="dica-senha">Pelo menos 8 letras ou números.</p>

      <!-- disabled: escondidos, estes campos também não vão no envio (o FormData pula campo desligado) -->
      <fieldset hidden={papel !== 'cooperativa'} disabled={papel !== 'cooperativa'}>
        <legend>Dados da cooperativa</legend>

        <label for="cad-cnpj">CNPJ</label>
        <input id="cad-cnpj" name="cnpj" inputmode="numeric" autocomplete="off" required aria-describedby="dica-cnpj">
        <p class="dica" id="dica-cnpj">14 números, com ou sem pontos e barra.</p>

        <label for="cad-municipio">Município</label>
        <input id="cad-municipio" name="municipio" autocomplete="address-level2" maxlength="100" required>

        <label for="cad-uf">UF</label>
        <select id="cad-uf" name="uf" required>
          <option value="">Escolha a UF</option>
          <option>AC</option><option>AL</option><option>AP</option><option>AM</option><option>BA</option>
          <option>CE</option><option>DF</option><option>ES</option><option>GO</option><option>MA</option>
          <option>MT</option><option>MS</option><option>MG</option><option>PA</option><option>PB</option>
          <option>PR</option><option>PE</option><option>PI</option><option>RJ</option><option>RN</option>
          <option>RS</option><option>RO</option><option>RR</option><option>SC</option><option>SP</option>
          <option>SE</option><option>TO</option>
        </select>
      </fieldset>

      <p class="erro" role="alert">{erro.cadastrar}</p>
      <button type="submit" disabled={enviando.cadastrar}>Criar conta</button>
    </form>
  </div>
</main>
