#!/usr/bin/env bash
# Gera entrega/merenda-do-vizinho.zip, o pacote da entrega, a partir de um clone local do ramo final (padrão: main).
# Nunca compacta a pasta de trabalho, que pode ter o .env com os segredos, o .venv, o node_modules, bancos e outras
# pastas fora do Git: o clone leva só o que está no commit, com a pasta .git (o histórico é a evidência de
# versionamento), mais o entrega/evidencias.pdf e o entrega/grupo.txt da pasta de trabalho.
# Depois confere o .zip: a lista de arquivos, os links simbólicos, o PDF (30 páginas ou mais) e as chaves: o valor de
# TODA variável do .env e o começo de chave de API e de chave privada, no conteúdo, no texto dos PDFs e nos objetos do
# Git. Qualquer problema apaga o .zip e sai com código 1 (nunca imprime o valor de um segredo, só o nome da variável).
# Uso, de qualquer pasta: bash entrega/empacotar.sh [ramo]
# Pode rodar quantas vezes quiser: o .zip é refeito do zero a cada vez.
set -euo pipefail
ramo="${1:-main}"
raiz="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
fonte="$(git -C "$raiz" rev-parse --path-format=absolute --git-common-dir)"
saida="$raiz/entrega/merenda-do-vizinho.zip"
rm -f "$saida"  # se qualquer coisa falhar daqui para a frente, nenhum .zip velho fica para trás para ser enviado por engano
command -v zip >/dev/null && command -v unzip >/dev/null || { echo 'falta o zip ou o unzip: instale e rode de novo' >&2; exit 1; }
git -C "$raiz" rev-parse --verify --quiet "refs/heads/$ramo^{commit}" >/dev/null \
  || { echo "o ramo $ramo não existe neste repositório" >&2; exit 1; }
for arquivo in evidencias.pdf grupo.txt; do
  [ -f "$raiz/entrega/$arquivo" ] || { echo "falta entrega/$arquivo (o PDF sai do bash entrega/gerar-pdf.sh)" >&2; exit 1; }
done

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp:?}"' EXIT
pasta="$tmp/merenda-do-vizinho"
avisos=()

echo "== 1. clone local do ramo $ramo"
git clone --quiet --no-local --no-tags --single-branch --branch "$ramo" "$fonte" "$pasta"
# o clone não guarda o caminho deste computador nem o reflog (que traz o nome de quem clonou)
git -C "$pasta" remote remove origin
rm -rf "${pasta:?}/.git/logs"
mkdir -p "$pasta/entrega"
for arquivo in evidencias.pdf grupo.txt; do
  if ! cmp -s "$raiz/entrega/$arquivo" "$pasta/entrega/$arquivo" 2>/dev/null; then
    avisos+=("entrega/$arquivo da pasta de trabalho é diferente do commit: o .zip leva a da pasta de trabalho (faça o commit)")
  fi
  cp "$raiz/entrega/$arquivo" "$pasta/entrega/$arquivo"
done
mudancas="$(git -C "$raiz" status --porcelain --untracked-files=no | grep -v -E ' entrega/(evidencias\.pdf|grupo\.txt)$' || true)"
[ -z "$mudancas" ] || avisos+=("há mudanças sem commit na pasta de trabalho, e elas NÃO entram no .zip:"$'\n'"$mudancas")
soltos="$(git -C "$raiz" ls-files --others --exclude-standard -- entrega/prints)"
[ -z "$soltos" ] || avisos+=("há prints fora do Git, que NÃO entram no .zip (faça o commit):"$'\n'"$soltos")

echo '== 2. .zip'
problemas=()
links="$(cd "$pasta" && find . -type l)"
[ -z "$links" ] || problemas+=("links simbólicos no clone:"$'\n'"$links")
(cd "$tmp" && zip -q -r -y -X pacote.zip merenda-do-vizinho)

echo '== 3. conferência da lista de arquivos (unzip -l)'
lista="$(unzip -Z1 "$tmp/pacote.zip")"
fora="$(grep -v '^merenda-do-vizinho/' <<<"$lista" || true)"
[ -z "$fora" ] || problemas+=("arquivos fora da pasta merenda-do-vizinho/:"$'\n'"$fora")
for esperado in .git/ .git/HEAD README.md docker-compose.yml entrega/evidencias.pdf entrega/grupo.txt; do
  grep -qx "merenda-do-vizinho/$esperado" <<<"$lista" || problemas+=("o .zip não tem $esperado")
