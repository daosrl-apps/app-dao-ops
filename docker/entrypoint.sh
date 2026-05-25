#!/bin/sh
# Entrypoint del container dao-ops.
# Por ahora no hay volúmenes mutables que necesiten chown — el entrypoint
# simplemente exec'a el CMD bajando privilegios si arrancamos como root.
set -e

if [ "$(id -u)" = "0" ]; then
  exec su-exec nextjs:nodejs "$@"
fi

exec "$@"
