# ==============================================================================
# MindScribe & Triage AI Platform - Production Dockerfile
# Native SQLite (better-sqlite3) + REST API + Static Frontend + Drizzle Studio
# ==============================================================================

FROM node:20-bookworm-slim

# Install build tools for native SQLite addons and system health tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    sqlite3 \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Install dependencies first (layer cached)
COPY package.json ./
RUN npm install

# 2. Copy application source files
COPY . .

# 3. Normalize entrypoint line-endings (for Windows hosts) & permissions
RUN dos2unix /app/docker-entrypoint.sh 2>/dev/null || true && \
    chmod +x /app/docker-entrypoint.sh && \
    mkdir -p /app/data

# Default environment configuration
ENV NODE_ENV=production \
    PORT=3000 \
    STUDIO_PORT=4983 \
    DATABASE_PATH=/app/data/mindscribe.db \
    JWT_SECRET=mindscribe-super-secure-secret-key-2026

# Expose Application Gateway (3000) and Drizzle Studio GUI (4983)
EXPOSE 3000 4983

# Container health monitoring
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["start"]
