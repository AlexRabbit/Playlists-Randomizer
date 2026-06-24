#!/usr/bin/env python3
"""Portable local preview server — serves dist/ after build."""
import http.server
import os
import socketserver
import sys

PORT = int(os.environ.get("VITE_DEV_PORT", "4173"))
ROOT = os.path.join(os.path.dirname(__file__), "..", "dist")

if not os.path.isdir(ROOT):
    print("Run npm run build first.", file=sys.stderr)
    sys.exit(1)

os.chdir(ROOT)
Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving {ROOT} at http://localhost:{PORT}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
