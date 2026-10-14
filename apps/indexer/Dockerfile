# Self-hosted Envio indexer for Railway (docs/DEPLOY.md). Build context is the repo root:
#   docker build -f apps/indexer/Dockerfile -t hood-indexer .
# Needs ENVIO_API_TOKEN (HyperSync), ENVIO_PG_* (its own Postgres) and HASURA_GRAPHQL_ENDPOINT/ADMIN_SECRET.
FROM node:22-bookworm-slim
WORKDIR /app
COPY apps/indexer/package.json ./
# npm 10 (bundled with node 22) fails on envio's dependency tree ("reading 'edgesOut'"); npm 11 installs it. Run it
# once via npx rather than `npm install -g npm`, which breaks the image's own npm.
RUN npx -y npm@11.21.0 install --no-package-lock --no-audit --no-fund
COPY apps/indexer/ ./

ENV ENVIO_CONFIG=config.selfhost.yaml ENVIO_TUI=false
# `envio start` runs codegen, then resumes from the database (never `--restart` here: it wipes the index).
CMD ["node_modules/.bin/envio", "start"]
