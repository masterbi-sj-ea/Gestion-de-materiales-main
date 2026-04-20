FROM node:22-bookworm-slim AS builder

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --prefix backend

COPY . .
RUN npm run package:prod

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4009

COPY --from=builder /workspace/release/backend/package.json ./package.json
COPY --from=builder /workspace/release/backend/package-lock.json ./package-lock.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /workspace/release/backend/dist ./dist
COPY --from=builder /workspace/release/backend/public ./public
COPY --from=builder /workspace/release/backend/.env.example ./.env.example
COPY --from=builder /workspace/release/backend/README.md ./README.md
COPY --from=builder /workspace/release/backend/ecosystem.config.cjs ./ecosystem.config.cjs

RUN mkdir -p /app/cache /app/imports /app/logs \
  && chown -R node:node /app

USER node

EXPOSE 4009

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 4009}/health`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/server.js"]