# Container image for the backend API (built on the EC2 server by deploy/deploy.sh).

FROM node:22-bookworm-slim

# Prisma needs OpenSSL; ca-certificates lets the API talk to Google, R2 and Telegram over HTTPS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install packages first, so this slow step is reused when only the code changes.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY prisma ./prisma
RUN yarn prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN yarn build

ENV NODE_ENV=production
# Run as the unprivileged "node" user, never as root.
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
