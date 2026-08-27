#!/bin/sh
# Greenfield install: /data/playlistapp + OpenRC (playlistproxy + cloudflared-playlist)
# Does NOT touch WIRSS (/data/apps/wirs) or /etc/cloudflared (WIRSS tunnel).
set -eu

ROOT="/data/playlistapp"
REPO_PROXY="${REPO_PROXY:-$(dirname "$0")}"
OLD="/data/playlists"

echo "==> Installing packages (nodejs, age)..."
apk add --no-cache nodejs age 2>/dev/null || apk add --no-cache nodejs age

echo "==> Creating ${ROOT}..."
mkdir -p "${ROOT}/logs" "${ROOT}/secrets"
chmod 700 "${ROOT}/secrets"

echo "==> Copying server.mjs..."
install -m 0644 "${REPO_PROXY}/server.mjs" "${ROOT}/server.mjs"
install -m 0755 "${REPO_PROXY}/cloudflared-playlist-run.sh" "${ROOT}/cloudflared-playlist-run.sh"
install -m 0755 "${REPO_PROXY}/playlistproxy-run.sh" "${ROOT}/playlistproxy-run.sh"

# Stop legacy Docker stack (port 3847 conflict)
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q '^playlists-'; then
  echo "==> Stopping legacy Docker playlists stack..."
  docker rm -f playlists-proxy-1 playlists-tunnel-quick-1 playlists-autoheal-1 2>/dev/null || true
fi

# age keypair
if [ ! -f "${ROOT}/secrets/age.key" ]; then
  age-keygen -o "${ROOT}/secrets/age.key"
  chmod 600 "${ROOT}/secrets/age.key"
fi
PUB=$(grep '^# public key:' "${ROOT}/secrets/age.key" | awk '{print $4}')

encrypt_api_key() {
  printf '%s' "$1" | age -r "$PUB" -o "${ROOT}/secrets/youtube-api.key.age"
  chmod 600 "${ROOT}/secrets/youtube-api.key.age"
}

if [ -n "${YOUTUBE_API_KEY:-}" ]; then
  echo "==> Encrypting API key from YOUTUBE_API_KEY env..."
  encrypt_api_key "$YOUTUBE_API_KEY"
elif [ -f "${OLD}/secrets/api.key.enc" ] && [ -f "${OLD}/secrets/.passphrase" ]; then
  echo "==> Migrating API key from ${OLD} (openssl -> age)..."
  PASS=$(cat "${OLD}/secrets/.passphrase")
  KEY=$(openssl enc -aes-256-cbc -d -pbkdf2 -pass "pass:${PASS}" -in "${OLD}/secrets/api.key.enc" 2>/dev/null) || {
    echo "ERROR: Could not decrypt legacy key. Set YOUTUBE_API_KEY and re-run." >&2
    exit 1
  }
  encrypt_api_key "$KEY"
  unset KEY PASS
elif [ ! -f "${ROOT}/secrets/youtube-api.key.age" ]; then
  echo "ERROR: No API key. Export YOUTUBE_API_KEY=... or migrate from ${OLD}." >&2
  exit 1
fi

# cloudflared binary (reuse WIRSS install path if present)
if [ ! -x /usr/local/bin/cloudflared ]; then
  echo "==> Installing cloudflared..."
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64|amd64) CF_ARCH=amd64 ;;
    aarch64|arm64) CF_ARCH=arm64 ;;
    *) echo "unsupported arch $ARCH"; exit 1 ;;
  esac
  apk add --no-cache gcompat wget 2>/dev/null || true
  tmp=$(mktemp)
  wget -qO "$tmp" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"
  install -m 755 "$tmp" /usr/local/bin/cloudflared
  rm -f "$tmp"
fi

mkdir -p /etc/cloudflared-playlist
chmod 700 /etc/cloudflared-playlist
if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  printf '%s' "$CLOUDFLARE_TUNNEL_TOKEN" > /etc/cloudflared-playlist/token
  chmod 600 /etc/cloudflared-playlist/token
fi

echo "==> Installing OpenRC services..."
install -m 0755 "${REPO_PROXY}/playlistproxy.openrc" /etc/init.d/playlistproxy
install -m 0755 "${REPO_PROXY}/cloudflared-playlist.openrc" /etc/init.d/cloudflared-playlist
rc-update add playlistproxy default 2>/dev/null || true
rc-update add cloudflared-playlist default 2>/dev/null || true

rc-service playlistproxy restart
sleep 2
rc-service cloudflared-playlist restart
sleep 5

echo "==> Health check..."
curl -sf "http://127.0.0.1:3847/health" || { echo "Proxy health failed"; exit 1; }

if [ -f "${ROOT}/logs/tunnel.url" ]; then
  echo "Tunnel URL (quick): $(cat "${ROOT}/logs/tunnel.url")"
elif [ -s /etc/cloudflared-playlist/token ]; then
  echo "Named tunnel token installed — use your Cloudflare hostname for GitHub secret."
else
  echo "WARN: No tunnel token. Add /etc/cloudflared-playlist/token for named tunnel."
fi

rc-service playlistproxy status || true
rc-service cloudflared-playlist status || true
echo "==> Done: ${ROOT}"
