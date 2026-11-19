<!-- Caixa de tabela larga: a tabela rola dentro dela, nunca a página (Global Constraints, classe .rolavel).
     Uso: <CaixaRolavel rotulo="Itens da chamada"><table>...</table></CaixaRolavel> -->
<script>
  let { rotulo, children } = $props();
</script>

<!-- tabindex="0": sem foco, quem usa só o teclado não rola a caixa (WCAG 2.1.1). O aviso do Svelte não conhece esse caso. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="rolavel" role="region" tabindex="0" aria-label={rotulo}>
  {@render children()}
</div>

<style>
  /* o que tiver position: absolute lá dentro (como o texto só para leitor de tela) fica preso na caixa;
     sem isto, ele se posiciona pela página e a alarga no celular */
  .rolavel {
    position: relative;
  }
</style>
