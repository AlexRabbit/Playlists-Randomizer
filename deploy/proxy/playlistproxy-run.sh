#!/bin/sh
set -e
ROOT="/data/playlistapp"
export YOUTUBE_API_KEY
YOUTUBE_API_KEY=$(age -d -i "${ROOT}/secrets/age.key" "${ROOT}/secrets/youtube-api.key.age")
export PORT="${PORT:-3847}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://alexrabbit.github.io,http://localhost:5173}"
export MAX_VIDEOS_TOTAL="${MAX_VIDEOS_TOTAL:-10000}"
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"
exec /usr/bin/node "${ROOT}/server.mjs"
