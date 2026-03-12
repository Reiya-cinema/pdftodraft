# Frontend Build Stage
FROM node:20-slim as frontend-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Backend Runtime Stage
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies if needed (e.g. for potential specific python libs)
# RUN apt-get update && apt-get install -y ...

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --from=frontend-builder /app/dist /app/static
COPY ./backend /app/backend

# Environment variables
ENV PORT=8000
# SQLite database location (persistent volume should be mounted here in production if needed, or use a file in /app)
# Railway volumes can be mounted. We will default to a local file.
ENV DATABASE_URL=sqlite:///./pdftodraft.db

CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT
