FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node public ./public
COPY --chown=node:node server.mjs ./server.mjs
COPY --chown=node:node assist.mjs ./assist.mjs
COPY --chown=node:node scripts-store.mjs ./scripts-store.mjs
COPY --chown=node:node asr.mjs ./asr.mjs
COPY --chown=node:node node_modules/ws ./node_modules/ws
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "--max-old-space-size=128", "server.mjs"]
