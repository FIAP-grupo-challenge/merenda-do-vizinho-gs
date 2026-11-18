# Câmara fria (IoT)

Simulação da câmara fria de uma cooperativa. Um Arduino Uno, montado no TinkerCad, mede temperatura, peso e a porta. Um simulador em Python gera leituras no mesmo formato e as envia à API (`POST /api/leituras`).

- **Link do projeto no TinkerCad:** _(preencher)_
- **Print do circuito:** _(preencher)_
- **Ligações (pino, componente, fio):** [camara-fria/ligacoes.md](camara-fria/ligacoes.md)
- **Sketch:** [camara-fria/camara-fria.ino](camara-fria/camara-fria.ino)

## Arduino no TinkerCad

1. Monte o circuito seguindo `camara-fria/ligacoes.md` e cole `camara-fria/camara-fria.ino` no editor de código.
2. Inicie a simulação e abra o Monitor Serial a 9600 baud. A cada 2 segundos aparece uma linha JSON, como `{"dispositivo":"camara-01","temperatura_c":6.4,"peso_kg":182.0,"porta_aberta":false}`.
3. Para simular a porta aberta, solte o botão da chave. O LED acende e o buzzer toca se a temperatura passar de 10 °C ou se a porta ficar aberta por mais de 120 segundos.

## Simulador

Só biblioteca padrão do Python (3.12 ou mais novo). Rode da raiz do repositório:

    python3 iot/simulador.py --cenario porta-aberta --seco --quantidade 5

Com `--seco`, o simulador só imprime as leituras. Sem ele, cada leitura é enviada à API e a linha começa com o status: `201` quando a API aceita. A chave vem de `--chave` ou da variável `CHAVE_DISPOSITIVO` (copie o valor do seu `.env`, que não vai ao Git):

    export CHAVE_DISPOSITIVO=...
    python3 iot/simulador.py --cenario entrega

Cenários (`--cenario`):

| Cenário | O que simula |
|---|---|
| `normal` | 4 a 7 °C, com 180 kg estáveis e a porta fechada |
| `porta-aberta` | porta aberta, com a temperatura subindo 0,4 °C por leitura, de 5 °C até 18 °C |
| `entrega` | o peso cai 15 kg por leitura, até 20 kg |
| `colheita` | o peso sobe 20 kg por leitura, até 480 kg |

Outras opções: `--url` (padrão `http://localhost:3000/api/leituras`), `--intervalo` em segundos (padrão 2) e `--quantidade` (padrão 30). O programa sai com código 1 se alguma resposta não for 201 ou se a API não responder.

## Testes

Da raiz do repositório:

    .venv/bin/python -m unittest discover -s iot -t .
