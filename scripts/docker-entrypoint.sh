#!/bin/sh
set -eu

state_dir="${MAHORAGA_STATE_DIR:-/var/lib/mahoraga}"
mkdir -p "$state_dir"
chown -R node:node "$state_dir"

exec gosu node "$@"
