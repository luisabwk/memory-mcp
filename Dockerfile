FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN NODE_ENV=development npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# 3000 = porta pública (roteada pelo Traefik, só OAuth bearer).
# 8767 = porta interna (só rede Docker, aceita MEMORY_SERVICE_TOKEN). NÃO publicar no Traefik.
EXPOSE 3000 8767
CMD ["node", "dist/index-http.js"]
