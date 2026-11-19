// O prato de pontos do logo (Marca.svelte), com a conta do prato() do pitch (planejamento/pitch/apresentacao/fonte/gerar.py):
// fileiras de pontos dentro de um círculo de raio 100, e as de baixo, 45% dos pontos, em laranja.
// fileiras: quantas há do centro até a borda. No logo pequeno, menos fileiras e pontos maiores, para não virar borrão.
export function prato(fileiras) {
  const R = 100;
  const k = fileiras > 5 ? 0.23 : 0.3; // o raio do ponto, em passos
  const passo = R / (fileiras + 0.5 + k); // a borda do círculo cai no meio de duas fileiras: o contorno sai redondo
  const r = k * passo;
  const pontos = [];
  for (let j = -fileiras - 1; j <= fileiras + 1; j++) {
    for (let i = -fileiras - 1; i <= fileiras + 1; i++) {
      if (Math.hypot(i, j) * passo <= R - r) pontos.push({ x: i * passo, y: j * passo });
    }
  }
  // de baixo para cima e, na fileira que muda de cor, da esquerda para a direita
  const ordem = [...pontos].sort((a, b) => b.y - a.y || a.x - b.x);
  const laranja = new Set(ordem.slice(0, Math.round(0.45 * pontos.length)));
  return { r, pontos: pontos.map((p) => ({ ...p, laranja: laranja.has(p) })) };
}
