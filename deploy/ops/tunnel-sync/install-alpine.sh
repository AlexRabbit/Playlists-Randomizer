#!/bin/sh
# Install tunnel-sync to /data/ops/tunnel-sync
set -eu

SRC="${SRC:-$(dirname "$0")}"
DEST="/data/ops/tunnel-sync"

echo "==> Installing packages..."
apk add --no-cache python3 py3-pip 2>/dev/null || apk add --no-cache python3 py3-pip

echo "==> Copying to ${DEST}..."
mkdir -p "${DEST}"
cp -a "${SRC}/sync.py" "${SRC}/run-loop.sh" "${SRC}/requirements.txt" "${DEST}/"
chmod +x "${DEST}/run-loop.sh" "${DEST}/sync.py"

echo "==> Python venv..."
python3 -m venv "${DEST}/.venv"
"${DEST}/.venv/bin/pip" install --upgrade pip
"${DEST}/.venv/bin/pip" install -r "${DEST}/requirements.txt"

mkdir -p /etc/tunnel-sync
chmod 700 /etc/tunnel-sync
if [ ! -f /etc/tunnel-sync/config ] && [ -f "${SRC}/config.example" ]; then
  cp "${SRC}/config.example" /etc/tunnel-sync/config
  chmod 600 /etc/tunnel-sync/config
fi

if [ ! -s /etc/tunnel-sync/github.token ]; then
  echo "WARN: Create /etc/tunnel-sync/github.token (GitHub PAT, chmod 600)"
fi

install -m 0755 "${SRC}/tunnel-sync.openrc" /etc/init.d/tunnel-sync
rc-update add tunnel-sync default 2>/dev/null || true

# Hook cloudflared services to trigger sync after tunnel start
for svc in cloudflared-playlist cloudflared-stremio; do
  init="/etc/init.d/${svc}"
  if [ -f "${init}" ] && ! grep -q 'tunnel-sync' "${init}" 2>/dev/null; then
    cat >> "${init}" << 'EOF'

start_post() {
  rc-service tunnel-sync start 2>/dev/null || true
}
EOF
  fi
done

echo "==> Initial sync (once)..."
if [ -s /etc/tunnel-sync/github.token ]; then
  "${DEST}/.venv/bin/python" "${DEST}/sync.py" --once || true
  rc-service tunnel-sync restart 2>/dev/null || rc-service tunnel-sync start
else
  echo "Skip initial sync — add github.token first"
fi

echo "==> Done: ${DEST}"
