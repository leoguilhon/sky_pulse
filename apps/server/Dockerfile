FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/server apps/server
RUN npm run build --workspace @skypulse/server

FROM build AS quality
COPY . .
RUN npm run check && npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace @skypulse/server && npm cache clean --force
COPY --from=build /app/apps/server/dist apps/server/dist
COPY apps/server/migrations apps/server/migrations
USER node
EXPOSE 3000
CMD ["sh", "-c", "node apps/server/dist/migrate.js && exec node apps/server/dist/index.js"]
