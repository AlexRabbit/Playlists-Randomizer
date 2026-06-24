/** Proxy base URL — set via GitHub secret VITE_PLAYLIST_PROXY_B64 (base64), never commit the decoded URL. */
export function getPlaylistProxyUrl(): string {
  const b64 = import.meta.env.VITE_PLAYLIST_PROXY_B64?.trim();
  if (b64) {
    try {
      const decoded = atob(b64).trim();
      if (decoded) return decoded.endsWith('/') ? decoded : `${decoded}/`;
    } catch {
      /* invalid base64 */
    }
  }
  const plain = import.meta.env.VITE_PLAYLIST_PROXY_URL?.trim();
  if (plain) return plain.endsWith('/') ? plain : `${plain}/`;
  return '';
}
