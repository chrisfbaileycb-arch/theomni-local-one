# --- Stage 1: build the React frontend ---
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000
COPY frontend/ ./
# Empty backend URL = same-origin: the API is served by the same container at /api
ENV REACT_APP_BACKEND_URL=""
RUN yarn build

# --- Stage 2: Python backend serving API + built frontend ---
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY --from=frontend /build/build frontend/build
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
