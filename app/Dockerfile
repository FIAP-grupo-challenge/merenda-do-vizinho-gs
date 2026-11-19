# Imagem do app (Node 24). Contexto de build: a raiz do repositório, porque o app lê compartilhado/ por caminho
# relativo; cada pasta fica em /srv/<pasta>, como no repositório.

# Estágio 1: instala tudo, inclusive o Svelte e o Vite, e gera as telas em app/public/.
FROM node:24-alpine AS build
WORKDIR /srv/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# Estágio 2: só o jsonwebtoken, o servidor, a chamada da semente e as telas geradas, com o usuário node (sem root).
FROM node:24-alpine
WORKDIR /srv/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY compartilhado /srv/compartilhado
COPY app/src ./src
# a semente (src/semente.js) lê a chamada de demonstração de semente/chamada-demo.json: sem a pasta, o app não sobe
COPY app/semente ./semente
COPY --from=build /srv/app/public ./public
# o volume do banco é montado em /dados: criada aqui, a pasta já nasce do usuário node
RUN mkdir /dados && chown node:node /dados
USER node
EXPOSE 3000
# direto no node: o npm start refaz o build antes e precisaria das dependências de desenvolvimento
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
