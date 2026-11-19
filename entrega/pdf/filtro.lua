-- Filtro do Pandoc para o PDF de evidências. Roda com a pasta entrega/ como pasta atual (o gerar-pdf.sh entra nela).
-- 1. Imagem que ainda não existe (os prints do grupo) vira um quadro "A preencher pelo grupo".
-- 2. Bloco de código com incluir="arquivo" recebe o conteúdo do arquivo, inteiro ou só um trecho:
--    linhas="1-40,90-95" (faixas de linhas, com "…" entre elas) ou comeca="$ ;OK" (linhas que começam com um dos textos).
-- 3. Div com incluir="arquivo.md" recebe o Markdown do arquivo, com os títulos fora do sumário e da numeração.
-- 4. O grupo.txt vai para a capa (variável grupo do modelo); com PREENCHER, a capa marca a pendência.

local function ler(caminho)
  local arquivo = io.open(caminho, "r")
  if not arquivo then error("o PDF usa " .. caminho .. ", e o arquivo não existe") end
  local texto = arquivo:read("a")
  arquivo:close()
  return texto
end

local function existe(caminho)
  local arquivo = io.open(caminho, "rb")
  if arquivo then arquivo:close() end
  return arquivo ~= nil
end

local function separar_linhas(texto)
  local linhas = {}
  for linha in (texto:gsub("\n$", "") .. "\n"):gmatch("(.-)\n") do table.insert(linhas, linha) end
  return linhas
end

local function por_faixas(linhas, faixas)
  local saida, fim_anterior = {}, nil
  for de, ate in faixas:gmatch("(%d+)%-(%d+)") do
    de, ate = tonumber(de), math.min(tonumber(ate), #linhas)
    if fim_anterior and de > fim_anterior + 1 then table.insert(saida, "…") end
    for i = de, ate do table.insert(saida, linhas[i]) end
    fim_anterior = ate
  end
  return saida
end

local function por_inicio(linhas, inicios)
  local saida = {}
  for _, linha in ipairs(linhas) do
    for inicio in inicios:gmatch("[^;]+") do
      if linha:sub(1, #inicio) == inicio then table.insert(saida, linha) break end
    end
  end
  return saida
end

function Image(img)
  if existe(img.src) then return img end
  return pandoc.Span({ pandoc.Strong("A preencher pelo grupo"), pandoc.LineBreak(),
    pandoc.Str("salve o print em "), pandoc.Code("entrega/" .. img.src),
    pandoc.Str(" e rode "), pandoc.Code("bash entrega/gerar-pdf.sh") }, { class = "a-preencher" })
end

function CodeBlock(bloco)
  local caminho = bloco.attributes.incluir
  if not caminho then return nil end
  local linhas = separar_linhas(ler(caminho))
  if bloco.attributes.linhas then linhas = por_faixas(linhas, bloco.attributes.linhas) end
  if bloco.attributes.comeca then linhas = por_inicio(linhas, bloco.attributes.comeca) end
  bloco.text = table.concat(linhas, "\n")
  bloco.attributes.incluir, bloco.attributes.linhas, bloco.attributes.comeca = nil, nil, nil
  return bloco
end

function Div(div)
  local caminho = div.attributes.incluir
  if not caminho then return nil end
  local blocos = pandoc.read(ler(caminho), "markdown").blocks:walk({
    Header = function(titulo)
      titulo.level = math.min(titulo.level + 2, 6)
      titulo.classes:extend({ "unnumbered", "unlisted" })
      return titulo
    end,
  })
  return pandoc.Div(blocos, pandoc.Attr("", div.classes))
end

function Meta(meta)
  local grupo = ler("grupo.txt")
  meta.grupo = pandoc.MetaBlocks({ pandoc.CodeBlock((grupo:gsub("\n+$", ""))) })
  meta["grupo-pendente"] = grupo:find("PREENCHER", 1, true) ~= nil
  return meta
end