done
proibidos="$(grep -E '(^|/)(\.env(\..*)?|\.venv|node_modules|__pycache__|ebooks|\.worktrees|\.superpowers)(/|$)|\.db(-journal|-wal|-shm)?$' \
  <<<"$lista" | grep -v -x 'merenda-do-vizinho/\.env\.example' || true)"
[ -z "$proibidos" ] || problemas+=("arquivos que não podem ir no .zip:"$'\n'"$proibidos")
# grep -c lê tudo: com o -q, o pipefail veria o zipinfo morto pelo SIGPIPE e o if daria falso
if zipinfo "$tmp/pacote.zip" | grep -c '^l' >/dev/null; then problemas+=('o .zip tem link simbólico'); fi
# o PDF que vai no .zip tem de abrir e ter as páginas todas (o de hoje tem 37): PDF quebrado ou cortado não vai
if command -v pdfinfo >/dev/null; then
  paginas="$(pdfinfo "$pasta/entrega/evidencias.pdf" 2>/dev/null | awk '/^Pages:/ {print $2}' || true)"
  echo "entrega/evidencias.pdf: ${paginas:-0} páginas"
  [ "${paginas:-0}" -ge 30 ] || problemas+=("entrega/evidencias.pdf não abre ou tem só ${paginas:-0} páginas (o certo é 30 ou mais): rode bash entrega/gerar-pdf.sh")
else
  avisos+=('sem o pdfinfo, não conferi se o PDF abre e tem as páginas todas')
fi
unzip -l "$tmp/pacote.zip" | tail -1
echo "na raiz da pasta merenda-do-vizinho/:"
grep -o -E '^merenda-do-vizinho/[^/]+/?' <<<"$lista" | sort -u | sed 's|^merenda-do-vizinho/|  |' | paste -sd ' '

echo '== 4. procura de chaves no conteúdo, no texto dos PDFs e nos objetos do Git'
mkdir "$tmp/conferir"
unzip -q "$tmp/pacote.zip" -d "$tmp/conferir"
repo="$tmp/conferir/merenda-do-vizinho"
git -C "$repo" cat-file --batch-all-objects --batch > "$tmp/objetos.txt"
: > "$tmp/pdfs.txt"
if command -v pdftotext >/dev/null; then
  while IFS= read -r -d '' pdf; do pdftotext -q "$pdf" - >> "$tmp/pdfs.txt" || true; done < <(find "$repo" -name '*.pdf' -print0)
else
  avisos+=('sem o pdftotext, o texto dos PDFs não foi conferido')
