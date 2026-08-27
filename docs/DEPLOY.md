# Deployment guide

Playlists-Randomizer has two parts:

1. **Frontend** — GitHub Pages (automatic via GitHub Actions on push to `main`)
2. **Playlist proxy** — VPS at `/data/playlistapp` (manual; enables full playlists for all users)

## Architecture

```
GitHub Actions (pages.yml)
  → build with VITE_PLAYLIST_PROXY_B64 secret
  → deploy to alexrabbit.github.io/Playlists-Randomizer/

Browser
  → tries hosted proxy URL (from secret)
  → falls back to Innertube (~200 videos) → RSS (~15)

VPS /data/playlistapp
  → node server.mjs on port 3847 (YouTube API key on disk, age-encrypted)
  → cloudflared-playlist OpenRC → HTTPS tunnel
```

## Prerequisites

- Alpine VPS with SSH access and `/data` disk
- YouTube Data API v3 key (restricted to YouTube Data API only)
- Cloudflare Zero Trust account (named tunnel recommended)
- GitHub repo admin access for Actions secrets

## VPS install (Alpine)

Copy `deploy/proxy/` to the VPS, then:

```sh
cd /path/to/deploy/proxy
chmod +x install-alpine.sh cloudflared-playlist-run.sh

# Option A: migrate from legacy /data/playlists openssl setup
./install-alpine.sh

# Option B: fresh API key
YOUTUBE_API_KEY='your-key' ./install-alpine.sh

# Option C: named Cloudflare tunnel token
CLOUDFLARE_TUNNEL_TOKEN='eyJ...' YOUTUBE_API_KEY='your-key' ./install-alpine.sh
```

### Named Cloudflare tunnel

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks → Tunnels → Create**
2. Name: `playlistapp-proxy`
3. Public hostname → HTTP → `http://127.0.0.1:3847`
4. Copy tunnel token to VPS:

```sh
mkdir -p /etc/cloudflared-playlist
printf '%s' 'YOUR_TOKEN' > /etc/cloudflared-playlist/token
chmod 600 /etc/cloudflared-playlist/token
rc-service cloudflared-playlist restart
```

Note the public HTTPS URL (must end with `/`).

### Services

| Service | Port | Purpose |
|---------|------|---------|
| `playlistproxy` | 3847 | YouTube playlist proxy |
| `cloudflared-playlist` | — | HTTPS tunnel to 3847 |

```sh
rc-service playlistproxy status
rc-service cloudflared-playlist status
curl -s http://127.0.0.1:3847/health
curl -s "https://YOUR-TUNNEL-URL/health"
```

**WIRSS is untouched:** `/etc/cloudflared` and port 8787 are separate.

## Auto-sync on reboot (quick tunnels)

When using ephemeral `trycloudflare.com` URLs, install the **tunnel-sync** service so GitHub secrets and Pages rebuilds happen automatically after a VPS restart:

```sh
# One-time: create fine-grained GitHub PAT (Secrets + Actions write on both repos)
# Store on VPS only:
printf '%s' 'YOUR_GITHUB_PAT' > /etc/tunnel-sync/github.token
chmod 600 /etc/tunnel-sync/github.token

cd /path/to/deploy/ops/tunnel-sync
chmod +x install-alpine.sh
./install-alpine.sh
```

The service watches `/data/playlistapp/logs/tunnel.url` and `/data/stremio-channel-organizer/logs/tunnel.url`, updates GitHub secrets, and triggers Pages workflows. Users never see the VPS IP.

```sh
rc-service tunnel-sync status
/data/ops/tunnel-sync/.venv/bin/python /data/ops/tunnel-sync/sync.py --once --check-only
tail -20 /var/log/tunnel-sync.log
```

## GitHub Pages

See [GITHUB-UPLOAD.md](./GITHUB-UPLOAD.md) for setting `VITE_PLAYLIST_PROXY_B64`.

After updating the secret, push to `main` or run **Actions → Deploy GitHub Pages → Run workflow**.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| ~15–200 videos only | Proxy down or stale GitHub secret |
| `503 API key not configured` | Re-run install or check age decryption |
| Tunnel URL changed | Auto-sync via `tunnel-sync` service, or update `VITE_PLAYLIST_PROXY_B64` manually |
| CORS errors | Set `ALLOWED_ORIGINS=https://alexrabbit.github.io` |

## Security

- Never commit `YOUTUBE_API_KEY`, tunnel tokens, or `.env` with real values
- API key: `/data/playlistapp/secrets/` (age-encrypted, chmod 600)
- GitHub secret: base64 of HTTPS URL only — not the API key
