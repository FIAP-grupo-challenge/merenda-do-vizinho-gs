<!-- Tela do agricultor (/agricultor.html): as Oportunidades (chamadas abertas para o que ele planta) e Meu sítio (o perfil).
     /agricultor.html#sitio abre direto em Meu sítio. -->
<script>
  import { api, sair } from '../lib/api.js';
  import CampoNumero from '../lib/CampoNumero.svelte';
  import Ouvir from '../lib/Ouvir.svelte';
  import { data, escreverNumero, lerNumero, numero, reais } from '../lib/formato.js';

  const ABAS = [
    { id: 'oportunidades', nome: 'Oportunidades' },
    { id: 'sitio', nome: 'Meu sítio' },
  ];
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const GRUPOS = [
    ['assentado', 'Assentado ou assentada da reforma agrária'],
    ['indigena', 'Indígena'],
    ['quilombola', 'Quilombola'],
  ];

  let aba = $state(location.hash === '#sitio' ? 'sitio' : 'oportunidades');
  let perfil = $state(null); // como veio do servidor, com CPF e CAF mascarados
  let form = $state(null); // o formulário de Meu sítio
  let catalogo = $state([]);
  let cooperativas = $state([]);
  let lista = $state([]); // as oportunidades
  let erro = $state('');
  let erroForm = $state('');
  let salvo = $state('');
  let salvando = $state(false);

  // sem município, UF e produtos não há com o que casar as chamadas
  const completo = $derived(Boolean(perfil?.municipio && perfil.uf && perfil.produtos.length));

  // CPF e CAF começam em branco: só vão no envio quando a pessoa escreve um novo.
  // As listas são cópias: mexer no formulário não muda o perfil salvo antes de salvar.
  // Os números ficam como texto ("1234,5", como a pessoa escreve), e salvar() os transforma de volta.
  function paraFormulario(p) {
    return {
      municipio: p.municipio ?? '',
      uf: p.uf ?? '',
      cpf: '',
      caf: '',
      cooperativa_id: p.cooperativa_id === null ? '' : String(p.cooperativa_id),
      vendido_no_ano_reais: escreverNumero(p.vendido_no_ano_reais),
      ja_vendeu_pnae: p.ja_vendeu_pnae,
      organico: p.organico,
      mulher_titular: p.mulher_titular,
      jovem: p.jovem,
      grupo_prioritario: $state.snapshot(p.grupo_prioritario),
      produtos: $state.snapshot(p.produtos).map((produto) => ({ ...produto, quantidade_semana: escreverNumero(produto.quantidade_semana) })),
      aceite_termo: false,
    };
  }

  async function carregar() {
    try {
      const [p, c, co, o] = await Promise.all([
        api('GET', '/api/agricultor/perfil'),
        api('GET', '/api/catalogo'),
        api('GET', '/api/agricultor/cooperativas'),
        api('GET', '/api/agricultor/oportunidades'),
      ]);
      catalogo = c.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      cooperativas = co;
      lista = o;
      perfil = p;
      form = paraFormulario(p);
      if (!completo) aba = 'sitio';
    } catch (falha) {
      erro = falha.message;
    }
  }
  carregar();

  // Abas: clique, ou setas do teclado com o foco numa aba
  function teclar(evento, i) {
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[evento.key];
    if (!passo) return;
    aba = ABAS[(i + passo + ABAS.length) % ABAS.length].id;
    document.getElementById(`aba-${aba}`).focus();
  }

  // O botão não fica "disabled" enquanto salva (o foco se perderia, e depois de um erro o teclado voltaria ao início da página):
  // o segundo toque é ignorado aqui. Número que não deu para ler já deixou o campo inválido, e o formulário nem chega aqui.
  async function salvar(evento) {
    evento.preventDefault();
    if (salvando) return;
    erroForm = '';
    salvo = '';
    salvando = true;
    const { cpf, caf, cooperativa_id, vendido_no_ano_reais, produtos, ...resto } = $state.snapshot(form);
    const corpo = {
      ...resto,
      cooperativa_id: cooperativa_id === '' ? null : Number(cooperativa_id),
      vendido_no_ano_reais: lerNumero(vendido_no_ano_reais).valor,
      produtos: produtos.map((produto) => ({ ...produto, quantidade_semana: lerNumero(produto.quantidade_semana).valor })),
    };
    if (cpf.trim()) corpo.cpf = cpf.trim();
    if (caf.trim()) corpo.caf = caf.trim();
    try {
      perfil = await api('PUT', '/api/agricultor/perfil', corpo);
      form = paraFormulario(perfil);
      salvo = 'Pronto: o seu sítio foi salvo.';
      lista = await api('GET', '/api/agricultor/oportunidades');
    } catch (falha) {
      erroForm = falha.message;
    }
    salvando = false;
  }

  // a soma dos itens passa do total quando o limite anual corta o ganho (o ganho de cada item não é cortado)
  const cortado = (o) => Math.round(o.itens.reduce((soma, item) => soma + item.ganho_estimado, 0) * 100) > Math.round(o.ganho_total * 100);
