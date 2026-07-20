/**
 * Verifies that the settlement engine uses the pg.Pool + PrismaPg adapter
 * pattern, matching the api-gateway/indexer setup (issue #253).
 *
 * These tests parse the source file as text so they require no database
 * connection and run in CI without any external dependencies.
 */
import test from 'tape';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexPath = path.resolve(__dirname, './index.ts');
const content = fs.readFileSync(indexPath, 'utf-8');

// ── Imports ──────────────────────────────────────────────────────────────────

test('settlement-engine imports pg as a default import', (t) => {
  t.match(
    content,
    /import\s+pg\s+from\s+['"]pg['"]/,
    'index.ts should import pg as default from "pg"',
  );
  t.end();
});

test('settlement-engine imports PrismaPg from @prisma/adapter-pg', (t) => {
  t.match(
    content,
    /import\s+\{[^}]*PrismaPg[^}]*\}\s+from\s+['"]@prisma\/adapter-pg['"]/,
    'index.ts should import PrismaPg from @prisma/adapter-pg',
  );
  t.end();
});

// ── Pool construction ─────────────────────────────────────────────────────────

test('settlement-engine creates a pg.Pool with connectionString from buildPrismaConnectionUrl', (t) => {
  t.match(
    content,
    /new\s+pg\.Pool\s*\(/,
    'index.ts should construct a pg.Pool instance',
  );
  t.match(
    content,
    /connectionString:\s*buildPrismaConnectionUrl\(/,
    'pg.Pool connectionString should be built with buildPrismaConnectionUrl',
  );
  t.end();
});

test('settlement-engine configures pool max from DATABASE_POOL_SIZE', (t) => {
  t.match(
    content,
    /max:\s*env\.DATABASE_POOL_SIZE/,
    'pg.Pool max should come from env.DATABASE_POOL_SIZE',
  );
  t.end();
});

test('settlement-engine configures pool connectionTimeoutMillis from DATABASE_POOL_TIMEOUT', (t) => {
  t.match(
    content,
    /connectionTimeoutMillis:\s*env\.DATABASE_POOL_TIMEOUT\s*\*\s*1000/,
    'pg.Pool connectionTimeoutMillis should derive from env.DATABASE_POOL_TIMEOUT',
  );
  t.end();
});

// ── Adapter & PrismaClient ────────────────────────────────────────────────────

test('settlement-engine wraps pool in a PrismaPg adapter', (t) => {
  t.match(
    content,
    /new\s+PrismaPg\s*\(\s*pool\s*\)/,
    'index.ts should pass pool to PrismaPg constructor',
  );
  t.end();
});

test('settlement-engine passes adapter to PrismaClient', (t) => {
  t.match(
    content,
    /new\s+PrismaClient\s*\(\s*\{[^}]*adapter[^}]*\}\s*\)/s,
    'PrismaClient should be constructed with the adapter option',
  );
  t.end();
});

// ── Side-effect removal ───────────────────────────────────────────────────────

test('settlement-engine does NOT assign process.env.DATABASE_URL as a side-effect', (t) => {
  const hasSideEffect = /process\.env\.DATABASE_URL\s*=/.test(content);
  t.ok(!hasSideEffect, 'index.ts must not mutate process.env.DATABASE_URL');
  t.end();
});
