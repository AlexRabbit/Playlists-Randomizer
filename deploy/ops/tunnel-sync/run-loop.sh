#!/bin/sh
set -eu
ROOT="/data/ops/tunnel-sync"
INTERVAL="${SYNC_INTERVAL_SEC:-120}"
exec "${ROOT}/.venv/bin/python" "${ROOT}/sync.py" --interval "${INTERVAL}"
