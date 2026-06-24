# Playlists Randomizer

Client-side YouTube playlist randomizer with **glass dark UI** — built for [GitHub Pages](https://pages.github.com/).

Bookmark your URL to save your entire workspace (Lists → Cards → Playlists).

## Features

- **Lists & Cards** — Organize playlists into named lists (ASMR, MUSIC…) and player cards
- **Random playback** — Shuffles merged videos from multiple playlists (default on)
- **Audio / Video toggle** — Listen without showing the video player
- **URL persistence** — Full workspace encoded in `?ws=` query param (LZ-compressed)
- **Legacy import** — Supports `?pid=PLxxx~:-PLyyy` format from similar tools
- **Import / Export** — JSON backup files with version magic
- **Debug logs** — Intrusive log panel at bottom for troubleshooting

## Quick start (Windows)

```bat
run.bat
```

## Manual

```bash
npm install
npm run dev      # http://localhost:5173/Playlists-Randomizer/
npm test
npm run build    # output → dist/
npm run preview
```

## GitHub Pages deploy

1. `npm run build`
2. Deploy `dist/` to `gh-pages` branch or GitHub Actions
3. Set repo Pages source; `VITE_BASE_PATH` must match repo name (`/Playlists-Randomizer/`)

## Configuration

Copy `.env.example` → `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BASE_PATH` | `/Playlists-Randomizer/` | Asset base for GH Pages |
| `VITE_DEFAULT_RANDOM` | `true` | New cards shuffle by default |
| `VITE_DEFAULT_SHOW_VIDEO` | `false` | Audio-only player default |
| `VITE_LEGACY_PID_COMPAT` | `true` | Import old `?pid=` URLs |

## Architecture

```
src/
  core/          # models, URL codec, YouTube, backup
  ui/            # glass components & styles
  app/           # state store
  logs/          # intrusive logger
tests/           # Vitest + protocol
tools/           # audit & protocol runners
```

## Privacy

All data stays in your browser. Playlist metadata is fetched from YouTube public RSS feeds. No backend, no accounts.

## License

MIT
