#!/bin/sh
set -e

echo "[beacon] Running database migrations..."
node dist/scripts/migrate.js

if [ "$#" -gt 0 ]; then
  echo "[beacon] Starting: $*"
  exec "$@"
else
  echo "[beacon] Starting application..."
  exec node server.js
fi
