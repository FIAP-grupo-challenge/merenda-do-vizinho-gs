<!-- O logo do Colhe, o "prato" do pitch: fileiras de plantio num círculo, com as de baixo, 45% dos pontos, em laranja
     (a parte da merenda que a lei reserva à agricultura familiar). As cores são as do pitch para o fundo verde-escuro
     (o topo e a capa). Só enfeite: o nome "Colhe" vem ao lado, em texto.
     Uso: <Marca /> no topo; <Marca fileiras={7} />, grande, na capa da tela de entrar. -->
<script>
  import { prato } from './prato.js';

  let { fileiras = 3 } = $props();
  const desenho = $derived(prato(fileiras));
</script>

<svg class="marca" viewBox="-115 -115 230 230" aria-hidden="true" focusable="false">
  <circle r="110" fill="none" stroke="#2F6447" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  {#each desenho.pontos as p}
    <circle cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r={desenho.r.toFixed(2)} fill={p.laranja ? '#F59A4E' : '#9CCB8A'} />
  {/each}
</svg>
