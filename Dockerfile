# --- Stage 1: build the React frontend ---
FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
# Empty backend URL = same-origin: the API is served by the same container at /api
ENV REACT_APP_BACKEND_URL=""
RUN npm run build

# --- Stage 2: Node API + memory core, serving the built frontend ---
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall would rebuild the frontend; skip it and install only server deps
RUN npm ci --omit=dev --ignore-scripts --legacy-peer-deps
COPY server.js ./
COPY lib/ lib/
COPY --from=frontend /build/frontend/build frontend/build
# Durable data (SQLite store + uploaded media). Mount a volume here.
ENV OMNILOCAL_DATA_DIR=/app/data
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
