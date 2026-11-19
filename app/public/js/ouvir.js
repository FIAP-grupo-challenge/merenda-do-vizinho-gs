// Botão "Ouvir": lê em voz alta, em português do Brasil, o texto do elemento indicado.
// Uso: <p id="aviso">...</p> <button type="button" class="botao-secundario" data-ouvir="aviso">Ouvir</button>
function ouvir(texto) {
  speechSynthesis.cancel(); // um clique novo para a leitura anterior
  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = 'pt-BR';
  const voz = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-') === 'pt-BR');
  if (voz) fala.voice = voz;
  speechSynthesis.speak(fala);
}

if ('speechSynthesis' in window) {
  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-ouvir]');
    const alvo = botao && document.getElementById(botao.dataset.ouvir);
    if (alvo) ouvir(alvo.innerText);
  });
} else {
  // navegador sem voz: o botão some em vez de não fazer nada
  document.querySelectorAll('[data-ouvir]').forEach((botao) => {
    botao.hidden = true;
  });
}
