#!/usr/bin/env python3
"""Sync trycloudflare tunnel URLs to GitHub secrets and trigger Pages rebuilds."""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from nacl import encoding, public
except ImportError:
    print("PyNaCl required: pip install pynacl", file=sys.stderr)
    sys.exit(1)

DEFAULTS = {
    "GITHUB_OWNER": "AlexRabbit",
    "PLAYLISTS_REPO": "Playlists-Randomizer",
    "PLAYLISTS_URL_FILE": "/data/playlistapp/logs/tunnel.url",
    "PLAYLISTS_SECRET": "VITE_PLAYLIST_PROXY_B64",
    "PLAYLISTS_WORKFLOW": "pages.yml",
    "PLAYLISTS_WORKFLOW_REF": "main",
    "STREMIO_REPO": "Stremio-Watchlist-Maker",
    "STREMIO_URL_FILE": "/data/stremio-channel-organizer/logs/tunnel.url",
    "STREMIO_SECRET": "PUBLIC_API_URL",
    "STREMIO_WORKFLOW": "pages.yml",
    "STREMIO_WORKFLOW_REF": "main",
    "STREMIO_ENV_FILE": "/data/stremio-channel-organizer/.env",
    "STREMIO_SERVICE": "stremio-channel-organizer",
    "STATE_FILE": "/etc/tunnel-sync/state.json",
    "LOG_FILE": "/var/log/tunnel-sync.log",
}

TOKEN_FILE = Path("/etc/tunnel-sync/github.token")
CONFIG_FILE = Path("/etc/tunnel-sync/config")
URL_RE = re.compile(r"^https://[a-z0-9-]+\.trycloudflare\.com/?$", re.I)


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).isoformat()} {msg}\n"
    log_path = Path(cfg("LOG_FILE"))
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass
    print(msg, flush=True)


def load_config() -> dict[str, str]:
    out = dict(DEFAULTS)
    if CONFIG_FILE.is_file():
        for raw in CONFIG_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            out[key.strip()] = val.strip()
    return out


CFG = load_config()


def cfg(key: str) -> str:
    return os.environ.get(key, CFG[key])


def read_token() -> str:
    if not TOKEN_FILE.is_file():
        raise SystemExit(f"Missing GitHub token: {TOKEN_FILE}")
    token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    if not token:
        raise SystemExit(f"Empty GitHub token: {TOKEN_FILE}")
    return token


def read_url(path: str) -> str | None:
    p = Path(path)
    if not p.is_file():
        return None
    url = p.read_text(encoding="utf-8").strip().rstrip("/")
    if not url:
        return None
    if not URL_RE.match(url + "/"):
        log(f"WARN ignoring non-quick-tunnel URL in {path}")
        return None
    return url


def load_state() -> dict:
    p = Path(cfg("STATE_FILE"))
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_state(state: dict) -> None:
    p = Path(cfg("STATE_FILE"))
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    os.chmod(p, 0o600)


def gh_request(method: str, url: str, token: str, body: dict | None = None) -> dict | None:
    data = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "tunnel-sync/1.0",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"GitHub API {method} {url} -> {e.code}: {detail}") from e
    except URLError as e:
        raise RuntimeError(f"GitHub API network error: {e}") from e


def encrypt_secret(public_key_b64: str, secret_value: str) -> str:
    pk = public.PublicKey(public_key_b64.encode("utf-8"), encoding.Base64Encoder())
    sealed = public.SealedBox(pk).encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(sealed).decode("utf-8")


def set_repo_secret(owner: str, repo: str, name: str, value: str, token: str) -> None:
    key_url = f"https://api.github.com/repos/{owner}/{repo}/actions/secrets/public-key"
    key_data = gh_request("GET", key_url, token)
    if not key_data:
        raise RuntimeError(f"No public key for {owner}/{repo}")
    enc = encrypt_secret(key_data["key"], value)
    put_url = f"https://api.github.com/repos/{owner}/{repo}/actions/secrets/{name}"
    gh_request(
        "PUT",
        put_url,
        token,
        {
            "encrypted_value": enc,
            "key_id": key_data["key_id"],
        },
    )