</script>

<header class="topo">
  <h1>Merenda do Vizinho</h1>
  <button type="button" class="botao-secundario" onclick={sair}>Sair</button>
</header>

<main>
  <p class="erro" role="alert">{erro}</p>

  {#if form}
    <div class="abas" role="tablist" aria-label="Partes da sua conta">
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

    <div class="cartao painel" role="tabpanel" id="painel-oportunidades" aria-labelledby="aba-oportunidades" hidden={aba !== 'oportunidades'}>
      <h2>Chamadas abertas para você</h2>
      {#if !completo}
        <p>Para ver as chamadas da merenda, conte em Meu sítio onde fica o seu sítio e o que você planta.</p>
        <button type="button" onclick={() => (aba = 'sitio')}>Abrir Meu sítio</button>
      {:else if lista.length === 0}
        <p id="sem-chamadas">Agora não há chamada aberta no seu estado para o que você planta. Volte outro dia.</p>
        <Ouvir alvo="sem-chamadas" />
      {:else}
        <div class="lista">
          {#each lista as o (o.chamada_id)}
            <article class="oportunidade" aria-labelledby="titulo-{o.chamada_id}">
              <div id="oportunidade-{o.chamada_id}">
                <h3 id="titulo-{o.chamada_id}">Chamada de {o.municipio ?? 'cidade sem nome'} ({o.uf})</h3>
                {#if o.mesma_cidade}
                  <p class="selo">Na sua cidade: quem é da cidade tem prioridade</p>
                {/if}
                <p class="ganho">Você pode ganhar até <strong>{reais(o.ganho_total)}</strong></p>
                {#if cortado(o)}
                  <p>O limite anual corta o total. Neste ano ainda sobram {reais(o.ganho_total)} do seu limite de vendas para a merenda.</p>
                {/if}
                <p>Entregue o projeto de venda até {o.prazo_envio ? data(o.prazo_envio) : 'a data do edital'}.</p>
                <ul>
                  {#each o.itens as item}
                    <li>{item.produto}: a prefeitura pede {numero(item.quantidade_pedida)} {item.unidade}.</li>
                  {/each}
                </ul>
                {#if o.versao_regra === 'res4-original'}
                  <p class="aviso">Seleção anterior, sem RITS: este edital saiu até 22/10/2026, então a seleção segue a regra antiga, sem os pontos de prioridade.</p>
                {/if}
              </div>
              <div class="acoes">
                <Ouvir alvo="oportunidade-{o.chamada_id}" />
                <a class="botao" href="/chamada.html?id={o.chamada_id}">Ver a chamada e o assistente</a>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </div>

    <div class="cartao painel" role="tabpanel" id="painel-sitio" aria-labelledby="aba-sitio" hidden={aba !== 'sitio'}>
      <form class="estreita" onsubmit={salvar}>
        <h2>Meu sítio</h2>
        <p id="sobre-sitio">Conte onde fica o seu sítio e o que você planta. Assim o app mostra as chamadas da merenda que combinam com você e quanto você pode ganhar.</p>
        <Ouvir alvo="sobre-sitio" />

        <label for="municipio">Município do sítio</label>
        <input id="municipio" bind:value={form.municipio} autocomplete="address-level2" maxlength="100" required>

        <label for="uf">UF</label>
        <select id="uf" bind:value={form.uf} required>
          <option value="">Escolha a UF</option>
          {#each UFS as uf}<option>{uf}</option>{/each}
        </select>

        <label for="cpf">CPF</label>
        <input id="cpf" bind:value={form.cpf} inputmode="numeric" autocomplete="off" aria-describedby="dica-cpf">
        <p class="dica" id="dica-cpf">
          {perfil.cpf ? `Guardado: ${perfil.cpf}. Escreva só para trocar.` : 'Os 11 números, com ou sem pontos e traço.'} O CPF não vai para a IA.
        </p>

        <label for="caf">Número do CAF</label>
        <input id="caf" bind:value={form.caf} autocomplete="off" aria-describedby="dica-caf">
        <p class="dica" id="dica-caf">
          {perfil.caf ? `Guardado: ${perfil.caf}. Escreva só para trocar.` : 'Como está no extrato do CAF.'} O CAF não vai para a IA.
        </p>

        <label for="cooperativa">Cooperativa</label>
        <select id="cooperativa" bind:value={form.cooperativa_id} aria-describedby="dica-cooperativa">
          <option value="">Não participo de cooperativa</option>
          {#each cooperativas as c (c.id)}
            <option value={String(c.id)}>{c.nome} ({c.municipio}-{c.uf})</option>
          {/each}
        </select>
        <p class="dica" id="dica-cooperativa">A cooperativa junta o que os cooperados querem vender numa proposta só.</p>

        <label for="vendido">Quanto você já vendeu para a merenda neste ano (R$)</label>
        <CampoNumero id="vendido" bind:texto={form.vendido_no_ano_reais} formato={reais} descricao="dica-vendido" required />
        <p class="dica" id="dica-vendido">Cada agricultor tem um limite de venda por ano, e o app desconta o que você já vendeu. Se ainda não vendeu, deixe 0.</p>

        <fieldset>
          <legend>Sobre a sua produção</legend>
          <label class="opcao"><input type="checkbox" bind:checked={form.organico}> A produção é orgânica ou agroecológica</label>
          <label class="opcao"><input type="checkbox" bind:checked={form.ja_vendeu_pnae}> Já vendi para a merenda escolar (PNAE) antes</label>
        </fieldset>

        <fieldset aria-describedby="dica-rits">
          <legend>Prioridade na seleção (RITS)</legend>
          <p class="dica" id="dica-rits">Marque o que vale para você, como está no seu CAF. Isso dá pontos de prioridade. A IA só fica sabendo se você tem prioridade (sim ou não), não qual.</p>
          <label class="opcao"><input type="checkbox" bind:checked={form.mulher_titular}> Mulher agricultora, titular no CAF</label>
          <label class="opcao"><input type="checkbox" bind:checked={form.jovem}> Jovem, de 15 a 29 anos</label>
          {#each GRUPOS as [valor, rotulo]}
            <label class="opcao"><input type="checkbox" value={valor} bind:group={form.grupo_prioritario}> {rotulo}</label>
          {/each}
        </fieldset>

        <fieldset>
          <legend>O que você planta</legend>
          <p class="dica">Escreva a quantidade por semana na unidade que a prefeitura usa no edital (quilo, maço, peça...).</p>
          {#each form.produtos as produto, i (produto)}
            <fieldset class="produto">
              <legend>Produto {i + 1}</legend>
              <label for="produto-{i}">Produto</label>
              <select id="produto-{i}" bind:value={produto.produto_id} required>
                <option value="">Escolha o produto</option>
                {#each catalogo as c (c.id)}<option value={c.id}>{c.nome}</option>{/each}
              </select>

              <label for="quantidade-{i}">Quanto colhe por semana</label>
              <CampoNumero id="quantidade-{i}" bind:texto={produto.quantidade_semana} required />

              <fieldset>
                <legend>Meses de colheita</legend>
                <div class="meses">
                  {#each MESES as mes, m}
                    <label class="opcao"><input type="checkbox" value={m + 1} bind:group={produto.meses_safra}> {mes}</label>
                  {/each}
                </div>
              </fieldset>

              <button type="button" class="botao-secundario" onclick={() => form.produtos.splice(i, 1)}>Tirar o produto {i + 1}</button>
            </fieldset>
          {/each}
          <button
            type="button"
            class="botao-secundario adicionar"
            onclick={() => form.produtos.push({ produto_id: '', quantidade_semana: '', meses_safra: MESES.map((_, m) => m + 1) })}>Adicionar produto</button>
        </fieldset>

        {#if perfil.aceite_termo_em}
          <p class="dica">Você aceitou o termo de uso dos dados em {data(perfil.aceite_termo_em)}.</p>
        {:else}
          <div class="termo">
            <h3>Termo de uso dos dados</h3>
            <ul id="texto-termo">
              <li>O app guarda os dados do seu sítio para mostrar as chamadas da merenda e montar o projeto de venda.</li>
              <li>O CPF e o CAF aparecem na tela só em parte. No projeto de venda, o CPF e o CAF aparecem só em parte: você escreve o número completo à mão.</li>
              <li>As respostas sobre prioridade (mulher, jovem, assentado, indígena e quilombola) servem só para a seleção.</li>
              <li>O assistente com IA recebe só o município, a UF, os produtos (com a quantidade por semana e os meses de colheita), se a produção é orgânica e se você tem prioridade (sim ou não).</li>
              <li>Ele não recebe o seu nome, CPF, CAF nem e-mail. O que você escrever no chat também vai para a IA: não escreva nome, telefone, e-mail nem CPF.</li>
              <li>A sua cooperativa vê o que você quer vender. As estatísticas do app usam os números sem o seu nome, CPF ou CAF.</li>
            </ul>
            <Ouvir alvo="texto-termo" />
            <label class="opcao"><input type="checkbox" bind:checked={form.aceite_termo} required> Li e aceito o termo</label>
          </div>
        {/if}

        <p class="erro" role="alert">{erroForm}</p>
        <p role="status">{salvo}</p>
        <button type="submit" aria-disabled={salvando}>Salvar meu sítio</button>
      </form>
    </div>
  {:else if !erro}
    <p>Carregando...</p>
  {/if}
</main>

<style>
  /* salvando: o botão continua com o foco (disabled o tiraria), mas parece desligado, como o button:disabled do estilo.css */
  button[aria-disabled='true'] {
    opacity: 0.6;
    cursor: wait;
  }

  /* com o recuo padrão do botão, "Oportunidades" não cabe na aba a 375 px e quebra no meio da palavra */
  [role='tab'] {
    padding-right: 0.5rem;
    padding-left: 0.5rem;
  }

  .lista {
    display: grid;
    gap: 1rem;
  }

  .oportunidade {
    padding: 1rem;
    border: 2px solid var(--linha);
    border-radius: 12px;
  }

  .oportunidade h3 {
    margin-top: 0;
  }

  .selo {
    display: inline-block;
    margin: 0;
    padding: 0.1rem 0.75rem;
    border-radius: 12px;
    background: var(--verde);
    color: #ffffff;
    font-weight: 700;
  }

  .ganho {
    font-size: 1.3rem;
  }

  /* contraste do texto escuro no amarelo-claro: mais de 15:1 */
  .aviso {
    padding: 0.5rem 0.75rem;
    border-left: 6px solid #8a5a00;
    background: #fff8e1;
  }

  .acoes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .produto {
    margin-top: 1rem;
    padding: 0 1rem 1rem;
    border: 2px solid var(--linha);
    border-radius: 8px;
  }

  .meses {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    column-gap: 0.5rem;
  }

  .adicionar {
    margin-top: 1rem;
  }

  .termo {
    margin-top: 1rem;
    padding: 0.5rem 1rem 1rem;
    border-radius: 8px;
    background: var(--fundo-suave);
  }

  @media (min-width: 768px) {
    .lista {
      grid-template-columns: repeat(2, 1fr);
    }

    .meses {
      grid-template-columns: repeat(6, 1fr);
    }
  }
</style>
