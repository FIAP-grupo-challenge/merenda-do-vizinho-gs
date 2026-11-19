<!-- Campo de número do jeito brasileiro (lerNumero, em formato.js): "10,5", "1.234,56" e "12.000" são entendidos igual em
     qualquer navegador, e a tela mostra logo abaixo o número que entendeu, ou o que está errado.
     O texto fica com quem usa (bind:texto): na hora de enviar, o número é lerNumero(texto).valor. Texto que não é número
     deixa o campo inválido para o navegador, então o formulário não envia e o foco vai para ele.
     Uso: <label for="peso">Peso</label> <CampoNumero id="peso" bind:texto={peso} required />
     formato: como mostrar o número entendido (numero, ou reais para dinheiro); descricao: id de outra dica do campo. -->
<script>
  import { lerNumero, numero } from './formato.js';

  let { id, texto = $bindable(), formato = numero, descricao = '', ...resto } = $props();

  const lido = $derived(lerNumero(texto));
  let campo = $state();
  $effect(() => campo.setCustomValidity(lido.erro));
</script>

<input
  bind:this={campo}
  {id}
  type="text"
  inputmode="decimal"
  autocomplete="off"
  bind:value={texto}
  aria-invalid={lido.erro !== ''}
  aria-describedby="{id}-lido {descricao}"
  {...resto}>
{#if lido.erro}
  <p class="erro" id="{id}-lido">{lido.erro}</p>
{:else if lido.valor !== null}
  <p class="dica" id="{id}-lido">Entendi: {formato(lido.valor)}</p>
{/if}

<style>
  /* o .erro do estilo.css tem 0.75rem em cima, para a mensagem de um formulário inteiro; aqui ela cola no campo */
  .erro {
    margin-top: 0.25rem;
  }
</style>
