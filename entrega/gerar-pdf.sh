#!/usr/bin/env bash
# Gera entrega/evidencias.pdf a partir de entrega/evidencias.md, com o Pandoc e o WeasyPrint (ferramentas do computador
# de quem gera o PDF; não entram nos requirements do projeto). Antes, refaz devops/evidencias/git-log.txt.
# O PDF novo sai num arquivo temporário e só troca o evidencias.pdf se der certo (sem erro e com 30 páginas ou mais):
# se falhar, o evidencias.pdf que já existia continua como estava.
# Uso, de qualquer pasta: bash entrega/gerar-pdf.sh
# Rode de novo depois de salvar os prints do Power BI e do TinkerCad em entrega/prints/ e de preencher o grupo.txt.
set -euo pipefail
cd "$(dirname "$0")"
for programa in git pandoc weasyprint pdfinfo; do
  command -v "$programa" >/dev/null || { echo "falta o programa $programa: instale e rode de novo" >&2; exit 1; }
done

# o histórico do Git é a evidência de versionamento (seção 6.1 do PDF). O PDF lê este arquivo na hora de gerar; se algo
# falhar daqui até o fim, o git-log.txt anterior volta (o trap), e o evidencias.pdf anterior nem chega a ser trocado.
log=../devops/evidencias/git-log.txt
log_anterior="$(mktemp)"
novo="evidencias.$$.pdf"
ok=
trap '[ -n "$ok" ] || cp "$log_anterior" "$log"; rm -f "$novo" "$log_anterior"' EXIT
cp "$log" "$log_anterior"
{
  echo "# git log --oneline --graph do ramo $(git rev-parse --abbrev-ref HEAD), em $(date +%F). O .git do .zip tem o histórico todo."
  git log --oneline --graph
} > "$log"

# sem tex_math_dollars: "R$ 40" é dinheiro, não fórmula
pandoc evidencias.md --from markdown-tex_math_dollars --to html5 --standalone --template pdf/modelo.html \
  --lua-filter pdf/filtro.lua --toc --toc-depth 2 --number-sections --wrap none \
  | weasyprint --base-url . - "$novo"

paginas=$(pdfinfo "$novo" 2>/dev/null | awk '/^Pages:/ {print $2}' || true)
[ "${paginas:-0}" -ge 30 ] || { echo "o PDF novo não abriu ou tem só ${paginas:-0} páginas (o certo é 30 ou mais): o entrega/evidencias.pdf anterior foi mantido" >&2; exit 1; }
mv "$novo" evidencias.pdf
ok=1
echo "PDF pronto: entrega/evidencias.pdf ($paginas páginas)"

pendencias=0
for print in powerbi-1 powerbi-2 tinkercad-circuito tinkercad-simulacao; do
  [ -f "prints/$print.png" ] || { echo "a preencher pelo grupo: entrega/prints/$print.png"; pendencias=1; }
done
if grep -q PREENCHER grupo.txt; then echo "a preencher pelo grupo: entrega/grupo.txt"; pendencias=1; fi
if grep -q PREENCHER evidencias.md; then echo "a preencher pelo grupo: o link do TinkerCad em entrega/evidencias.md"; pendencias=1; fi
[ "$pendencias" = 1 ] || echo "nenhuma pendência do grupo no PDF"
