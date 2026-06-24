#!/usr/bin/env node
/**
 * Validates test protocol manifest and that all declared test files exist.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');

const requiredTests = [
  'tests/unit/url-state.test.ts',
  'tests/unit/playlist.test.ts',
  'tests/unit/backup.test.ts',
  'tests/unit/models.test.ts',
  'tests/protocol/PROTOCOL.md',
];

let failed = false;
for (const f of requiredTests) {
  const p = join(root, f);
  if (!existsSync(p)) {
    console.error(`MISSING: ${f}`);
    failed = true;
  }
}

const protocol = readFileSync(join(root, 'tests/protocol/PROTOCOL.md'), 'utf8');
if (!protocol.includes('Self-evolving')) {
  console.error('PROTOCOL.md invalid');
  failed = true;
}

if (failed) process.exit(1);
console.log('Test protocol OK —', requiredTests.length, 'artifacts verified');
