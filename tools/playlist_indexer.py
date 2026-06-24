#!/usr/bin/env python3
"""Optional local playlist indexer — validates public YouTube playlists via RSS."""
import sys
import urllib.request
import xml.etree.ElementTree as ET

RSS = "https://www.youtube.com/feeds/videos.xml?playlist_id="


def index_playlist(playlist_id: str) -> list[dict]:
    url = RSS + urllib.parse.quote(playlist_id)
    with urllib.request.urlopen(url, timeout=15) as resp:
        root = ET.fromstring(resp.read())
    ns = {"yt": "http://www.youtube.com/xml/schemas/2015", "atom": "http://www.w3.org/2005/Atom"}
    entries = []
    for entry in root.findall("atom:entry", ns):
        vid = entry.find("yt:videoId", ns)
        title = entry.find("atom:title", ns)
        if vid is not None and vid.text:
            entries.append({"videoId": vid.text, "title": (title.text or "") if title is not None else ""})
    return entries


if __name__ == "__main__":
    import urllib.parse

    if len(sys.argv) < 2:
        print("Usage: playlist_indexer.py PLAYLIST_ID [PLAYLIST_ID ...]")
        sys.exit(1)
    for pid in sys.argv[1:]:
        try:
            videos = index_playlist(pid)
            print(f"{pid}: {len(videos)} videos")
        except Exception as e:
            print(f"{pid}: ERROR {e}", file=sys.stderr)
