/**
 * ytplr-compatible YouTube playlist proxy (server-side API key).
 * GET /?playlistId=PLxxx -> { status, response: [{ id, title }] }
 */
import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 3847);
const API_KEY = process.env.YOUTUBE_API_KEY || '';
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_VIDEOS = Number(process.env.MAX_VIDEOS_TOTAL || 10000);

function cors(origin) {
  if (!origin || !ALLOWED.length) return ALLOWED[0] || '*';
  if (ALLOWED.some((a) => origin === a || origin.startsWith(a.replace(/\/$/, '')))) return origin;
  return ALLOWED[0] || '';
}

function sendJson(res, status, body, origin) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': cors(origin),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  });
  res.end(payload);
}

async function fetchPlaylist(playlistId) {
  const videos = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      key: API_KEY,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YouTube API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    for (const item of data.items || []) {
      const id = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (id) videos.push({ id, title: item.snippet?.title || 'Unknown' });
      if (videos.length >= MAX_VIDEOS) break;
    }
    if (videos.length >= MAX_VIDEOS) break;
    pageToken = data.nextPageToken;
  } while (pageToken);
  return videos;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': cors(origin),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    });
    return res.end();
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/health') {
    return sendJson(res, API_KEY ? 200 : 503, { ok: Boolean(API_KEY) }, origin);
  }

  const playlistId = url.searchParams.get('playlistId')?.trim();
  if (!playlistId) {
    return sendJson(res, 400, { status: 400, title: 'Missing playlistId' }, origin);
  }
  if (!API_KEY) {
    return sendJson(res, 503, { status: 503, title: 'API key not configured' }, origin);
  }

  try {
    const response = await fetchPlaylist(playlistId);
    if (!response.length) {
      return sendJson(res, 404, { status: 404, title: 'Playlist empty or not found' }, origin);
    }
    return sendJson(res, 200, { status: 200, response }, origin);
  } catch (e) {
    return sendJson(res, 502, { status: 502, title: String(e).slice(0, 200) }, origin);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`playlist proxy listening on ${PORT}`);
});
