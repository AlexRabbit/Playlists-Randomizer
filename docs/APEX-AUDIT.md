# APEX Audit Report — Playlists Randomizer

**Date:** 2026-06-24  
**Tier:** S (client-side static SPA, GitHub Pages)  
**Auditor:** APEX automated + manual review

## Executive Summary

- Client-only architecture: no server attack surface on deploy.
- Workspace persisted in URL hash/query — no PII sent to backend.
- User content escaped before DOM insertion (XSS mitigated).
- No API keys or secrets in bundle.
- Unit tests + protocol runner gate CI.

## Findings Table

| Severity | Unit | Finding | Status |
|----------|------|---------|--------|
| — | U01 | 14 unit tests pass | PASS |
| — | U05 | No eval/Function in src | PASS |
| — | U06 | escapeHtml on video titles | PASS |
| — | U09 | No secrets in source | PASS |
| — | U11 | No PII collection | N/A |
| — | U12 | Logs may contain playlist IDs — local only | INFO |
| — | U26 | .env gitignored, .env.example committed | PASS |
| LOW | U24 | YouTube RSS fetch per card — user-triggered | INFO |

## Skipped Units

U07-U08 (no server/containers), U17-U21 (no backend APIs/queues), U22 (no bot), U23 (no LLM), U25 (no compliance scope).

## Security Gate Checklist (PR)

- [ ] `npm test` green
- [ ] `npm run audit` green
- [ ] No secrets in diff
- [ ] User HTML escaped in new UI code
- [ ] URL state backward compatible if schema changes

## Test Backlog

1. E2E with mocked YouTube RSS
2. URL length limits (browser ~2k–8k varies)
3. CSP header recommendation for GH Pages

## Fixed / Skipped / Ideas

**Fixed:** Initial XSS path via escapeHtml; legacy pid import; TypeScript strict build.

**Skipped:** Full Rust/Sanic/Numba stack (incompatible with GitHub Pages static deploy — soul applied via modular TS + Python local tools).

**Ideas:** See README and user-facing list at end of session.
