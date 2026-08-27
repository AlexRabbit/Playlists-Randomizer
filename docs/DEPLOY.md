# Deploy to GitHub Pages — exact steps

Your site will live at:

**https://alexrabbit.github.io/Playlists-Randomizer/**

(Replace `alexrabbit` if your GitHub username differs.)

---

## One-time setup (GitHub website only)

### 1. Push this repo to GitHub

```bash
git remote add origin https://github.com/AlexRabbit/Playlists-Randomizer.git
git push -u origin main
```

*(You asked the agent not to push automatically — run this yourself when ready.)*

### 2. Enable GitHub Pages

1. Open **https://github.com/AlexRabbit/Playlists-Randomizer**
2. Go to **Settings** → **Pages**
3. Under **Build and deployment**:
   - **Source:** `GitHub Actions`
4. Save — no branch/folder selection needed; the workflow deploys `dist/`

### 3. Wait for the workflow

1. Go to **Actions** tab
2. Open **Deploy GitHub Pages** — it runs on every push to `main`
3. When green, refresh **Settings → Pages** — you'll see the live URL

### 4. Full playlists for all users (VPS proxy)

RSS/Innertube only return ~15–200 videos. For **full playlists without each user adding a key**:

1. Deploy the ytplr-compatible proxy on your VPS (YouTube API key in VPS `.env` only)
2. Expose it via HTTPS (Cloudflare tunnel)
3. **Repo → Settings → Secrets → Actions** → `VITE_PLAYLIST_PROXY_B64` = base64 of tunnel URL with trailing `/`
4. Re-run **Deploy GitHub Pages**

See [GITHUB-UPLOAD.md](GITHUB-UPLOAD.md) and [VPS-RECOVERY.md](VPS-RECOVERY.md).

Users can still paste their own API key in **Settings** (saved in their bookmark URL).

---

## What is already configured in the repo

| File | Purpose |
|------|---------|
| `.env.production` | `VITE_BASE_PATH=/Playlists-Randomizer/` for GH Pages |
| `.github/workflows/pages.yml` | Build, test, deploy on push to `main` |
| `vite.config.ts` | Uses `VITE_BASE_PATH` for asset paths |

---

## Local production preview (optional)

```bash
npm run build
npm run preview
```

Open the URL shown (includes `/Playlists-Randomizer/`).

---

## Custom domain (optional)

1. Add `CNAME` file in `public/` with your domain
2. **Settings → Pages → Custom domain**
3. Update DNS at your registrar

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank page | Ensure `VITE_BASE_PATH` matches repo name: `/Playlists-Randomizer/` |
| 404 on refresh | GH Pages serves `index.html` for SPA — Vite build handles base path |
| Workflow fails | Check **Actions** logs; `npm test` must pass |
| Playlists load 15–200 videos only | VPS proxy + `VITE_PLAYLIST_PROXY_B64` secret, or in-app Settings API key — see [VPS-RECOVERY.md](VPS-RECOVERY.md) |

---

## Bookmark / workspace URL

Everything is client-side. Users bookmark:

`https://alexrabbit.github.io/Playlists-Randomizer/?ws=...`

Long workspaces automatically use `#ws=...` in the hash (query stays short).
