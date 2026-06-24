# Playlists Randomizer — tests/protocol/PROTOCOL.md

Self-evolving unit testing protocol. **Update this file when adding features or fixing bugs.**

## Version: 1.0.0 | Last audit: 2026-06-24

### Mandatory on every change
1. Run `npm test` — all unit tests green
2. Run `npm run test:protocol` — protocol manifest valid
3. Run `npm run audit` — APEX security gate (client-tier S)
4. Add regression test for every bug fixed (U30)

### Test layers
| Layer | Tool | Path |
|-------|------|------|
| Unit | Vitest | `tests/unit/*.test.ts` |
| URL/codec | Vitest | `tests/unit/url-state.test.ts` |
| YouTube parse | Vitest | `tests/unit/playlist.test.ts` |
| Backup | Vitest | `tests/unit/backup.test.ts` |
| Shuffle | Vitest | `tests/unit/shuffle.test.ts` |
| Protocol meta | Node | `tools/test-protocol/run.mjs` |
| APEX audit | Node | `tools/audit/run-apex.mjs` |

### Regression backlog
- [ ] E2E: YouTube RSS mock integration
- [ ] Property test: encode/decode roundtrip
- [ ] Load test: 50 playlists URL length

### Changelog
- v1.0.0: Initial protocol — workspace codec, playlist parse, shuffle, backup
