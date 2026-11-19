<!-- Tela da prefeitura (/prefeitura.html): ler o edital em PDF com a IA, conferir e publicar a chamada,
     acompanhar as propostas e as entregas, e a meta do ano de compra da agricultura familiar. -->
<script>
  import { tick } from 'svelte';
  import { api, sair } from '../lib/api.js';
  import CaixaRolavel from '../lib/CaixaRolavel.svelte';
  import CampoNumero from '../lib/CampoNumero.svelte';
  import Ouvir from '../lib/Ouvir.svelte';
  import { data, escreverNumero, lerNumero, nomeDoItem, numero, plural, reais } from '../lib/formato.js';

  // O servidor aceita até 10 MB de JSON nesta rota, e o base64 cresce 4/3: o PDF vai até uns 7,5 MB.
  const LIMITE_PDF = 7_800_000;
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  const ORIGENS = { ia: 'Lida pela IA', regras: 'Lida pelas regras do app, sem IA', cache: 'Leitura já conferida antes (cache)' };

  const porcento = (fracao) => `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

  let resumo = $state(null);
  let repasse = $state(''); // o texto do campo ("1200000", "1.200.000,50"): na hora de enviar, lerNumero(repasse).valor
  let chamadas = $state([]);
  let catalogo = $state([]);
  let arquivos = $state(null);
  let aberta = $state(null); // o detalhe da chamada aberta, como a API devolve
  let leitura = $state(null); // { id, modelo, duracao_ms } do PDF que acabou de ser lido
  let form = $state(null); // cópia editável dos dados da chamada aberta (só no rascunho)
  let ocupado = $state(false);
  let mensagem = $state('');
  const erro = $state({ geral: '', envio: '', resumo: '', edicao: '' });

  async function iniciar() {
    try {
      const [dadosResumo, lista, produtos] = await Promise.all([
        api('GET', '/api/prefeitura/resumo'),
        api('GET', '/api/prefeitura/chamadas'),
        api('GET', '/api/catalogo'),
      ]);
      resumo = dadosResumo;
      repasse = escreverNumero(dadosResumo.repasse);
      chamadas = lista;
      catalogo = produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    } catch (falha) {
      erro.geral = falha.message;
    }
  }
  iniciar();

  async function recarregarLista() {
    chamadas = await api('GET', '/api/prefeitura/chamadas');
  }

  function lerBase64(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result).split(',')[1] ?? '');
      leitor.onerror = () => reject(new Error('Não consegui ler o arquivo. Tente de novo.'));
      leitor.readAsDataURL(arquivo);
    });
  }

  // O formulário edita uma cópia; as listas de texto viram uma linha por item, e os números ficam como texto ("1234,5", como
  // a pessoa escreve): dadosDoFormulario() os transforma de volta.
  function abrirFormulario(chamada) {
    const { itens, semanas_fornecimento, ...copia } = $state.snapshot(chamada);
    form = {
      ...copia,
      documentos: (copia.documentos_exigidos ?? []).join('\n'),
      criterios: (copia.criterios_prioridade ?? []).join('\n'),
      semanas: escreverNumero(semanas_fornecimento),
      itens: itens.map(({ quantidade, preco_unitario, ...item }) => ({
        ...item,
        quantidadeTexto: escreverNumero(quantidade),
        precoTexto: escreverNumero(preco_unitario),
      })),
    };
  }

  function dadosDoFormulario() {
    const { documentos, criterios, semanas, itens, ...campos } = $state.snapshot(form);
    const linhas = (texto) => texto.split('\n').map((linha) => linha.trim()).filter(Boolean);
    return {
      ...campos,
      semanas_fornecimento: lerNumero(semanas).valor,
      itens: itens.map(({ quantidadeTexto, precoTexto, ...item }) => ({
        ...item,
        quantidade: lerNumero(quantidadeTexto).valor,
        preco_unitario: lerNumero(precoTexto).valor,
      })),
      documentos_exigidos: linhas(documentos),
      criterios_prioridade: linhas(criterios),
    };
  }

  // O botão Publicar não passa pela conferência do formulário: sem isto, um número que não deu para ler seguiria como "em branco".
  function numeroIlegivel() {
    const campos = [['Semanas de fornecimento', form.semanas]];
    form.itens.forEach((item, i) => campos.push([`Item ${i + 1}, quantidade`, item.quantidadeTexto], [`Item ${i + 1}, preço`, item.precoTexto]));
    for (const [nome, texto] of campos) {
      const { erro: motivo } = lerNumero(texto);
      if (motivo) return `${nome}: ${motivo}`;
    }
    return '';
  }

  async function mostrar(detalhe) {
    aberta = detalhe;
    if (detalhe.status === 'rascunho') abrirFormulario(detalhe.chamada);
    else form = null;
    await tick();
    document.getElementById('titulo-aberta')?.focus();
  }

  async function lerPdf(evento) {
    evento.preventDefault();
    erro.envio = '';
    mensagem = '';
    const pdf = arquivos?.[0];
    if (!pdf) {
      erro.envio = 'Escolha o PDF do edital.';
      return;
    }
    // acima do limite, o servidor fecha a conexão e o navegador só diria "sem conexão": melhor avisar antes
    if (pdf.size > LIMITE_PDF) {
      erro.envio = 'O PDF passa de 7,5 MB, o limite do envio. Mande um arquivo menor, por exemplo só as páginas com a lista de alimentos.';
      return;
    }
    ocupado = true;
    try {
      const criada = await api('POST', '/api/prefeitura/chamadas', { pdf_base64: await lerBase64(pdf) });
      leitura = { id: criada.id, modelo: criada.modelo, duracao_ms: criada.duracao_ms };
      const { id, chamada, origem, avisos } = criada;
      await mostrar({ id, status: 'rascunho', origem, criada_em: null, publicada_em: null, chamada, avisos, propostas: [] });
      await recarregarLista();
    } catch (falha) {
      erro.envio = falha.message;
    } finally {
      ocupado = false;
    }
  }

  async function abrir(id) {
    erro.geral = '';
    erro.edicao = '';
    mensagem = '';
    try {
      await mostrar(await api('GET', `/api/prefeitura/chamadas/${id}`));
    } catch (falha) {
      erro.geral = falha.message;
    }
  }

  function incluirItem() {
    form.itens.push({ produto: '', produto_id: null, unidade: '', quantidadeTexto: '', precoTexto: '', entrega: null, observacoes: null });
  }

  async function salvar() {
    erro.edicao = '';
    mensagem = '';
    const ilegivel = numeroIlegivel();
    if (ilegivel) {
      erro.edicao = ilegivel;
      return false;
    }
    ocupado = true;
    try {
      aberta = await api('PUT', `/api/prefeitura/chamadas/${aberta.id}`, dadosDoFormulario());
      abrirFormulario(aberta.chamada);
      mensagem = 'Rascunho salvo.';
      await recarregarLista();
      return true;
    } catch (falha) {
      erro.edicao = falha.message;
      return false;
    } finally {
      ocupado = false;
    }
  }

  async function publicar() {
    if (!(await salvar())) return;
    ocupado = true;
    try {
      aberta = await api('POST', `/api/prefeitura/chamadas/${aberta.id}/publicar`);
      form = null;
      mensagem = `Chamada publicada: as cooperativas e os agricultores de ${aberta.chamada.uf} já podem ver.`;
      await recarregarLista();
    } catch (falha) {
      erro.edicao = falha.message;
    } finally {
      ocupado = false;
    }
  }

  async function salvarRepasse(evento) {
    evento.preventDefault();
    erro.resumo = '';
    try {
      await api('PUT', '/api/prefeitura/repasse', { ano: resumo.ano, valor: lerNumero(repasse).valor });
      resumo = await api('GET', '/api/prefeitura/resumo');
    } catch (falha) {
      erro.resumo = falha.message;
    }
  }

  // Como a chamada aberta foi lida: a origem e, logo depois de ler o PDF, o modelo e o tempo ("lido em X s").
  const comoFoiLida = $derived.by(() => {
    if (!aberta) return '';
    let texto = ORIGENS[aberta.origem] ?? 'Preenchida à mão';
    if (leitura?.id === aberta.id) {
      if (leitura.modelo) texto += ` (${leitura.modelo})`;
      if (leitura.duracao_ms !== null) texto += `: lido em ${(leitura.duracao_ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
    }
    return `${texto}.`;
  });
