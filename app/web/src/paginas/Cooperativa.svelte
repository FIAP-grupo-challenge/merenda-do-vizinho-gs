<!-- Tela da cooperativa (/cooperativa.html): as chamadas publicadas no estado dela, a proposta conjunta com a divisão
     automática entre os cooperados (que dá para mudar), o que falta, e o projeto de venda para imprimir. -->
<script>
  import { tick } from 'svelte';
  import { api, sair } from '../lib/api.js';
  import CaixaRolavel from '../lib/CaixaRolavel.svelte';
  import CampoNumero from '../lib/CampoNumero.svelte';
  import Marca from '../lib/Marca.svelte';
  import Ouvir from '../lib/Ouvir.svelte';
  import { data, escreverNumero, lerNumero, numero, plural, reais } from '../lib/formato.js';

  let chamadas = $state([]);
  let propostas = $state([]);
  let aberta = $state(null); // o detalhe da proposta, com as alocações que a tabela edita
  let alterada = $state(false);
  let ocupado = $state(false);
  let mensagem = $state('');
  const erro = $state({ geral: '', proposta: '' });

  // A divisão chega do servidor com números; a tabela edita o texto de cada campo ("855,51"), e salvar() o lê de volta.
  const comTextos = (proposta) => ({
    ...proposta,
    itens: proposta.itens.map((item) => ({
      ...item,
      alocacoes: item.alocacoes.map(({ quantidade, ...alocacao }) => ({ ...alocacao, texto: escreverNumero(quantidade) })),
    })),
  });

  async function carregar() {
    [chamadas, propostas] = await Promise.all([api('GET', '/api/cooperativa/chamadas'), api('GET', '/api/cooperativa/propostas')]);
  }

  async function iniciar() {
    try {
      await carregar();
    } catch (falha) {
      erro.geral = falha.message;
    }
  }
  iniciar();

  // As colunas da tabela: os cooperados que aparecem na divisão, em ordem alfabética.
  const colunas = $derived.by(() => {
    const vistos = new Map();
    for (const item of aberta?.itens ?? []) {
      for (const alocacao of item.alocacoes) vistos.set(alocacao.agricultor_id, alocacao.nome);
    }
    return [...vistos].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  // A soma de um item com o que está digitado agora (campo vazio, ou que não é número, vale zero).
  const somaDe = (item) => Math.round(item.alocacoes.reduce((total, a) => total + (lerNumero(a.texto).valor ?? 0), 0) * 100) / 100;

  const resumo = $derived.by(() => {
    if (!aberta) return '';
    const comOferta = aberta.itens.filter((item) => item.quantidade > 0);
    const inteiros = comOferta.filter((item) => item.falta === 0).length;
    const semOferta = aberta.itens.length - comOferta.length;
    return (
      `Os cooperados oferecem ${comOferta.length} dos ${aberta.itens.length} itens (${inteiros} por inteiro), ` +
      `no total de ${reais(aberta.total)}.` +
      (semOferta > 0 ? ` ${plural(semOferta, 'item fica', 'itens ficam')} sem oferta: nenhum cooperado marcou interesse ou pode entregar.` : '')
    );
  });

  async function mostrar(proposta) {
    aberta = comTextos(proposta);
    alterada = false;
    await tick();
    document.getElementById('titulo-proposta')?.focus();
  }

  async function montar(chamada) {
    if (chamada.proposta_id && !confirm('Refazer a divisão automática apaga as mudanças feitas à mão nesta proposta. Continuar?')) return;
    erro.geral = '';
    mensagem = '';
    ocupado = true;
    try {
      await mostrar(await api('POST', `/api/cooperativa/chamadas/${chamada.id}/proposta`));
      await carregar();
    } catch (falha) {
      erro.geral = falha.message;
    } finally {
      ocupado = false;
    }
  }

  async function abrir(id) {
    erro.geral = '';
    mensagem = '';
    try {
      await mostrar(await api('GET', `/api/cooperativa/propostas/${id}`));
    } catch (falha) {
      erro.geral = falha.message;
    }
  }

  async function salvar() {
    erro.proposta = '';
    mensagem = '';
    // número que não deu para ler não pode virar zero em silêncio: a divisão não é salva e a mensagem diz onde está
    const itens = [];
    for (const item of aberta.itens) {
      const alocacoes = [];
      for (const { agricultor_id, nome, texto } of item.alocacoes) {
        const { valor, erro: motivo } = lerNumero(texto);
        if (motivo) {
          erro.proposta = `${item.produto}, ${nome}: ${motivo}`;
          return false;
        }
        alocacoes.push({ agricultor_id, quantidade: valor ?? 0 });
      }
      itens.push({ alocacoes });
    }
    ocupado = true;
    try {
      aberta = comTextos(await api('PUT', `/api/cooperativa/propostas/${aberta.id}`, { itens }));
      alterada = false;
      mensagem = 'Divisão salva.';
      await carregar();
      return true;
    } catch (falha) {
      erro.proposta = falha.message;
      return false;
    } finally {
      ocupado = false;
    }
  }

  // o projeto de venda sai do que está salvo: com mudança na tabela, salva antes
  async function gerarProjeto() {
    if (alterada && !(await salvar())) return;
    location.href = `/projeto-venda.html?proposta=${aberta.id}`;
  }
</script>

<header class="topo">
  <Marca />
  <h1>Colhe</h1>
  <button type="button" class="botao-secundario" onclick={sair}>Sair</button>
</header>

<main>
  <section class="cartao" aria-label="Sobre esta tela">
    <p id="apresentacao">
      Cooperativa: junte numa proposta só o que os cooperados querem vender em cada chamada. O app divide cada item entre
      eles, respeitando o que cada um produz e o limite de R$ 40 mil por ano de cada agricultor. Você pode mudar a divisão
      antes de gerar o projeto de venda.
    </p>
    <Ouvir alvo="apresentacao" />
    <p><a class="botao botao-secundario" href="/camara-fria.html">Câmara fria e entregas</a></p>
    <p class="erro" role="alert">{erro.geral}</p>
  </section>

  <section class="cartao" aria-labelledby="titulo-chamadas">
    <h2 id="titulo-chamadas">Chamadas abertas no seu estado</h2>
    {#if chamadas.length === 0}
      <p>Nenhuma chamada publicada no seu estado ainda.</p>
    {/if}
    <ul class="lista">
      {#each chamadas as chamada (chamada.id)}
        <li>
          <span id="chamada-{chamada.id}">
            <strong>Chamada {chamada.numero}</strong> · {chamada.orgao} · {chamada.municipio}/{chamada.uf} · prazo {data(chamada.prazo_envio)}
          </span>
          <span class="botoes">
            {#if chamada.proposta_id}
              <button type="button" onclick={() => abrir(chamada.proposta_id)} aria-describedby="chamada-{chamada.id}">Abrir a proposta</button>
              <button type="button" class="botao-secundario" disabled={ocupado} onclick={() => montar(chamada)} aria-describedby="chamada-{chamada.id}">
                Refazer a divisão
              </button>
            {:else}
              <button type="button" disabled={ocupado} onclick={() => montar(chamada)} aria-describedby="chamada-{chamada.id}">Montar a proposta conjunta</button>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="cartao" aria-labelledby="titulo-propostas">
    <h2 id="titulo-propostas">Propostas enviadas</h2>
    {#if propostas.length === 0}
      <p>Nenhuma proposta ainda.</p>
    {/if}
    <ul class="lista">
      {#each propostas as proposta (proposta.id)}
        <li>
          <span id="proposta-{proposta.id}">
            <strong>Chamada {proposta.chamada.numero}</strong> · {proposta.chamada.municipio}/{proposta.chamada.uf} · {reais(proposta.total)}
          </span>
          <button type="button" class="botao-secundario" onclick={() => abrir(proposta.id)} aria-describedby="proposta-{proposta.id}">Abrir</button>
        </li>
      {/each}
    </ul>
  </section>

  {#if aberta}
    <section class="cartao" aria-labelledby="titulo-proposta">
      <h2 id="titulo-proposta" tabindex="-1">Proposta conjunta: chamada {aberta.chamada.numero} ({aberta.chamada.municipio}/{aberta.chamada.uf})</h2>
      <p id="resumo-proposta">{resumo}</p>
      <Ouvir alvo="resumo-proposta" />
      <p class="dica">
        Cada linha é um alimento da chamada; cada coluna, um cooperado que marcou interesse (— quer dizer que não marcou). No
        celular, arraste a tabela para o lado. Mude as quantidades e salve: o app confere o pedido, o que cada um pode entregar
        e o limite de R$ 40 mil no ano.
      </p>
      <CaixaRolavel rotulo="Divisão da proposta entre os cooperados">
        <table class="divisao">
          <thead>
            <tr>
              <th scope="col">Alimento</th>
              <th scope="col">Pedido</th>
              {#each colunas as cooperado (cooperado.id)}
                <th scope="col">{cooperado.nome}</th>
              {/each}
              <th scope="col">Oferta</th>
              <th scope="col">Falta</th>
            </tr>
          </thead>
          <tbody>
            {#each aberta.itens as item, i (i)}
              {@const soma = somaDe(item)}
              <tr>
                <th scope="row">{item.produto} <span class="detalhe">({item.unidade}, {reais(item.preco_unitario)})</span></th>
                <td class="numero">{numero(item.quantidade_pedida, 2)}</td>
                {#each colunas as cooperado (cooperado.id)}
                  {@const alocacao = item.alocacoes.find((a) => a.agricultor_id === cooperado.id)}
                  <td>
                    {#if alocacao}
                      <CampoNumero
                        id="alocacao-{i}-{cooperado.id}"
                        compacto
                        aria-label="{item.produto} ({item.unidade}): quantidade de {cooperado.nome}"
                        bind:texto={alocacao.texto}
                        oninput={() => (alterada = true)} />
                    {:else}
                      <span aria-hidden="true">—</span><span class="so-leitor">não marcou</span>
                    {/if}
                  </td>
                {/each}
                <td class="numero" class:acima={soma > item.quantidade_pedida}>{numero(soma, 2)}</td>
                <td class="numero">{numero(Math.max(0, Math.round((item.quantidade_pedida - soma) * 100) / 100), 2)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </CaixaRolavel>
      <p class="erro" role="alert">{erro.proposta}</p>
      <p class="sucesso" role="status">{mensagem}</p>
      <div class="acoes">
        <button type="button" class="botao-secundario" onclick={salvar} disabled={ocupado || !alterada}>Salvar a divisão</button>
        <button type="button" onclick={gerarProjeto} disabled={ocupado}>Gerar projeto de venda</button>
      </div>
    </section>
  {/if}
</main>

<style>
  .lista {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .lista li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--linha);
  }

  .botoes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* compacta: no computador, a divisão de seis cooperados cabe inteira, com a oferta e o que falta */
  .divisao th,
  .divisao td {
    padding: 0.5rem;
  }

  /* o campo é do CampoNumero: o estilo só o alcança com :global */
  .divisao :global(input) {
    min-width: 5.5rem;
  }

  .divisao th[scope='row'] {
    min-width: 10rem;
  }

  .detalhe {
    font-weight: 400;
  }

  .numero {
    text-align: right;
    white-space: nowrap;
  }

  /* soma acima do pedido: o servidor recusa ao salvar, e a tela já mostra */
  .acima {
    color: var(--erro);
    font-weight: 700;
  }

  .sucesso {
    color: var(--verde);
    font-weight: 600;
  }

  .acoes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .acoes button {
    flex: 1 1 12rem;
  }

  .so-leitor {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (min-width: 768px) {
    .acoes button {
      flex: 0 0 auto;
    }
  }
</style>
