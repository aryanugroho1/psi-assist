#!/bin/bash
set -e

DATA_DIR=$(dirname "${DATABASE_PATH:-/app/data/mindscribe.db}")
mkdir -p "$DATA_DIR"

# Initialize SQLite database if it does not exist in the volume
if [ ! -f "${DATABASE_PATH:-/app/data/mindscribe.db}" ]; then
  if [ -f "/app/mindscribe.db" ]; then
    echo "[Docker Entrypoint] Copying seed database to ${DATABASE_PATH:-/app/data/mindscribe.db}..."
    cp /app/mindscribe.db "${DATABASE_PATH:-/app/data/mindscribe.db}"
  else
    echo "[Docker Entrypoint] Initializing fresh database with seed data..."
    npm run db:seed || true
  fi
fi

# Graceful termination handler
cleanup() {
  echo "[Docker Entrypoint] Received shutdown signal, terminating processes gracefully..."
  if [ -n "$BACKEND_PID" ]; then kill -TERM "$BACKEND_PID" 2>/dev/null || true; fi
  if [ -n "$STUDIO_PID" ]; then kill -TERM "$STUDIO_PID" 2>/dev/null || true; fi
  wait "$BACKEND_PID" 2>/dev/null || true
  wait "$STUDIO_PID" 2>/dev/null || true
  echo "[Docker Entrypoint] Services stopped cleanly."
  exit 0
}

trap cleanup TERM INT

if [ "$1" = "start" ]; then
  echo "=========================================================="
  echo " MindScribe AI & Triage Platform (Production Docker)"
  echo " Web App & API Gateway: http://0.0.0.0:${PORT:-3000}"
  echo " Drizzle Studio GUI:    http://0.0.0.0:${STUDIO_PORT:-4983}"
  echo " SQLite Database:       ${DATABASE_PATH:-/app/data/mindscribe.db}"
  echo " Compliant: UU PDP No. 27/2022 & SATUSEHAT FHIR Gateway"
  echo "=========================================================="

  # Launch Drizzle Studio on port 4983
  npx drizzle-kit studio --port "${STUDIO_PORT:-4983}" --host 0.0.0.0 &
  STUDIO_PID=$!

  # Launch MindScribe HTTP Backend & Static Web Gateway on port 3000
  node backend/src/server.js &
  BACKEND_PID=$!

  # Wait for any process exit or signal
  wait -n "$BACKEND_PID" "$STUDIO_PID" 2>/dev/null || wait "$BACKEND_PID" "$STUDIO_PID" 2>/dev/null || true
  cleanup
else
  # Execute custom command passed to docker run
  exec "$@"
fi