def dispatch_workflow(owner: str, repo: str, workflow_file: str, ref: str, token: str) -> None:
    url = f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_file}/dispatches"
    gh_request("POST", url, token, {"ref": ref})


def playlists_secret_value(url: str) -> str:
    normalized = url.rstrip("/") + "/"
    return base64.b64encode(normalized.encode("utf-8")).decode("ascii")


def update_stremio_env(url: str) -> None:
    env_path = Path(cfg("STREMIO_ENV_FILE"))
    if not env_path.is_file():
        log(f"WARN Stremio .env missing: {env_path}")
        return
    lines = env_path.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    found = False
    for line in lines:
        if line.startswith("BASE_URL="):
            out.append(f"BASE_URL={url}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"BASE_URL={url}")
    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    os.chmod(env_path, 0o600)
    svc = cfg("STREMIO_SERVICE")
    try:
        subprocess.run(["rc-service", svc, "restart"], check=False, timeout=30)
        log(f"Restarted {svc} with BASE_URL={url}")
    except (subprocess.SubprocessError, OSError) as e:
        log(f"WARN could not restart {svc}: {e}")


def sync_project(
    key: str,
    url: str | None,
    secret_name: str,
    secret_transform,
    repo: str,
    workflow: str,
    workflow_ref: str,
    token: str,
    owner: str,
    state: dict,
    dry_run: bool,
) -> bool:
    if not url:
        log(f"SKIP {key}: tunnel URL file not ready")
        return False
    prev = (state.get(key) or {}).get("url")
    if prev == url:
        return False
    secret_val = secret_transform(url)
    log(f"SYNC {key}: {prev or '(none)'} -> {url}")
    if dry_run:
        return True
    set_repo_secret(owner, repo, secret_name, secret_val, token)
    dispatch_workflow(owner, repo, workflow, workflow_ref, token)
    state[key] = {
        "url": url,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }
    return True


def run_once(dry_run: bool = False) -> int:
    token = read_token()
    owner = cfg("GITHUB_OWNER")
    state = load_state()
    changed = False

    pl_url = read_url(cfg("PLAYLISTS_URL_FILE"))
    if sync_project(
        "playlists",
        pl_url,
        cfg("PLAYLISTS_SECRET"),
        playlists_secret_value,
        cfg("PLAYLISTS_REPO"),
        cfg("PLAYLISTS_WORKFLOW"),
        cfg("PLAYLISTS_WORKFLOW_REF"),
        token,
        owner,
        state,
        dry_run,
    ):
        changed = True

    st_url = read_url(cfg("STREMIO_URL_FILE"))
    if sync_project(
        "stremio",
        st_url,
        cfg("STREMIO_SECRET"),
        lambda u: u.rstrip("/"),
        cfg("STREMIO_REPO"),
        cfg("STREMIO_WORKFLOW"),
        cfg("STREMIO_WORKFLOW_REF"),
        token,
        owner,
        state,
        dry_run,
    ):
        changed = True
        if not dry_run and st_url:
            update_stremio_env(st_url)

    if changed and not dry_run:
        save_state(state)
        log("Sync complete — GitHub Pages rebuilds triggered")
    elif not changed:
        log("No tunnel URL changes")
    return 0


def run_loop(interval: int) -> None:
    log(f"tunnel-sync loop every {interval}s")
    while True:
        try:
            run_once(dry_run=False)
        except Exception as e:
            log(f"ERROR {e}")
        time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Cloudflare tunnel URLs to GitHub")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    parser.add_argument("--check-only", action="store_true", help="Dry run, no GitHub updates")
    parser.add_argument("--interval", type=int, default=int(cfg("SYNC_INTERVAL_SEC")))
    args = parser.parse_args()
    if args.once or args.check_only:
        return run_once(dry_run=args.check_only)
    run_loop(args.interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
