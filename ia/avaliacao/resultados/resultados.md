# Avaliação da leitura da chamada (19/11/2026)

Itens encontrados, corretos e com quantidade e preço certos: porcentagem sobre o total de itens dos gabaritos das chamadas de cada linha. A linha "ia" só conta as chamadas em que o Claude respondeu.

- "Encontrado": a leitura trouxe um item com o mesmo `produto_id` de um item do gabarito (ou, para produto fora do catálogo, com o mesmo nome, sem acento nem diferença de maiúsculas). "Correto": encontrado, com a mesma quantidade e o preço diferente em no máximo R$ 0,01.
- "Encontrados" é um piso: o produto fora do catálogo só casa pelo nome exato, e "Vagem fresca" no lugar de "Vagem" conta como não encontrado. "Quantidade e preço certos" não olha o nome: conta o item do gabarito para o qual a leitura trouxe um item com a mesma quantidade e o mesmo preço (R$ 0,01), com qualquer nome.

| Modo | Chamadas | Itens encontrados | Itens corretos | Quantidade e preço certos | Prazo correto | Tempo médio |
|---|---|---|---|---|---|---|
| regras | 8 | 66,7% | 56,1% | 61,4% | 37,5% | 1,4 s |
| ia | 8 | 95,6% | 95,6% | 100,0% | 100,0% | 27,6 s |

## Por chamada

| Chamada | Modo | Itens no gabarito | Encontrados | Corretos | Quantidade e preço certos | Prazo lido | Prazo do gabarito | Município/UF certo | Tempo | Tokens (entrada / saída) | Custo (US$) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 01-ba-estado-bahia-2026.pdf | regras | 16 | 0 | 0 | 0 | 2026-02-20 | 2026-02-20 | não | 4,9 s | - | - |
| 01-ba-estado-bahia-2026.pdf | ia | 16 | 14 | 14 | 16 | 2026-02-20 | 2026-02-20 | não | 26,3 s | 526.217 / 4.854 | 0,2752 |
| 02-ba-iraquara-2025.pdf | regras | 49 | 37 | 37 | 41 | - | 2025-03-14 | sim | 0,8 s | - | - |
| 02-ba-iraquara-2025.pdf | ia | 49 | 48 | 48 | 49 | 2025-03-14 | 2025-03-14 | sim | 29,9 s | 81.907 / 8.934 | 0,0127 |
| 03-go-aparecida-de-goiania-2025.pdf | regras | 54 | 51 | 51 | 54 | - | 2025-04-22 | sim | 1,5 s | - | - |
| 03-go-aparecida-de-goiania-2025.pdf | ia | 54 | 51 | 51 | 54 | 2025-04-22 | 2025-04-22 | sim | 40,9 s | 230.576 / 11.407 | 0,1438 |
| 04-go-catalao-2026.pdf | regras | 16 | 16 | 16 | 16 | 2026-07-30 | 2026-07-30 | sim | 0,4 s | - | - |
| 04-go-catalao-2026.pdf | ia | 16 | 16 | 16 | 16 | 2026-07-30 | 2026-07-30 | sim | 18,1 s | 45.158 / 4.914 | 0,0070 |
| 05-go-goiania-2026.pdf | regras | 16 | 0 | 0 | 0 | - | 2026-02-20 | sim | 1,2 s | - | - |
| 05-go-goiania-2026.pdf | ia | 16 | 14 | 14 | 16 | 2026-02-20 | 2026-02-20 | sim | 27,9 s | 153.282 / 6.904 | 0,0939 |
| 06-mg-santos-dumont-2025.pdf | regras | 24 | 15 | 15 | 20 | - | 2025-03-26 | sim | 0,5 s | - | - |
| 06-mg-santos-dumont-2025.pdf | ia | 24 | 24 | 24 | 24 | 2025-03-26 | 2025-03-26 | sim | 23,9 s | 57.371 / 6.361 | 0,0089 |
| 08-pr-manfrinopolis-2026.pdf | regras | 43 | 24 | 0 | 0 | 2026-02-04 | 2026-02-04 | sim | 1,4 s | - | - |
| 08-pr-manfrinopolis-2026.pdf | ia | 43 | 42 | 42 | 43 | 2026-02-04 | 2026-02-04 | sim | 33,9 s | 127.559 / 9.510 | 0,0876 |
| 10-rs-sao-borja-2025.pdf | regras | 10 | 9 | 9 | 9 | - | 2025-04-09 | sim | 0,3 s | - | - |
| 10-rs-sao-borja-2025.pdf | ia | 10 | 9 | 9 | 10 | 2025-04-09 | 2025-04-09 | sim | 20,2 s | 51.769 / 5.409 | 0,0079 |

Custo total da IA (claude-haiku-5-5): US$ 0,6369.
