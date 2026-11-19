<!-- Câmara fria da cooperativa (/camara-fria.html): a última leitura em números grandes, os alertas abertos numa faixa
     vermelha e as últimas leituras, tudo atualizado a cada 3 s; embaixo, o registro das entregas feitas à prefeitura. -->
<script>
  import { api, sair } from '../lib/api.js';
  import CaixaRolavel from '../lib/CaixaRolavel.svelte';
  import CampoNumero from '../lib/CampoNumero.svelte';
  import Marca from '../lib/Marca.svelte';
  import Ouvir from '../lib/Ouvir.svelte';
  import { lerNumero, numero, reais } from '../lib/formato.js';

  // o momento chega em UTC; a tela mostra no fuso de quem olha
  const quando = (momento) => new Date(momento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  const hora = (momento) => new Date(momento).toLocaleTimeString('pt-BR');

  // hoje no fuso de quem usa, no formato do campo de data (AAAA-MM-DD)
  function hoje() {
    const agora = new Date();
    return [agora.getFullYear(), agora.getMonth() + 1, agora.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
  }

  let camara = $state(null); // { leituras (a mais nova primeiro), alertas abertos, limite_temp_c, minutos_porta_aberta }
  let erroCamara = $state('');
  const ultima = $derived(camara?.leituras[0]);
  const resumo = $derived(
    ultima
      ? `${ultima.dispositivo}, leitura de ${quando(ultima.momento)}: ${numero(ultima.temperatura_c, 2)} graus, ` +
          `${numero(ultima.peso_kg, 2)} quilos e porta ${ultima.porta_aberta ? 'aberta' : 'fechada'}. ` +
          `O app avisa acima de ${numero(camara.limite_temp_c, 2)} graus ou com a porta aberta mais de ${numero(camara.minutos_porta_aberta, 2)} minutos.`
      : '',
  );

  // 401 ou 403: a sessão não vale ou a conta não é de cooperativa. Tentar de novo não adianta.
  const semAcesso = (falha) => falha.status === 401 || falha.status === 403;

  // A cada 3 s, contados depois da resposta anterior: os pedidos nunca se acumulam. Sem conexão, avisa e tenta de novo;
  // sem acesso, avisa e para.
  async function atualizar() {
    try {
      camara = await api('GET', '/api/cooperativa/camara-fria');
      erroCamara = '';
    } catch (falha) {
      erroCamara = falha.message;
      if (semAcesso(falha)) return;
    }
    setTimeout(atualizar, 3000);
  }
  atualizar();

  let propostas = $state(null);
  let propostaId = $state(null);
  let item = $state(''); // a posição do item na proposta: o mesmo produto pode estar em dois itens de preços diferentes
  let quantidade = $state(''); // o texto do campo ("25,5"): na hora de enviar, lerNumero(quantidade).valor
  let data = $state(hoje());
  let noPrazo = $state(true);
  let enviando = $state(false);
  let erroEntrega = $state('');
  let mensagem = $state('');
  const proposta = $derived(propostas?.find((p) => p.id === propostaId));
  // só o que a proposta oferece pode ser entregue
  const comOferta = $derived((proposta?.itens ?? []).map((it, posicao) => ({ ...it, posicao })).filter((it) => it.quantidade > 0));
  const escolhido = $derived(typeof item === 'number' ? proposta?.itens[item] : undefined);

  async function carregarPropostas() {
    try {
      propostas = await api('GET', '/api/cooperativa/propostas');
      propostaId = propostas[0]?.id ?? null;
    } catch (falha) {
      // sem acesso, a mesma mensagem já aparece em "Agora na câmara": uma vez só
      if (!semAcesso(falha)) erroEntrega = falha.message;
    }
  }
  carregarPropostas();

  async function registrar(evento) {
    evento.preventDefault();
    erroEntrega = '';
    mensagem = '';
    enviando = true;
    const alimento = escolhido;
    try {
      const corpo = { proposta_id: propostaId, item, quantidade: lerNumero(quantidade).valor, data, no_prazo: noPrazo };
      const entrega = await api('POST', '/api/cooperativa/entregas', corpo);
      mensagem = `Entrega registrada: ${numero(entrega.quantidade, 2)} ${alimento.unidade} de ${alimento.produto}, no valor de ${reais(entrega.valor)}.`;
      quantidade = '';
    } catch (falha) {
      erroEntrega = falha.message;
    } finally {
      enviando = false;
    }
  }
</script>

<header class="topo">
  <Marca />
  <h1>Colhe</h1>
  <button type="button" class="botao-secundario" onclick={sair}>Sair</button>
</header>

<main>
  <!-- fica na página mesmo vazio: assim o leitor de tela anuncia o alerta quando ele aparece -->
  <div role="alert">
    {#if camara?.alertas.length}
      <section class="faixa-alerta" aria-labelledby="titulo-alertas">
        <h2 id="titulo-alertas">Alerta na câmara fria</h2>
        <ul id="lista-alertas">
          {#each camara.alertas as alerta (alerta.id)}
            <li>{alerta.mensagem} Desde {quando(alerta.momento)}.</li>
          {/each}
        </ul>
        <Ouvir alvo="lista-alertas" />
      </section>
    {/if}
  </div>

  <section class="cartao" aria-label="Sobre esta tela">
    <p id="apresentacao">
      Câmara fria da cooperativa: a temperatura, o peso e a porta, como o sensor mede, atualizados a cada 3 segundos. Quando
      a câmara esquenta demais ou a porta fica aberta tempo demais, aparece uma faixa vermelha no alto da tela. Embaixo,
      anote cada entrega feita à prefeitura: o valor é a quantidade vezes o preço do alimento na proposta.
    </p>
    <Ouvir alvo="apresentacao" />
    <p><a class="botao botao-secundario" href="/cooperativa.html">Voltar às propostas</a></p>
  </section>

  <section class="cartao" aria-labelledby="titulo-agora">
    <h2 id="titulo-agora">Agora na câmara</h2>
    {#if ultima}
      <dl class="numeros">
        <div class:fora={ultima.temperatura_c > camara.limite_temp_c}>
          <dt>Temperatura</dt>
          <dd>{numero(ultima.temperatura_c, 2)} °C</dd>
        </div>
        <div>
          <dt>Peso</dt>
          <dd>{numero(ultima.peso_kg, 2)} kg</dd>
        </div>
        <div>
          <dt>Porta</dt>
          <dd>{ultima.porta_aberta ? 'Aberta' : 'Fechada'}</dd>
        </div>
      </dl>
      <p id="resumo-agora">{resumo}</p>
      <Ouvir alvo="resumo-agora" />
    {:else if camara}
      <p>Nenhuma leitura chegou ainda. Ligue o sensor da câmara ou o simulador.</p>
    {:else if !erroCamara}
      <p>Carregando...</p>
    {/if}
    <p class="erro" role="alert">{erroCamara}</p>
  </section>

  {#if camara?.leituras.length}
    <section class="cartao" aria-labelledby="titulo-leituras">
      <h2 id="titulo-leituras">Últimas leituras</h2>
      <CaixaRolavel rotulo="Últimas leituras da câmara fria">
        <table class="leituras">
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Câmara</th>
              <th scope="col">Temperatura</th>
              <th scope="col">Peso</th>
              <th scope="col">Porta</th>
            </tr>
          </thead>
          <tbody>
            {#each camara.leituras as leitura (leitura.id)}
              <tr>
                <td>{hora(leitura.momento)}</td>
                <td>{leitura.dispositivo}</td>
                <td class="numero">{numero(leitura.temperatura_c, 2)} °C</td>
                <td class="numero">{numero(leitura.peso_kg, 2)} kg</td>
                <td>{leitura.porta_aberta ? 'aberta' : 'fechada'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </CaixaRolavel>
    </section>
  {/if}

  <section class="cartao" aria-labelledby="titulo-entrega">
    <h2 id="titulo-entrega">Registrar entrega</h2>
    {#if propostas?.length === 0}
      <p>Nenhuma proposta ainda. Monte a proposta conjunta na <a href="/cooperativa.html">tela da cooperativa</a>.</p>
    {:else if propostas}
      <form onsubmit={registrar}>
        <label for="entrega-proposta">Proposta</label>
        <!-- outra proposta tem outros itens: a escolha do alimento recomeça -->
        <select id="entrega-proposta" bind:value={propostaId} onchange={() => (item = '')}>
          {#each propostas as p (p.id)}
            <option value={p.id}>Chamada {p.chamada.numero} · {p.chamada.municipio}/{p.chamada.uf}</option>
          {/each}
        </select>

        <label for="entrega-item">Alimento</label>
        <!-- sem required: o Chrome marcaria o campo como inválido antes de qualquer escolha; o servidor confere -->
        <select id="entrega-item" bind:value={item}>
          <option value="" disabled>Escolha o alimento</option>
          {#each comOferta as it (it.posicao)}
            <option value={it.posicao}>{it.produto} ({it.unidade}, {reais(it.preco_unitario)}): oferecido {numero(it.quantidade, 2)}</option>
          {/each}
        </select>

        <label for="entrega-quantidade">Quantidade entregue{escolhido ? ` (${escolhido.unidade})` : ''}</label>
        <CampoNumero id="entrega-quantidade" bind:texto={quantidade} required />

        <label for="entrega-data">Data da entrega</label>
        <input id="entrega-data" type="date" bind:value={data} required>

        <label class="opcao"><input type="checkbox" bind:checked={noPrazo}> Entregue no prazo combinado</label>

        <button type="submit" disabled={enviando}>Registrar entrega</button>
      </form>
    {/if}
    <p class="erro" role="alert">{erroEntrega}</p>
    <p class="sucesso" role="status">{mensagem}</p>
  </section>
</main>

<style>
  .faixa-alerta {
    margin-bottom: 1.25rem;
    padding: 1rem;
    border-radius: 14px;
    background: var(--erro); /* branco sobre o tomate: 5,4:1 */
    color: #ffffff;
  }

  .faixa-alerta h2 {
    margin: 0 0 0.5rem;
  }

  .faixa-alerta ul {
    margin: 0 0 0.75rem;
    padding-left: 1.25rem;
    font-size: 1.2rem;
    font-weight: 700;
  }

  /* o anel de foco escuro some no vermelho: ali o anel é branco, como no topo */
  .faixa-alerta :global(:focus-visible) {
    outline-color: #ffffff;
  }

  .numeros {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.75rem;
    margin: 0 0 1rem;
  }

  .numeros div {
    padding: 0.75rem 1rem;
    border: 3px solid transparent;
    border-radius: 10px;
    background: var(--creme);
  }

  .numeros dt {
    font-weight: 600;
  }

  /* os números grandes e finos, como os do pitch */
  .numeros dd {
    margin: 0;
    font-size: 2.75rem;
    font-weight: 300;
    letter-spacing: -0.03em;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
  }

  /* acima do limite, o número fica tomate e a caixa ganha a borda, além da faixa */
  .numeros .fora {
    border-color: var(--erro);
  }

  .fora dd {
    color: var(--erro);
  }

  /* uma leitura por linha: no celular a tabela rola dentro da caixa, em vez de quebrar cada célula */
  .leituras th,
  .leituras td {
    white-space: nowrap;
  }

  .numero {
    text-align: right;
  }

  .sucesso {
    color: var(--verde);
    font-weight: 600;
  }
</style>
