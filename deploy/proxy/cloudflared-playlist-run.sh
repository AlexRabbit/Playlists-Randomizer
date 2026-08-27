#!/bin/sh
# Named Cloudflare tunnel for playlist proxy (port 3847). Token: /etc/cloudflared-playlist/token
set -e
LOG=/data/playlistapp/logs/cloudflared.log
URLF=/data/playlistapp/logs/tunnel.url
mkdir -p /data/playlistapp/logs

if [ -s /etc/cloudflared-playlist/token ]; then
  TOKEN=$(tr -d ' \r\n' < /etc/cloudflared-playlist/token)
  exec /usr/local/bin/cloudflared tunnel --no-autoupdate --protocol http2 run --token "$TOKEN" \
    >> "$LOG" 2>&1
fi

# Fallback: ephemeral trycloudflare.com (URL changes on restart — update GitHub secret)
(
  exec /usr/local/bin/cloudflared tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:3847
) 2>&1 | while IFS= read -r line; do
  echo "$line" >> "$LOG"
  case "$line" in
    *trycloudflare.com*)
      echo "$line" | tr -d ' |' | grep -o 'https://[^ ]*trycloudflare.com' | head -1 > "$URLF" || true
      touch /etc/tunnel-sync/tunnel.changed 2>/dev/null || true
      ;;
  esac
done
