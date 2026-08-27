# VPS recovery — full playlists after reboot

Use this when the live app loads **~15–200 videos** instead of full playlists.

## What broke

Production uses a **Cloudflare tunnel URL** baked into the GitHub Pages build via secret `VITE_PLAYLIST_PROXY_B64`. Ephemeral `trycloudflare.com` URLs **die when the VPS or tunnel restarts** — the frontend then falls back to Innertube/RSS.

## Quick checklist

1. SSH into VPS (key: `A:\VibeCode\SPV\private.txt`)
2. Ensure proxy runs on `127.0.0.1:8787` with YouTube API key in `/opt/playlists/.env` (or your HDD `playlists/` path)
3. Restart Cloudflare tunnel → copy new HTTPS URL (must end with `/`)
4. Update GitHub secret `VITE_PLAYLIST_PROXY_B64` = `echo -n 'https://YOUR-URL/' | base64`
5. Re-run **Deploy GitHub Pages** workflow (Actions tab)

## Folder layout on VPS

```
/opt/playlists/          # or /mnt/your-hdd/playlists/
  server.js
  .env                   # YOUTUBE_API_KEY=...  (chmod 600, never commit)
  systemd/
```

`.env` example (VPS only):

```env
YOUTUBE_API_KEY=your_key_here
PORT=8787
```

The **API key never goes to GitHub** — only the tunnel URL (base64) in `VITE_PLAYLIST_PROXY_B64`.

## Deploy from Windows

Proxy project lives at `A:\VibeCode\projects\playlists\` (not in this repo).

```powershell
cd A:\VibeCode\projects\playlists
$env:YOUTUBE_API_KEY = 'your_key_here'
# Optional if not in SPV\host.txt:
# $env:SSH_HOST = 'your.vps.ip'
.\UPLOAD-TO-VPS.ps1
```

The script prints the new base64 value for GitHub.

## Manual service checks (on VPS)

```bash
systemctl status playlists-proxy
systemctl status cloudflared-quick   # or your named tunnel unit
curl -s http://127.0.0.1:8787/health
curl -s "http://127.0.0.1:8787/?playlistId=PLrAXtmRdnEQy6nuLMHjMZ6s3fKjTjJ4T" | head -c 300
journalctl -u cloudflared-quick --since '5 min ago' | grep trycloudflare
```

## Verify production

1. Open [Playlists Randomizer](https://alexrabbit.github.io/Playlists-Randomizer/)
2. Load a large public playlist
3. App logs (top bar **Logs**) should show `Playlist loaded via proxy`

## Prefer a stable tunnel (recommended)

Quick tunnels change URL every restart. For a **persistent hostname**:

1. `cloudflared tunnel create playlists-proxy`
2. Route `playlists-proxy.yourdomain.com` → `http://127.0.0.1:8787`
3. Run via `systemd` — same URL survives reboots; update GitHub secret once

See [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

## Security

| Item | Where |
|------|--------|
| YouTube API key | VPS `.env` only |
| SSH private key | `A:\VibeCode\SPV\private.txt` — never GitHub |
| Tunnel URL | GitHub Actions secret (base64) |
| Frontend repo | No secrets in git |
