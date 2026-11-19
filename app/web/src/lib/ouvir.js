// Lê em voz alta, em português do Brasil, o texto dado. O botão <Ouvir alvo="id" /> (Ouvir.svelte) usa esta função.
// Só chame quando o navegador tem voz ('speechSynthesis' in window): sem ela, o botão nem aparece.
export function ouvir(texto) {
  speechSynthesis.cancel(); // um clique novo para a leitura anterior
  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = 'pt-BR';
  const voz = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-') === 'pt-BR');
  if (voz) fala.voice = voz;
  speechSynthesis.speak(fala);
}