fi
# Os valores do .env desta pasta nunca são impressos, e nenhum pode aparecer no .zip. Vale TODA linha NOME=valor (com ou
# sem "export", com ou sem aspas), menos comentário, linha em branco, valor com menos de 16 caracteres e as variáveis
# que não são segredo. shortcut: valor de várias linhas não entra (a chave privada PEM é pega pelo começo dela, abaixo).
nao_segredo='DATA_REFERENCIA|SEMANAS_PADRAO|PORTA_APP|MODELO_CLAUDE|COMPOSE_PROJECT_NAME|PASTA_TRABALHO'
: > "$tmp/segredos.tsv"
if [ -f "$raiz/.env" ]; then
  awk -v ignorar="^($nao_segredo)$" '
    { sub(/\r$/, "") }
    /^[[:space:]]*(#|$)/ { next }
    { linha = $0; sub(/^[[:space:]]*(export[[:space:]]+)?/, "", linha)
      i = index(linha, "="); nome = substr(linha, 1, i - 1); sub(/[[:space:]]+$/, "", nome)
      if (i == 0 || nome !~ /^[A-Za-z_][A-Za-z0-9_]*$/ || nome ~ ignorar) next
      valor = substr(linha, i + 1); sub(/^[[:space:]]+/, "", valor)
      if (valor ~ /^"/) { valor = substr(valor, 2); sub(/".*$/, "", valor) }
      else if (valor ~ /^\047/) { valor = substr(valor, 2); sub(/\047.*$/, "", valor) }
      else sub(/[[:space:]]+#.*$/, "", valor)
      sub(/[[:space:]]+$/, "", valor)
      if (length(valor) >= 16) print nome "\t" valor }' "$raiz/.env" > "$tmp/segredos.tsv"
else
  avisos+=('sem .env nesta pasta: só procurei texto com cara de chave')
fi
# O começo de chave de API (Anthropic e GitHub) e de chave privada PEM, cada um escrito em duas partes para este script
# não achar a si mesmo dentro do .zip. O token do GitHub pede 20 letras ou dígitos depois do começo (um de verdade tem 36):
# só com os 4 caracteres, os bytes dos PNG e dos PDF dariam falso alarme ao acaso.
printf '%s\n' "sk-""ant-" "ghp""_[A-Za-z0-9]{20}" "github""_pat_" "-----""BEGIN" > "$tmp/prefixos.txt"
vazou="$(grep -r -a -l -E -f "$tmp/prefixos.txt" "$tmp/conferir" "$tmp/objetos.txt" "$tmp/pdfs.txt" || true)"
[ -z "$vazou" ] || problemas+=("texto com cara de chave de API ou de chave privada em:"$'\n'"${vazou//$tmp\//}")
while IFS=$'\t' read -r nome valor; do
  printf '%s\n' "$valor" > "$tmp/valor.txt"
  vazou="$(grep -r -a -l -F -f "$tmp/valor.txt" "$tmp/conferir" "$tmp/objetos.txt" "$tmp/pdfs.txt" || true)"
  [ -z "$vazou" ] || problemas+=("o valor de $nome, do .env, aparece em:"$'\n'"${vazou//$tmp\//}")
done < "$tmp/segredos.tsv"
git -C "$repo" fsck --no-progress >/dev/null 2>&1 || problemas+=('o git fsck achou erro no .git do .zip')
echo "objetos do Git conferidos: $(git -C "$repo" count-objects -v | awk '/^(count|in-pack):/ {s += $2} END {print s}');" \
  "commits: $(git -C "$repo" rev-list --count HEAD); PDFs: $(find "$repo" -name '*.pdf' | wc -l)"

echo '== 5. o que ainda falta do grupo (o .zip é gerado mesmo assim)'
pendencias=()
grep -q PREENCHER "$repo/entrega/grupo.txt" && pendencias+=('entrega/grupo.txt: nome do grupo, RM e nome de cada integrante e o link do pitch')
for print in powerbi-1 powerbi-2 tinkercad-circuito tinkercad-simulacao; do
  [ -f "$repo/entrega/prints/$print.png" ] || pendencias+=("entrega/prints/$print.png (com commit)")
done
for doc in README.md iot/README.md entrega/evidencias.md; do
  linhas="$(grep -n -E '_\(preencher|PREENCHER' "$repo/$doc" | cut -d: -f1 | paste -sd, || true)"
  [ -z "$linhas" ] || pendencias+=("$doc, linhas $linhas")
done
# só o texto de um quadro de verdade conta: "salve o print em" (print que faltava) e PREENCHER (capa e link do TinkerCad)
if command -v pdftotext >/dev/null && pdftotext -q "$repo/entrega/evidencias.pdf" - | tr '\n' ' ' | grep -c -E 'salve o print em|PREENCHER' >/dev/null; then
  pendencias+=('entrega/evidencias.pdf ainda tem quadros a preencher (print, capa ou link): rode bash entrega/gerar-pdf.sh')
fi
for item in "${pendencias[@]}"; do echo "- $item"; done
[ "${#pendencias[@]}" -gt 0 ] || echo 'nenhuma'

for aviso in "${avisos[@]}"; do echo "aviso: $aviso"; done
if [ "${#problemas[@]}" -gt 0 ]; then
  for problema in "${problemas[@]}"; do echo "PROBLEMA: $problema" >&2; done
  echo 'o .zip NÃO foi gerado: corrija os problemas acima e rode de novo' >&2
  exit 1
fi
mv "$tmp/pacote.zip" "$saida"
echo "PRONTO: entrega/merenda-do-vizinho.zip ($(du -h "$saida" | cut -f1)), do ramo $ramo, sem problema de segurança."
# o assunto do commit só aparece aqui, depois da conferência de chaves: um segredo escrito nele não sai no terminal antes
echo "commit $(git -C "$pasta" log -1 --format='%h %s')"
[ "$ramo" = main ] || echo "ATENÇÃO: este .zip é só de TESTE (ramo $ramo). Não envie: para a entrega, rode bash entrega/empacotar.sh main"
[ "${#pendencias[@]}" -eq 0 ] || echo "ATENÇÃO: ainda há ${#pendencias[@]} pendência(s) do grupo (lista acima)."
