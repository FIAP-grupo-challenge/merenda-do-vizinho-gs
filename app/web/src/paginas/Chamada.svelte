<!-- Tela de uma chamada (/chamada.html?id=N): o resumo, o assistente, os documentos e o que o agricultor quer vender.
     "Quero participar" grava o interesse para a proposta da cooperativa; a proposta individual abre /projeto-venda.html. -->
<script>
  import { api, sair } from '../lib/api.js';
  import Ouvir from '../lib/Ouvir.svelte';
  import { data, numero } from '../lib/formato.js';

  const id = encodeURIComponent(new URLSearchParams(location.search).get('id') ?? '');

  let chamada = $state(null);
  let perfil = $state(null);
  let erro = $state('');
  let mensagens = $state([]); // a conversa: { papel: 'agricultor' ou 'assistente', texto }
  let pergunta = $state('');
  let pensando = $state(false);
  let erroChat = $state('');
  let checklist = $state([]); // a lista da IA, para quando a chamada não traz a dela
  let chaveDocumentos = $state(''); // as caixas "já tenho" ficam neste navegador, por agricultor e por chamada
  let tenho = $state([]);
  let quantidades = $state({}); // produto_id -> quanto ele quer vender
  let erroOferta = $state('');
  let pronto = $state('');
  let enviando = $state(false);

  const documentos = $derived(chamada?.documentos_exigidos?.length ? chamada.documentos_exigidos : checklist);
  const faltam = $derived(documentos.filter((documento) => !tenho.includes(documento)).length);
  // um campo por produto que ele planta: o interesse é por produto, e Catalão pede abóbora em dois itens
  const campos = $derived.by(() => {
    const meus = new Set(perfil?.produtos.map((produto) => produto.produto_id));
    const porProduto = new Map();
    for (const item of chamada?.itens ?? []) {
      if (!meus.has(item.produto_id) || !(item.quantidade > 0)) continue;
      const campo = porProduto.get(item.produto_id) ?? { produto_id: item.produto_id, nomes: [], pedidos: [] };
      campo.nomes.push(item.produto);
      campo.pedidos.push(`${numero(item.quantidade)} ${item.unidade}`);
      porProduto.set(item.produto_id, campo);
    }
    return [...porProduto.values()];
  });

  function lerTenho() {
    try {
      return JSON.parse(localStorage.getItem(chaveDocumentos)) ?? [];
    } catch {
      return []; // valor estragado: começa de novo
    }
  }
  $effect(() => {
    if (chaveDocumentos) localStorage.setItem(chaveDocumentos, JSON.stringify(tenho));
  });

  async function carregar() {
    if (!id) return (erro = 'Chamada não encontrada. Abra a chamada pela lista de oportunidades.');
    try {
      const [c, p, eu] = await Promise.all([
        api('GET', `/api/agricultor/chamadas/${id}`),
        api('GET', '/api/agricultor/perfil'),
        api('GET', '/api/eu'),
      ]);
      chamada = c;
      perfil = p;
      // com a chave do agricultor, quem divide o aparelho (a cooperativa, a família) não herda as marcas do outro
      chaveDocumentos = `documentos-${eu.id}-chamada-${id}`;
      tenho = lerTenho();
    } catch (falha) {
      erro = falha.message;
      return;
    }
    perguntar(); // a primeira resposta explica o prazo e os itens que ele planta
  }
  carregar();

  // Manda a conversa e, se houver, a pergunta nova. A pergunta só entra na conversa quando o assistente responde:
  // se der erro (IA fora do ar, CPF no texto), ela fica no campo para tentar de novo ou corrigir.
  async function perguntar(texto) {
    const conversa = [...$state.snapshot(mensagens), ...(texto ? [{ papel: 'agricultor', texto }] : [])];
    pensando = true;
    erroChat = '';
    try {
      const resposta = await api('POST', `/api/agricultor/chamadas/${id}/assistente`, { mensagens: conversa });
      mensagens = [...conversa, { papel: 'assistente', texto: resposta.resposta }];
      if (texto && pergunta.trim() === texto) pergunta = ''; // não apaga o que ele escreveu enquanto esperava
      checklist = resposta.checklist ?? [];
      for (const { produto_id, quantidade } of resposta.sugestao?.itens ?? []) quantidades[produto_id] = quantidade;
    } catch (falha) {
      erroChat = falha.message;
    }
    pensando = false;
  }

  function enviar(evento) {
    evento.preventDefault();
    if (pergunta.trim() && !pensando) perguntar(pergunta.trim());
  }

  // Grava o interesse (o servidor confere) e depois faz o passo de cada botão.
  async function oferecer(depois) {
    erroOferta = '';
    pronto = '';
    enviando = true;
    const itens = campos
      .filter((campo) => quantidades[campo.produto_id] > 0)
      .map((campo) => ({ produto_id: campo.produto_id, quantidade: quantidades[campo.produto_id] }));
    try {
      await api('POST', `/api/agricultor/chamadas/${id}/interesse`, { itens });
      depois();
    } catch (falha) {
      erroOferta = falha.message;
    }
    enviando = false;
  }
  const participar = () => oferecer(() => (pronto = 'Pronto! A sua cooperativa já vê o que você quer vender e vai juntar na proposta dela.'));
  const individual = () => oferecer(() => (location.href = `/projeto-venda.html?chamada=${id}`));
</script>

<header class="topo">
  <h1>Merenda do Vizinho</h1>
  <button type="button" class="botao-secundario" onclick={sair}>Sair</button>
