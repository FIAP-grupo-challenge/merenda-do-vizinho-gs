# Ligações da câmara fria

Arduino Uno no TinkerCad. Todos os fios GND podem ir a qualquer pino GND do Arduino.

O TMP36, visto de frente (parte chata virada para você), tem da esquerda para a direita: +, saída e GND.

| Pino do Arduino | Componente | Fio |
|---|---|---|
| 5V | TMP36: pino da esquerda (+) | vermelho |
| A0 | TMP36: pino do meio (saída) | amarelo |
| GND | TMP36: pino da direita (GND) | preto |
| 5V | Potenciômetro: uma das pontas | vermelho |
| A1 | Potenciômetro: pino do meio (cursor) | laranja |
| GND | Potenciômetro: a outra ponta | preto |
| D2 | Chave da porta (botão de 4 pernas): uma perna de um dos lados | verde |
| GND | Chave da porta: uma perna do lado oposto | preto |
| D13 | Resistor de 220 Ω: uma das pontas | azul |
| — | Resistor de 220 Ω: a outra ponta, na perna longa (+) do LED | azul |
| GND | LED: perna curta (−) | preto |
| D8 | Buzzer piezo: terminal + | branco |
| GND | Buzzer piezo: terminal − | preto |

- Linhas com "—" ligam dois componentes entre si, sem pino do Arduino.
- Porta: com o botão pressionado, a porta está fechada (D2 lê LOW). Solte o botão para simular a porta aberta (D2 lê HIGH).
- O resistor de 220 Ω limita a corrente do LED.
