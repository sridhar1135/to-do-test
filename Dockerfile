# One image: the FastAPI API plus the built PWA, served from the same URL.

# ---- build the PWA ----
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# No VITE_API_URL: the app talks to the API on its own origin. No token is built in.
RUN npm run build

# ---- run the API ----
FROM python:3.12-slim
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir .
COPY --from=web /web/build ./web
ENV TODO_FRONTEND_DIR=/app/web \
    PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
