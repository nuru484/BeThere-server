#!/bin/sh
set -e

# Run pending migrations before boot unless explicitly skipped.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npx prisma migrate deploy
fi

# PROCESS_TYPE=worker runs the dedicated worker entry; anything else = web.
if [ "${PROCESS_TYPE:-web}" = "worker" ]; then
  exec node worker.js
fi
exec node server.js
