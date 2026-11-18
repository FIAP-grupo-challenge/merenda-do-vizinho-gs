# Ligações da câmara fria

Arduino Uno no TinkerCad. Todos os fios GND podem ir a qualquer pino GND do Arduino.

## Componentes

- Arduino Uno R3
- Sensor de temperatura TMP36
- Potenciômetro de 10 kΩ (no lugar do sensor de força, mede o peso)
- Chave deslizante (slide switch), que simula a porta
- LED vermelho
- Resistor de 220 Ω
- Buzzer piezo
- Protoboard e fios

## Ligações

O TMP36, visto de frente (parte chata virada para você), tem da esquerda para a direita: +, saída e GND.

| Pino do Arduino | Componente | Fio |
|---|---|---|
| 5V | TMP36: pino da esquerda (+) | vermelho |
| A0 | TMP36: pino do meio (saída) | amarelo |
| GND | TMP36: pino da direita (GND) | preto |
| 5V | Potenciômetro: uma das pontas | vermelho |
| A1 | Potenciômetro: pino do meio (cursor) | laranja |
| GND | Potenciômetro: a outra ponta | preto |
| D2 | Chave deslizante: perna do meio | verde |
| GND | Chave deslizante: uma das pernas das pontas (a outra fica sem fio) | preto |
| D13 | Resistor de 220 Ω: uma das pontas | azul |
| — | Resistor de 220 Ω: a outra ponta, na perna longa (+) do LED | azul |
| GND | LED: perna curta (−) | preto |
| D8 | Buzzer piezo: terminal + | branco |
| GND | Buzzer piezo: terminal − | preto |

- Linhas com "—" ligam dois componentes entre si, sem pino do Arduino.
- Porta: com o cursor da chave do lado da perna ligada ao GND, D2 lê LOW e a porta está fechada. Com o cursor do lado da perna sem fio, a chave não liga D2 ao GND, o `INPUT_PULLUP` mantém D2 em HIGH e a porta está aberta.
- O resistor de 220 Ω limita a corrente do LED.
