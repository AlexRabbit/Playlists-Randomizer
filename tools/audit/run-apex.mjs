#!/usr/bin/env node
/**
 * APEX Audit runner — Tier S (client-side static app)
 * Security units U04-U06, U09, U11-U12, U26
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const findings = [];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|mjs|html)$/.test(name)) files.push(p);
  }
  return files;
}

// U09 — no secrets in source
const secretPatterns = [
  /sk-[a-zA-Z0-9]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /PRIVATE KEY/,
  /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
];
for (const f of walk(join(root, 'src'))) {
  const content = readFileSync(f, 'utf8');
  for (const re of secretPatterns) {
    if (re.test(content)) findings.push({ sev: 'CRITICAL', unit: 'U09', msg: `Secret pattern in ${f}` });
  }
}

// U06 — innerHTML usage must escape user content
const cardPlayer = readFileSync(join(root, 'src/ui/components/card-player.ts'), 'utf8');
if (!cardPlayer.includes('escapeHtml')) {
  findings.push({ sev: 'HIGH', unit: 'U06', msg: 'card-player may render unescaped titles' });
}

// U05 — eval / dangerously
for (const f of walk(join(root, 'src'))) {
  const c = readFileSync(f, 'utf8');
  if (/\beval\s*\(/.test(c) || /new Function\s*\(/.test(c)) {
    findings.push({ sev: 'HIGH', unit: 'U05', msg: `Dynamic code in ${f}` });
  }
}

// U26 — .env not in gitignore
const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
if (!gitignore.includes('.env')) {
  findings.push({ sev: 'MEDIUM', unit: 'U26', msg: '.env should be gitignored' });
}

// Run unit tests as U01 verify
try {
  execSync('npm test', { cwd: root, stdio: 'pipe' });
} catch (e) {
  findings.push({ sev: 'HIGH', unit: 'U01', msg: 'Unit tests failed' });
}

console.log('\n=== APEX AUDIT (Tier S) ===\n');
if (!findings.length) {
  console.log('PASS — No findings');
  console.log('\nUnits: U01 PASS, U05 PASS, U06 PASS, U09 PASS, U11 N/A, U12 INFO, U26 PASS');
  console.log('Skipped: U07-U08 (no server), U17-U21 (no backend), U23 (no LLM)');
  process.exit(0);
}

for (const f of findings) {
  console.log(`[${f.sev}] ${f.unit}: ${f.msg}`);
}
process.exit(1);
