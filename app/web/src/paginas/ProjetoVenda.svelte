<!-- Projeto de venda (/projeto-venda.html) nos campos do modelo do FNDE (Res. CD/FNDE 4/2026, Anexo VI), pronto para
     imprimir. ?proposta=<id>: o da cooperativa (grupo formal); ?chamada=<id>: o individual do agricultor.
     O que o app não coleta sai como linha em branco, para preencher à mão. -->
<script>
  import { api, sair } from '../lib/api.js';
  import CaixaRolavel from '../lib/CaixaRolavel.svelte';
  import Marca from '../lib/Marca.svelte';
  import Ouvir from '../lib/Ouvir.svelte';
  import { numero, reais } from '../lib/formato.js';

  const parametros = new URLSearchParams(location.search);
  const proposta = parametros.get('proposta');
  const chamada = parametros.get('chamada');
  const voltar = proposta ? '/cooperativa.html' : '/agricultor.html';

  const cnpj = (digitos) => String(digitos ?? '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const lugar = (municipio, uf) => (municipio || uf ? `${municipio ?? ''}/${uf ?? ''}` : null);

  let projeto = $state(null);
  let erro = $state('');
  const grupo = $derived(projeto?.proponente.tipo === 'grupo-formal');
  const linhasDoProjeto = $derived(grupo ? (projeto?.totais_por_produto ?? []) : (projeto?.fornecedores[0]?.itens ?? []));

  async function carregar() {
    try {
      if (proposta) projeto = await api('GET', `/api/cooperativa/propostas/${encodeURIComponent(proposta)}/projeto-venda`);
      else if (chamada) projeto = await api('GET', `/api/agricultor/chamadas/${encodeURIComponent(chamada)}/projeto-venda`);
      else erro = 'Abra esta página pela proposta da cooperativa ou pela chamada, na tela do agricultor.';
    } catch (falha) {
      erro = falha.message;
    }
  }
  carregar();
</script>

<!-- Um campo do formulário. Sem valor, sai a linha em branco; com `completar`, sai o valor e a linha (CPF e CAF com máscara). -->
{#snippet campo(rotulo, valor, completar = false)}
  <p class="campo">
    <span class="rotulo">{rotulo}:</span>
    {#if valor}<span>{valor}</span>{/if}
    {#if !valor || completar}<span class="linha"></span>{/if}
  </p>
{/snippet}

{#snippet tabelaDeItens(linhas, rotulo, total, rotuloDoTotal)}
  <CaixaRolavel {rotulo}>
    <table>
      <thead>
        <tr>
          <th scope="col">Alimento</th>
          <th scope="col">Unidade</th>
          <th scope="col">Quantidade</th>
          <th scope="col">Preço unitário</th>
          <th scope="col">Valor</th>
        </tr>
      </thead>
      <tbody>
        {#each linhas as linha, i (i)}
          <tr>
            <td>{linha.produto}</td>
            <td>{linha.unidade}</td>
            <td class="numero">{numero(linha.quantidade, 2)}</td>
            <td class="numero">{reais(linha.preco_unitario)}</td>
            <td class="numero">{reais(linha.valor)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr><th scope="row" colspan="4">{rotuloDoTotal}</th><td class="numero">{reais(total)}</td></tr>
      </tfoot>
    </table>
  </CaixaRolavel>
{/snippet}

<header class="topo so-tela">
  <Marca />
  <h1>Colhe</h1>
  <button type="button" class="botao-secundario" onclick={sair}>Sair</button>
</header>

<main>
  <section class="cartao so-tela" aria-label="Como usar">
    <p id="instrucoes">
      Confira o projeto de venda, imprima e complete à mão as linhas em branco: são dados que o app não guarda. O CPF e o CAF
      aparecem com máscara, por segurança: escreva os números completos. Depois, assine e entregue na prefeitura com os
      documentos que o edital pede.
    </p>
    <Ouvir alvo="instrucoes" />
    {#if projeto}
      <p id="total-projeto">
        Chamada {projeto.cabecalho.numero}: {projeto.fornecedores.length === 1 ? '1 agricultor' : `${projeto.fornecedores.length} agricultores`},
        {linhasDoProjeto.length === 1 ? '1 alimento' : `${linhasDoProjeto.length} alimentos`}, valor total de {reais(projeto.valor_total)}.
      </p>
      <Ouvir alvo="total-projeto" />
    {/if}
    {#if projeto?.avisos.length > 0}
      <h2>Atenção</h2>
      <ul id="avisos">
        {#each projeto.avisos as aviso, i (i)}
          <li>{aviso}</li>
        {/each}
      </ul>
      <Ouvir alvo="avisos" />
    {/if}
    <p class="erro" role="alert">{erro}</p>
    <div class="acoes">
      <a class="botao botao-secundario" href={voltar}>Voltar</a>
      <button type="button" onclick={() => print()} disabled={!projeto}>Imprimir</button>
    </div>
  </section>

  {#if projeto}
    <article class="cartao documento" aria-label="Projeto de venda">
      <h2>Projeto de venda de gêneros alimentícios da agricultura familiar para a alimentação escolar (PNAE)</h2>
      <p>Identificação da proposta de atendimento à chamada pública nº {projeto.cabecalho.numero ?? '______'}</p>

      {#if grupo}
        <h3>I. Identificação do grupo formal</h3>
        {@render campo('Nome do proponente', projeto.proponente.nome)}
        {@render campo('CNPJ', cnpj(projeto.proponente.cnpj))}
        {@render campo('Nº do CAF Pessoa Jurídica', null)}
        {@render campo('Endereço', null)}
        {@render campo('Município/UF', lugar(projeto.proponente.municipio, projeto.proponente.uf))}
        {@render campo('CEP', null)}
        {@render campo('E-mail', null)}
        {@render campo('DDD/Telefone', null)}
        {@render campo('Banco', null)}
        {@render campo('Agência', null)}
        {@render campo('Conta corrente', null)}
        {@render campo('Nº de associados ou cooperados', null)}
        {@render campo('Nº de participantes com CAF Pessoa Física neste projeto', String(projeto.fornecedores.length))}
        <h4>Representante legal</h4>
        {@render campo('Nome', null)}
        {@render campo('CPF', null)}
        {@render campo('DDD/Telefone', null)}
        {@render campo('E-mail', null)}
        {@render campo('Endereço', null)}
        {@render campo('Município/UF', null)}

        <h3>II. Agricultores participantes e alimentos de cada um</h3>
        {#each projeto.fornecedores as fornecedor, i (fornecedor.agricultor_id)}
          <section class="fornecedor" aria-label="Participante {i + 1}: {fornecedor.nome}">
            <h4>{i + 1}. {fornecedor.nome}</h4>
            {@render campo('CPF', fornecedor.cpf, true)}
            {@render campo('Nº do CAF Pessoa Física (ou NIS)', fornecedor.caf, true)}
            {@render campo('Município/UF do CAF', lugar(fornecedor.municipio_caf, fornecedor.uf_caf))}
            {@render campo('Povo ou comunidade tradicional', null)}
            {@render campo('Identidade de gênero', null)}
            {@render campo('Forma de anuência (assinatura física, assinatura eletrônica avançada ou qualificada, ou termo de anuência e cofornecimento)', null)}
            {@render tabelaDeItens(fornecedor.itens, `Alimentos de ${fornecedor.nome}`, fornecedor.valor_total, 'Valor total do agricultor')}
          </section>
        {/each}

        <h3>III. Totalização por alimento</h3>
        {@render tabelaDeItens(projeto.totais_por_produto, 'Totalização por alimento', projeto.valor_total, 'Valor total do projeto')}
      {:else}
        <h3>I. Identificação do fornecedor individual</h3>
        {@render campo('Nome', projeto.proponente.nome)}
        {@render campo('CPF', projeto.proponente.cpf, true)}
        {@render campo('Nº do CAF Pessoa Física', projeto.proponente.caf, true)}
        {@render campo('NIS', null)}
        {@render campo('Identidade de gênero', null)}
        {@render campo('Povo ou comunidade tradicional', null)}
        {@render campo('Endereço', null)}
        {@render campo('Município/UF', lugar(projeto.proponente.municipio, projeto.proponente.uf))}
        {@render campo('CEP', null)}
        {@render campo('E-mail', null)}
        {@render campo('DDD/Telefone', null)}
        {@render campo('Banco', null)}
        {@render campo('Agência', null)}
        {@render campo('Conta corrente ou poupança', null)}

        <h3>II. Alimentos</h3>
        {@render tabelaDeItens(linhasDoProjeto, 'Alimentos do projeto', projeto.valor_total, 'Valor total do projeto')}
      {/if}

      <h3>{grupo ? 'IV' : 'III'}. Cronograma de entrega</h3>
      {#each linhasDoProjeto as linha, i (i)}
        {@render campo(`${linha.produto} (${linha.unidade}): cronograma e periodicidade`, null)}
      {/each}

      <h3>{grupo ? 'V' : 'IV'}. Entidade executora</h3>
      {@render campo('Nome', projeto.cabecalho.orgao)}
      {@render campo('Município/UF', lugar(projeto.cabecalho.municipio, projeto.cabecalho.uf))}
      {@render campo('Endereço', null)}
      {@render campo('Local de entrega (do edital)', projeto.cabecalho.local_entrega)}

      <h3>Declaração</h3>
      <p>
        Declaro estar de acordo com as condições estabelecidas neste projeto e que as informações acima conferem com as
        condições de fornecimento.
      </p>
      {@render campo('Local e data', null)}
      {@render campo(grupo ? 'Assinatura do representante do grupo formal' : 'Assinatura do fornecedor individual', null)}
      {#if grupo}
        <h4>Assinatura dos agricultores participantes</h4>
        {#each projeto.fornecedores as fornecedor (fornecedor.agricultor_id)}
          {@render campo(fornecedor.nome, null)}
        {/each}
      {/if}
    </article>
  {/if}
</main>

<style>
  .acoes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .documento h3 {
    margin-top: 2rem;
    padding-bottom: 0.25rem;
    border-bottom: 2px solid var(--verde);
  }

  .campo {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0 0.5rem;
    margin: 0.75rem 0 0;
  }

  .rotulo {
    font-weight: 600;
  }

  /* a linha em branco ocupa o resto da linha do campo */
  .linha {
    flex: 1 0 8rem;
    height: 1.4em;
    border-bottom: 1px solid currentColor;
  }

  .fornecedor {
    margin-top: 1.5rem;
  }

  .numero {
    text-align: right;
    white-space: nowrap;
  }

  tfoot th,
  tfoot td {
    font-weight: 700;
  }

  @media print {
    .so-tela {
      display: none;
    }

    :global(html) {
      font-size: 11pt;
    }

    :global(body) {
      background: #ffffff;
    }

    main {
      max-width: none;
      padding: 0;
    }

    .documento {
      border: 0;
      padding: 0;
      color: #000000;
    }

    .documento h3 {
      border-bottom-color: #000000;
      break-after: avoid;
    }

    /* no papel, nada rola: a tabela sai inteira */
    .documento :global(.rolavel) {
      overflow: visible;
    }

    th,
    td {
      border: 1px solid #000000;
    }

    tr,
    .campo,
    .fornecedor h4 {
      break-inside: avoid;
    }
  }
</style>
