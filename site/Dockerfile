FROM node:25-alpine

RUN npm install -g pnpm@11.4.0

RUN adduser -D -u 1001 -s /bin/sh site
USER site

WORKDIR /site
COPY --chown=site:site package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --chown=site:site . /site