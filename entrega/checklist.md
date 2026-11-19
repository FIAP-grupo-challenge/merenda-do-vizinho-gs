# Checklist da entrega

Prazo: **19/11/2026, até 23h55, na plataforma** (sem prorrogação). Uma entrega por grupo. Marque `[x]` ao terminar cada item, na ordem.

**A entrega sai sempre da `main`.** O `entrega/merenda-do-vizinho.zip` que sobra de um teste com outro ramo (a saída do `empacotar.sh` avisa "só de TESTE", e o `PRONTO` diz de que ramo ele é) **não pode ser enviado**.

## 1. Os itens do grupo, no lugar

- [ ] **Pitch:** grave o vídeo de até 3 minutos, mostrando o site funcionando (nada de vídeo de slides; o roteiro está em `docs/roteiro-do-pitch.md`). Publique com acesso aberto (YouTube, Google Drive ou Vimeo) e **teste o link numa aba anônima**: link privado ou quebrado faz o pitch não ser avaliado.
- [ ] **Prints do Power BI:** monte o painel seguindo `dados/powerbi/guia-do-painel.md` e salve com estes nomes exatos:
  - `entrega/prints/powerbi-1.png`: a página 1 (PNAE no Brasil), com o ano 2022;
  - `entrega/prints/powerbi-2.png`: a página 2 (Cooperativa).
- [ ] **Prints do TinkerCad:** monte o circuito (`iot/camara-fria/ligacoes.md`), cole o sketch (`iot/camara-fria/camara-fria.ino`), rode a simulação e salve:
  - `entrega/prints/tinkercad-circuito.png`: o circuito montado;
  - `entrega/prints/tinkercad-simulacao.png`: a simulação rodando, com o Monitor Serial mostrando as leituras.

  Copie também o link público do projeto no TinkerCad.
- [ ] **Corte o que identifica pessoa:** antes de salvar cada print do Power BI e do TinkerCad, corte (ou tape) o nome da conta, o e-mail e a foto de perfil que aparecem no canto da tela. O PDF e o `.zip` vão para a plataforma.
- [ ] **Textos** (procure por `PREENCHER` e por `_(preencher`; o `gerar-pdf.sh` e o `empacotar.sh` listam o que ainda falta, com o número da linha):
  - [ ] `entrega/grupo.txt`: o nome do grupo; uma linha `RM - Nome` para **cada** integrante (até 5; apague as linhas que sobrarem); e o link do pitch;
  - [ ] `README.md`: os integrantes, o link do TinkerCad, "Revisado por pessoas" (quem do grupo revisou cada área e o que conferiu) e o link do pitch (o edital pede o link do pitch no `.txt` **e** no README);
  - [ ] `iot/README.md`: o link do TinkerCad;
  - [ ] `entrega/evidencias.md`: o link do TinkerCad (troque o `[PREENCHER: link público do projeto no TinkerCad]{.a-preencher-linha}` pelo link).
- [ ] Os prints e os textos estão **com commit** (o `.zip` só leva o que tem commit: o script avisa do que ficou de fora).

## 2. Merge na `main`

- [ ] Faça o merge do ramo de trabalho na `main`, **com o OK de quem cuida do repositório**. Daqui em diante, tudo é feito na `main`.

## 3. Na `main`: gerar o PDF e fazer o commit

- [ ] `bash entrega/gerar-pdf.sh` (precisa do `pandoc` e do `weasyprint`). O fim da saída deve dizer `nenhuma pendência do grupo no PDF`. Se der erro, o `entrega/evidencias.pdf` anterior é mantido: leia a mensagem e rode de novo.
- [ ] Abra o `entrega/evidencias.pdf` e confira: os 4 prints novos no lugar, nenhum quadro "A preencher pelo grupo" e nenhum nome de conta ou e-mail aparecendo.
- [ ] Faça o commit, na `main`, do `entrega/evidencias.pdf` e do `devops/evidencias/git-log.txt` (a primeira linha dele diz de que ramo o histórico foi tirado: tem de dizer `main`).

## 4. Empacotar

- [ ] `bash entrega/empacotar.sh main`. Ele monta o `entrega/merenda-do-vizinho.zip` a partir de um clone da `main` (com a pasta `.git` e sem o `.env`) e confere o pacote. O fim deve dizer `PRONTO ... do ramo main`, **sem** `ATENÇÃO` (pendências do grupo) e **sem** `PROBLEMA` (segurança). Com `PROBLEMA`, nenhum `.zip` é gerado: leia a mensagem, corrija e rode de novo.

## 5. Enviar na plataforma, até 23h55

- [ ] Envie o `entrega/merenda-do-vizinho.zip` (feito da `main`), o `entrega/evidencias.pdf` e o `entrega/grupo.txt`. O `.zip` já traz o código, o README, o PDF e o `.txt` (na pasta `entrega/` dentro dele), então, se a plataforma aceitar só um arquivo, o `.zip` basta.

## Antes de enviar: os seis itens do slide "Checklist do grupo" do edital

- [ ] Cada área roda seguindo só o README (descompacte o `.zip` numa pasta nova e siga o README, ou rode `bash devops/smoke.sh`, que termina com `SMOKE OK`).
- [ ] O PDF tem a solução, a arquitetura e as evidências de cada área.
- [ ] Os prints do dashboard (Power BI) e da IA funcionando estão no PDF.
- [ ] A evidência de Docker, CI/CD ou monitoramento está no PDF (seção 6.2).
- [ ] O `.txt` tem nome do grupo, RM e nome de cada integrante e o link do pitch.
- [ ] Enviado na plataforma até 19/11, 23h55.

## O que tira pontos (slide "Atenção" do edital)

- Entrega fora do padrão (sem README, PDF ou `.txt` com o link do pitch): −1 ponto.
- Link do pitch privado ou quebrado: o pitch não é avaliado.
- Tecnologia fora do conteúdo: a área não pontua (Svelte 5 e Vite nas telas são a exceção declarada no README).
- Área que não roda seguindo o README: a área não pontua.
- Cópia de projeto de terceiros sem crédito: nota zero (as fontes e os créditos estão no README e em `docs/fontes.md`).
