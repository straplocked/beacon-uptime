#!/bin/sh
set -e

echo "[beacon] Running database migrations..."
node dist/scripts/migrate.js

echo "[beacon] Starting application..."
exec node server.js
