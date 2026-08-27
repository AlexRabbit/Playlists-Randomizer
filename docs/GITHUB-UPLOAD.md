# GitHub secrets setup

The frontend needs one repository secret to reach your VPS proxy.

## Secret: `VITE_PLAYLIST_PROXY_B64`

**Value:** Base64 encoding of your proxy HTTPS URL (with trailing slash).

The URL is **not** the API key. The YouTube API key stays on the VPS only.

### Get your proxy URL

- **Named tunnel:** `https://playlist-proxy.yourdomain.com/`
- **Quick tunnel:** read from VPS: `cat /data/playlistapp/logs/tunnel.url`

The URL **must** end with `/`.

### Encode (PowerShell)

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("https://YOUR-TUNNEL-URL/"))
```

### Encode (Linux/macOS)

```sh
echo -n 'https://YOUR-TUNNEL-URL/' | base64 -w0
echo
```

### Add to GitHub

1. Open [Settings → Secrets and variables → Actions](https://github.com/AlexRabbit/Playlists-Randomizer/settings/secrets/actions)
2. **New repository secret** (or update existing)
3. Name: `VITE_PLAYLIST_PROXY_B64`
4. Value: paste the base64 string (no spaces or newlines)

### Rebuild

Push to `main` or run **Actions → Deploy GitHub Pages → Run workflow**.

With **tunnel-sync** installed on the VPS, this happens automatically when the quick-tunnel URL changes (see [DEPLOY.md](./DEPLOY.md#auto-sync-on-reboot-quick-tunnels)).

## tunnel-sync GitHub PAT (VPS only)

For automatic secret updates, create a fine-grained PAT with **Secrets** and **Actions** write access on `Playlists-Randomizer` and `Stremio-Watchlist-Maker`. Store it only on the VPS:

```sh
mkdir -p /etc/tunnel-sync
printf '%s' 'YOUR_PAT' > /etc/tunnel-sync/github.token
chmod 600 /etc/tunnel-sync/github.token
```

Never commit the PAT or add it to GitHub repository secrets.

### Verify

Open the live app, load a large public playlist, open **Logs** — look for `Playlist loaded via proxy`.

## What NOT to put in GitHub

| Never add | Why |
|-----------|-----|
| `YOUTUBE_API_KEY` | Must stay VPS-only |
| Plain proxy URL in repo files | Use secret + base64 at build time |
| Cloudflare tunnel token | VPS-only at `/etc/cloudflared-playlist/token` |

## Local development

In `.env` (gitignored):

```env
VITE_PLAYLIST_PROXY_URL=https://your-tunnel.example/
```

Or for production-like testing:

```env
VITE_PLAYLIST_PROXY_B64=<same value as GitHub secret>
```
