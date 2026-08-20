# ---- build the web app ----
FROM node:22-slim AS build
WORKDIR /app
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client ./client
RUN cd client && npm run build

# ---- runtime ----
FROM node:22-slim
WORKDIR /app
# better-sqlite3 needs build tooling for its native module
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server ./server
COPY package.json ./
COPY --from=build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 4000

CMD ["node", "server/index.js"]
