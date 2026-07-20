#!/bin/sh
set -e

# Run pending migrations before boot - WEB process only, so the worker
# container never races the web container to apply the same migrations.
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ "${PROCESS_TYPE:-web}" != "worker" ]; then
  npx prisma migrate deploy
fi

# PROCESS_TYPE=worker runs the dedicated worker entry; anything else = web.
if [ "${PROCESS_TYPE:-web}" = "worker" ]; then
  exec node worker.js
fi
exec node server.js
