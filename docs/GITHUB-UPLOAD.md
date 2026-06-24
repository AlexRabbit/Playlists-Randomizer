# What to upload to GitHub (Playlists-Randomizer)

## Upload these

```
src/
public/
tests/
.github/
docs/
index.html
package.json
package-lock.json
tsconfig.json
vite.config.ts
.gitignore
.env.example
.env.production       ← no API key, no proxy URL (secrets only)
README.md
run.bat
logs/.gitkeep
tools/audit/
tools/test-protocol/
tools/dev-server.py
tools/playlist_indexer.py
```

## Do NOT upload

| Path | Why |
|------|-----|
| `node_modules/` | Run `npm install` |
| `dist/` | Built by GitHub Actions |
| `.env` | Local overrides + proxy URL |
| `../projects/playlists/.env` | **YouTube API key** — VPS only |
| `logs/*.log` | Local debug |

## Secrets (GitHub → Settings → Secrets → Actions)

| Secret | Value |
|--------|--------|
| `VITE_PLAYLIST_PROXY_B64` | Base64 of your HTTPS proxy URL with trailing slash |

Generate after VPS deploy:

```bash
echo -n 'https://YOUR-TUNNEL-URL/' | base64
```

The **API key never goes to GitHub** — only on the VPS in `projects/playlists/.env`.

## VPS proxy (not in this repo)

Deploy from your PC:

```powershell
cd A:\VibeCode\projects\playlists
.\UPLOAD-TO-VPS.ps1
```

Uses SSH key from `A:\VibeCode\SPV\private.txt` (not committed).

## GitHub Pages

1. Add secret `VITE_PLAYLIST_PROXY_B64`
2. Push `main`
3. **Settings → Pages → GitHub Actions**
4. Live: `https://alexrabbit.github.io/Playlists-Randomizer/`

Proxy must be running on the VPS before users get full playlists.
