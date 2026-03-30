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

ENV PORT=8000

CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT
