FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node public ./public
COPY --chown=node:node server.mjs ./server.mjs
COPY --chown=node:node assist.mjs ./assist.mjs
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "--max-old-space-size=128", "server.mjs"]