</script>

<header class="topo">
  <h1>Merenda do Vizinho</h1>
  <button type="button" class="botao-secundario" onclick={sair}>Sair</button>
</header>

<main>
  <section class="cartao" aria-label="Sobre esta tela">
    <p id="apresentacao">
      Prefeitura: mande o PDF do edital da chamada pública, confira o que foi lido e publique. As cooperativas e os
      agricultores do estado veem a chamada e mandam propostas. Aqui você acompanha as propostas, as entregas e a meta do
      ano de compra da agricultura familiar.
    </p>
    <Ouvir alvo="apresentacao" />
    <p class="erro" role="alert">{erro.geral}</p>
  </section>

  <section class="cartao" aria-labelledby="titulo-meta">
    <h2 id="titulo-meta">Meta do ano</h2>
    {#if resumo}
      <p id="texto-meta">
        Em {resumo.ano}, a prefeitura recebeu {reais(resumo.compras_af_reais)} em alimentos da agricultura familiar.
        {#if resumo.percentual === null}
          Informe o repasse do PNAE de {resumo.ano} para ver o percentual. A lei pede pelo menos {porcento(resumo.minimo)} do
          repasse em compras da agricultura familiar.
        {:else}
          Isso é {porcento(resumo.percentual)} do repasse do PNAE ({reais(resumo.repasse)}). A lei pede pelo menos
          {porcento(resumo.minimo)}:
          {resumo.percentual >= resumo.minimo ? 'meta cumprida.' : `faltam ${reais(resumo.minimo * resumo.repasse - resumo.compras_af_reais)}.`}
        {/if}
      </p>
      <Ouvir alvo="texto-meta" />
      {#if resumo.percentual !== null}
        <label for="progresso-meta">Caminho até a meta de {porcento(resumo.minimo)}</label>
        <progress id="progresso-meta" max="1" value={Math.min(1, resumo.percentual / resumo.minimo)}></progress>
      {/if}
      <form class="linha-form" onsubmit={salvarRepasse}>
        <div>
          <label for="repasse">Repasse do PNAE em {resumo.ano} (R$)</label>
          <CampoNumero id="repasse" bind:texto={repasse} formato={reais} />
        </div>
        <button type="submit">Salvar repasse</button>
      </form>
    {/if}
    <p class="erro" role="alert">{erro.resumo}</p>
  </section>

  <section class="cartao" aria-labelledby="titulo-nova">
    <h2 id="titulo-nova">Nova chamada</h2>
    <form onsubmit={lerPdf}>
      <label for="pdf">PDF do edital</label>
      <input id="pdf" type="file" accept="application/pdf" bind:files={arquivos} aria-describedby="dica-pdf">
      <p class="dica" id="dica-pdf">Até 7,5 MB. A leitura pode levar até 2 minutos; depois, confira tudo antes de publicar.</p>
      <p class="erro" role="alert">{erro.envio}</p>
      <button type="submit" disabled={ocupado}>{ocupado ? 'Lendo...' : 'Ler o PDF'}</button>
    </form>
  </section>

  <section class="cartao" aria-labelledby="titulo-chamadas">
    <h2 id="titulo-chamadas">Suas chamadas</h2>
    {#if chamadas.length === 0}
      <p>Nenhuma chamada ainda.</p>
    {/if}
    <ul class="lista">
      {#each chamadas as chamada (chamada.id)}
        <li>
          <span>
            <strong>Chamada {chamada.numero ?? 'sem número'}</strong> · {chamada.municipio ?? ''}{chamada.uf ? `/${chamada.uf}` : ''} ·
            {chamada.status} · prazo {data(chamada.prazo_envio)} · {plural(chamada.propostas, 'proposta', 'propostas')}
          </span>
          <button type="button" class="botao-secundario" onclick={() => abrir(chamada.id)} aria-label="Abrir a chamada {chamada.numero ?? chamada.id}">Abrir</button>
        </li>
      {/each}
    </ul>
  </section>

  {#if aberta}
    <section class="cartao" aria-labelledby="titulo-aberta">
      <h2 id="titulo-aberta" tabindex="-1">Chamada {aberta.chamada.numero ?? 'sem número'} ({aberta.status})</h2>
      <p id="texto-aberta">
        {comoFoiLida}
        {aberta.status === 'publicada' ? `Publicada em ${data(aberta.publicada_em)}.` : 'Confira os dados e os itens com o edital antes de publicar.'}
      </p>
      <Ouvir alvo="texto-aberta" />
      {#if aberta.avisos.length > 0}
        <h3>Avisos</h3>
        <ul id="avisos-aberta" class="avisos">
          {#each aberta.avisos as aviso, i (i)}
            <li>{aviso}</li>
          {/each}
        </ul>
        <Ouvir alvo="avisos-aberta" />
      {/if}
      <p class="sucesso" role="status">{mensagem}</p>

      {#if form}
        <form onsubmit={(evento) => { evento.preventDefault(); salvar(); }}>
          <div class="campos">
            <div><label for="c-numero">Número da chamada</label><input id="c-numero" bind:value={form.numero}></div>
            <div><label for="c-orgao">Órgão</label><input id="c-orgao" bind:value={form.orgao}></div>
            <div><label for="c-municipio">Município</label><input id="c-municipio" bind:value={form.municipio}></div>
            <div>
              <label for="c-uf">UF</label>
              <select id="c-uf" bind:value={form.uf}>
                <option value={null}>Escolha a UF</option>
                {#each UFS as uf (uf)}<option value={uf}>{uf}</option>{/each}
              </select>
            </div>
            <div><label for="c-publicacao">Início do recebimento dos projetos</label><input id="c-publicacao" type="date" bind:value={form.data_publicacao}></div>
            <div><label for="c-prazo">Prazo de envio</label><input id="c-prazo" type="date" bind:value={form.prazo_envio}></div>
            <div><label for="c-periodo">Período de fornecimento</label><input id="c-periodo" bind:value={form.periodo_fornecimento}></div>
            <div>
              <label for="c-semanas">Semanas de fornecimento</label>
              <CampoNumero id="c-semanas" compacto bind:texto={form.semanas} descricao="dica-semanas" />
              <p class="dica" id="dica-semanas">Em branco, o app conta 40 semanas (200 dias letivos).</p>
            </div>
            <div><label for="c-local">Local de entrega</label><input id="c-local" bind:value={form.local_entrega}></div>
            <div><label for="c-contato">Contato (setor, telefone ou e-mail; sem nome de servidor)</label><input id="c-contato" bind:value={form.contato}></div>
          </div>
          <label for="c-documentos">Documentos exigidos (um por linha)</label>
          <textarea id="c-documentos" rows="5" bind:value={form.documentos}></textarea>
          <label for="c-criterios">Critérios de prioridade (um por linha)</label>
          <textarea id="c-criterios" rows="5" bind:value={form.criterios}></textarea>

          <h3>Itens</h3>
          {#if form.itens.length === 0}
            <p>Nenhum item foi lido (o PDF pode ser escaneado ou não ter tabela). Inclua os itens do edital à mão.</p>
          {:else}
            <CaixaRolavel rotulo="Itens da chamada, para editar">
              <table class="edicao">
                <thead>
                  <tr>
                    <th scope="col">Alimento</th>
                    <th scope="col">Produto do catálogo</th>
                    <th scope="col">Unidade</th>
                    <th scope="col">Quantidade</th>
                    <th scope="col">Preço (R$)</th>
                    <th scope="col">Remover</th>
                  </tr>
                </thead>
                <tbody>
                  {#each form.itens as item, i (item)}
                    <tr>
                      <td><input class="largo" aria-label="Item {i + 1}: alimento" bind:value={item.produto}></td>
                      <td>
                        <select class="largo" aria-label="Item {i + 1}: produto do catálogo" bind:value={item.produto_id}>
                          <option value={null}>Fora do catálogo</option>
                          {#each catalogo as produto (produto.id)}<option value={produto.id}>{produto.nome}</option>{/each}
                        </select>
                      </td>
                      <td><input aria-label="Item {i + 1}: unidade" bind:value={item.unidade}></td>
                      <td><CampoNumero id="item-{i}-quantidade" compacto aria-label="Item {i + 1}: quantidade" bind:texto={item.quantidadeTexto} /></td>
                      <td><CampoNumero id="item-{i}-preco" compacto aria-label="Item {i + 1}: preço em reais" bind:texto={item.precoTexto} /></td>
                      <td><button type="button" class="botao-secundario" onclick={() => form.itens.splice(i, 1)} aria-label="Remover o item {i + 1}">Remover</button></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </CaixaRolavel>
          {/if}
          <button type="button" class="botao-secundario incluir" onclick={incluirItem}>Incluir item</button>

          <p class="erro" role="alert">{erro.edicao}</p>
          <div class="acoes">
            <button type="submit" class="botao-secundario" disabled={ocupado}>Salvar rascunho</button>
            <button type="button" onclick={publicar} disabled={ocupado}>Publicar</button>
          </div>
        </form>
      {:else}
        <p>
          {aberta.chamada.orgao ?? ''} · {aberta.chamada.municipio ?? ''}/{aberta.chamada.uf ?? ''} · recebe projetos de
          {data(aberta.chamada.data_publicacao)} a {data(aberta.chamada.prazo_envio)}
        </p>
        <CaixaRolavel rotulo="Itens da chamada">
          <table>
            <thead>
              <tr><th scope="col">Alimento</th><th scope="col">Unidade</th><th scope="col">Quantidade</th><th scope="col">Preço</th><th scope="col">Valor total</th></tr>
            </thead>
            <tbody>
              {#each aberta.chamada.itens as item, i (i)}
                <tr>
                  <td>{item.produto}</td><td>{item.unidade}</td><td class="numero">{numero(item.quantidade, 2)}</td>
                  <td class="numero">{reais(item.preco_unitario)}</td><td class="numero">{reais(item.valor_total ?? 0)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </CaixaRolavel>

        <h3>Propostas recebidas</h3>
        {#if aberta.propostas.length === 0}
          <p>Nenhuma proposta ainda.</p>
        {/if}
        {#each aberta.propostas as proposta (proposta.id)}
          <article class="proposta" aria-labelledby="titulo-proposta-{proposta.id}">
            <h4 id="titulo-proposta-{proposta.id}">{proposta.cooperativa.nome} ({proposta.cooperativa.municipio}/{proposta.cooperativa.uf})</h4>
            <p id="texto-proposta-{proposta.id}">
              Oferece {proposta.itens.filter((item) => item.quantidade > 0).length} de {proposta.itens.length} itens, no total de
              {reais(proposta.total)}. {plural(proposta.entregas.length, 'entrega registrada', 'entregas registradas')}.
            </p>
            <Ouvir alvo="texto-proposta-{proposta.id}" />
            <CaixaRolavel rotulo="Itens da proposta de {proposta.cooperativa.nome}">
              <table>
                <thead>
                  <tr><th scope="col">Alimento</th><th scope="col">Unidade</th><th scope="col">Pedido</th><th scope="col">Oferecido</th><th scope="col">Falta</th><th scope="col">Valor</th></tr>
                </thead>
                <tbody>
                  {#each proposta.itens as item, i (i)}
                    <tr>
                      <td>{item.produto}</td><td>{item.unidade}</td><td class="numero">{numero(item.quantidade_pedida, 2)}</td>
                      <td class="numero">{numero(item.quantidade, 2)}</td><td class="numero">{numero(item.falta, 2)}</td><td class="numero">{reais(item.valor)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </CaixaRolavel>
            {#if proposta.entregas.length > 0}
              <CaixaRolavel rotulo="Entregas de {proposta.cooperativa.nome}">
                <table>
                  <thead>
                    <tr><th scope="col">Data</th><th scope="col">Alimento</th><th scope="col">Quantidade</th><th scope="col">Valor</th><th scope="col">No prazo</th></tr>
                  </thead>
                  <tbody>
                    {#each proposta.entregas as entrega (entrega.id)}
                      <tr>
                        <td>{data(entrega.data)}</td><td>{nomeDoItem(proposta, entrega)}</td>
                        <td class="numero">{numero(entrega.quantidade, 2)}</td><td class="numero">{reais(entrega.valor)}</td>
                        <td>{entrega.no_prazo ? 'sim' : 'não'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </CaixaRolavel>
            {/if}
          </article>
        {/each}
      {/if}
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

  .linha-form button[type='submit'] {
    margin-top: 1rem;
  }

  progress {
    width: 100%;
    height: 1.5rem;
    accent-color: var(--verde);
  }

  .avisos li {
    margin-bottom: 0.25rem;
  }

  .sucesso {
    color: var(--verde);
    font-weight: 600;
  }

  /* campos da tabela de itens: largos o bastante para digitar; a tabela rola dentro da caixa no celular */
  .edicao input,
  .edicao :global(input),
  .edicao select {
    min-width: 7rem;
  }

  .edicao .largo {
    min-width: 13rem;
  }

  .numero {
    text-align: right;
    white-space: nowrap;
  }

  .incluir {
    margin-top: 1rem;
  }

  .acoes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .acoes button {
    flex: 1 1 12rem;
    margin-top: 1.5rem;
  }

  .proposta {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 2px solid var(--linha);
  }

  /* a caixa que rola é do CaixaRolavel: o estilo daqui só a alcança com :global */
  .proposta :global(.rolavel + .rolavel) {
    margin-top: 1rem;
  }

  @media (min-width: 768px) {
    .campos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 1.5rem;
    }

    /* o botão fica na linha do campo, e não do "Entendi: ..." que o CampoNumero põe embaixo dele: o topo do botão desce a altura do rótulo */
    .linha-form {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
    }

    .linha-form button[type='submit'] {
      margin-top: 2.75rem;
    }

    .acoes button {
      flex: 0 0 auto;
    }
  }
</style>
