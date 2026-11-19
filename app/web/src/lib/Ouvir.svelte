<!-- Botão "Ouvir": lê em voz alta o texto do elemento com o id dado.
     Uso: <p id="aviso">...</p> <Ouvir alvo="aviso" /> -->
<script>
  import { ouvir } from './ouvir.js';

  let { alvo } = $props();

  function ler() {
    const elemento = document.getElementById(alvo);
    if (elemento) ouvir(elemento.innerText);
  }
</script>

<!-- navegador sem voz: o botão some em vez de não fazer nada -->
{#if 'speechSynthesis' in window}
  <button type="button" class="botao-secundario" onclick={ler}>Ouvir</button>
{/if}
