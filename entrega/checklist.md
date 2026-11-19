# Checklist da entrega

Os seis itens do slide "Checklist do grupo" do edital, com o estado em 19/11/2026, e o que o grupo ainda precisa fazer. Prazo: **19/11/2026, até 23h55, na plataforma** (sem prorrogação).

## Os seis itens do edital

| # | Item do edital | Estado | O que falta |
|:--|:--|:--|:--|
| 1 | Cada área roda seguindo só o README | **Feito.** O README foi testado num clone limpo com Docker, com Podman e sem Docker, e o `.zip` gerado pelo `empacotar.sh` foi descompactado e passou no teste de fumaça (`bash devops/smoke.sh`, que termina com `SMOKE OK`) | nada (se der tempo, um integrante segue o README no próprio computador) |
| 2 | O PDF tem a solução, a arquitetura e as evidências de cada área | **Feito**, menos os prints do Power BI e do TinkerCad, que aparecem no PDF como quadros "A preencher pelo grupo" | os 4 prints (passos 2 e 3 abaixo) |
| 3 | Os prints do dashboard e da IA funcionando estão no PDF | IA: **feito** (prints 2, 3 e 6, com a leitura real da chamada de Catalão pela IA). Dashboard: **falta** | `entrega/prints/powerbi-1.png` e `entrega/prints/powerbi-2.png` |
| 4 | A evidência de Docker, CI/CD ou monitoramento está no PDF | **Feito**: o smoke do Docker Compose e uma execução verde do Jenkins (seção 6.2) | nada |
| 5 | O .txt tem nome do grupo, RM e nome de cada integrante e o link do pitch | **Falta**: o `entrega/grupo.txt` está com os campos `[PREENCHER: ...]` | preencher o `entrega/grupo.txt` (passo 4) |
| 6 | Enviado na plataforma até 19/11, 23h55 | **Falta** | enviar (passo 8) |

## O que o grupo ainda precisa fazer, na ordem

1. **Gravar o pitch** de até 3 minutos, mostrando o site funcionando (nada de vídeo de slides). O roteiro está em `docs/roteiro-do-pitch.md`. Publique com acesso aberto (YouTube, Google Drive ou Vimeo) e **teste o link numa aba anônima**: link privado ou quebrado faz o pitch não ser avaliado.
2. **Power BI:** monte o painel seguindo `dados/powerbi/guia-do-painel.md` e salve os prints com estes nomes exatos:
   - `entrega/prints/powerbi-1.png`: a página 1 (PNAE no Brasil), com o ano 2022;
   - `entrega/prints/powerbi-2.png`: a página 2 (Cooperativa).
3. **TinkerCad:** monte o circuito (`iot/camara-fria/ligacoes.md`), cole o sketch (`iot/camara-fria/camara-fria.ino`), rode a simulação e salve:
   - `entrega/prints/tinkercad-circuito.png`: o circuito montado;
   - `entrega/prints/tinkercad-simulacao.png`: a simulação rodando, com o Monitor Serial mostrando as leituras.

   Copie também o link público do projeto no TinkerCad.
4. **Preencher os textos** (procure por `PREENCHER` e por `_(preencher`):
   - `entrega/grupo.txt`: o nome do grupo; uma linha `RM - Nome` para **cada** integrante (até 5; apague as linhas que sobrarem); e o link do pitch;
   - `README.md`, linha 6 (integrantes), linha 366 (link do TinkerCad), linha 536 ("Revisado por pessoas": quem do grupo revisou cada área e o que conferiu) e linha 553 (link do pitch). O edital pede o link do pitch no `.txt` **e** no README;
   - `iot/README.md`, linha 5 (link do TinkerCad);
   - `entrega/evidencias.md`, linha 276: troque `[PREENCHER: link público do projeto no TinkerCad]{.a-preencher-linha}` pelo link.
5. **Gerar o PDF de novo:** `bash entrega/gerar-pdf.sh` (precisa do `pandoc` e do `weasyprint`). O fim da saída deve dizer `nenhuma pendência do grupo no PDF`. Abra o `entrega/evidencias.pdf` e confira os prints novos.
6. **Commit e merge:** faça o commit dos arquivos mudados (os 4 prints, `entrega/grupo.txt`, `entrega/evidencias.md`, `entrega/evidencias.pdf`, `devops/evidencias/git-log.txt`, `README.md` e `iot/README.md`) e o merge do ramo na `main`, que é o ramo da entrega.
7. **Empacotar:** `bash entrega/empacotar.sh main`. Ele gera `entrega/merenda-do-vizinho.zip` a partir de um clone local da `main` (com a pasta `.git` e sem o `.env`) e confere o pacote. O fim deve dizer `PRONTO`, sem `ATENÇÃO` (pendências do grupo) e sem `PROBLEMA` (segurança). O `.zip` só leva o que tem commit: arquivo sem commit fica de fora, e o script avisa.
8. **Enviar na plataforma até 23h55:** o `entrega/merenda-do-vizinho.zip`, que já traz o código, o README, o PDF e o `.txt` (na pasta `entrega/` dentro dele). Se a plataforma tiver campos separados para o PDF e para o `.txt`, envie também `entrega/evidencias.pdf` e `entrega/grupo.txt`. Uma entrega por grupo.

## O que tira pontos (slide "Atenção" do edital)

- Entrega fora do padrão (sem README, PDF ou `.txt` com o link do pitch): −1 ponto.
- Link do pitch privado ou quebrado: o pitch não é avaliado.
- Tecnologia fora do conteúdo: a área não pontua (Svelte 5 e Vite nas telas são a exceção declarada no README).
- Área que não roda seguindo o README: a área não pontua.
- Cópia de projeto de terceiros sem crédito: nota zero (as fontes e os créditos estão no README e em `docs/fontes.md`).