</header>

<main class="estreita">
  <p><a href="/agricultor.html">Voltar para as oportunidades</a></p>
  <p class="erro" role="alert">{erro}</p>

  {#if chamada && perfil}
    <section class="cartao" aria-labelledby="titulo-chamada">
      <div id="resumo-chamada">
        <h2 id="titulo-chamada">Chamada {chamada.numero ?? ''} de {chamada.municipio ?? 'cidade sem nome'} ({chamada.uf})</h2>
        {#if chamada.orgao}<p>{chamada.orgao}</p>{/if}
        <p>Entregue o projeto de venda até {chamada.prazo_envio ? data(chamada.prazo_envio) : 'a data do edital'}.</p>
        {#if chamada.local_entrega}<p>Local de entrega: {chamada.local_entrega}</p>{/if}
      </div>
      <Ouvir alvo="resumo-chamada" />
    </section>

    <section class="cartao" aria-labelledby="titulo-assistente">
      <h2 id="titulo-assistente">Assistente</h2>
      <p class="dica">Pergunte sobre a chamada. Não escreva CPF, CAF, e-mail nem telefone: o assistente não precisa deles.</p>
      <div class="conversa" role="log" aria-label="Conversa com o assistente">
        {#each mensagens as mensagem, i}
          <div class="mensagem" class:assistente={mensagem.papel === 'assistente'}>
            <p class="quem">{mensagem.papel === 'assistente' ? 'Assistente' : 'Você'}</p>
            <p class="texto" id="mensagem-{i}">{mensagem.texto}</p>
            {#if mensagem.papel === 'assistente'}<Ouvir alvo="mensagem-{i}" />{/if}
          </div>
        {/each}
        {#if pensando}<p>O assistente está pensando...</p>{/if}
      </div>
      <p class="erro" role="alert">{erroChat}</p>
      {#if erroChat && mensagens.length === 0}
        <button type="button" class="botao-secundario" disabled={pensando} onclick={() => perguntar()}>Tentar de novo</button>
      {/if}
      <form onsubmit={enviar}>
        <label for="pergunta">Sua pergunta</label>
        <input id="pergunta" bind:value={pergunta} enterkeyhint="send" autocomplete="off" maxlength="1000" required>
        <button type="submit" disabled={pensando}>Enviar</button>
      </form>
    </section>

    <section class="cartao" aria-labelledby="titulo-documentos">
      <h2 id="titulo-documentos">Documentos</h2>
      {#if documentos.length}
        <fieldset id="lista-documentos">
          <legend>Marque o que você já tem:</legend>
          {#each documentos as documento}
            <label class="opcao"><input type="checkbox" value={documento} bind:group={tenho}> {documento}</label>
          {/each}
        </fieldset>
        <p role="status">{faltam === 0 ? 'Você já tem todos os documentos da lista.' : faltam === 1 ? 'Falta 1 documento.' : `Faltam ${faltam} documentos.`}</p>
        <Ouvir alvo="lista-documentos" />
      {:else}
        <p>{erroChat ? 'A chamada não traz a lista de documentos. Confira no edital ou pergunte à prefeitura.' : 'A lista de documentos aparece quando o assistente responder.'}</p>
      {/if}
    </section>

    <section class="cartao" aria-labelledby="titulo-oferta">
      <h2 id="titulo-oferta">O que você quer vender</h2>
      {#if campos.length === 0}
        <p>Esta chamada não pede nenhum produto do seu sítio. Confira os produtos em <a href="/agricultor.html#sitio">Meu sítio</a>.</p>
      {:else}
        {#each campos as campo (campo.produto_id)}
          <label for="oferta-{campo.produto_id}">Quanto de {campo.nomes.join(' e ')} você quer vender</label>
          <input
            id="oferta-{campo.produto_id}"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            bind:value={quantidades[campo.produto_id]}
            aria-describedby="pedido-{campo.produto_id}">
          <p class="dica" id="pedido-{campo.produto_id}">A prefeitura pede {campo.pedidos.join(' e ')}.</p>
        {/each}
        <p class="erro" role="alert">{erroOferta}</p>
        <p role="status">{pronto}</p>
        <div class="acoes">
          <button type="button" disabled={enviando || !perfil.cooperativa_id} aria-describedby="dica-participar" onclick={participar}>Quero participar</button>
          <button type="button" class="botao-secundario" disabled={enviando} onclick={individual}>Fazer minha proposta individual</button>
        </div>
        <p class="dica" id="dica-participar">
          {#if perfil.cooperativa_id}
            "Quero participar" manda o que você quer vender para a sua cooperativa, que junta tudo numa proposta só.
          {:else}
            Para participar com uma cooperativa, escolha a sua em <a href="/agricultor.html#sitio">Meu sítio</a>.
          {/if}
        </p>
      {/if}
    </section>
  {:else if !erro}
    <p>Carregando...</p>
  {/if}
</main>

<style>
  .conversa {
    display: grid;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .mensagem {
    padding: 0.5rem 1rem;
    border: 2px solid var(--verde);
    border-radius: 12px;
  }

  .assistente {
    border-color: var(--linha);
    background: var(--fundo-suave);
  }

  .quem {
    margin: 0;
    font-weight: 700;
  }

  /* a resposta vem com parágrafos separados por linha em branco */
  .texto {
    margin: 0.25rem 0 0.5rem;
    white-space: pre-line;
  }

  .acoes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }
</style>
