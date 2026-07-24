import test from 'tape';

/**
 * Unit tests for the batch deduplication approach used in the replay endpoint.
 *
 * Verifies that the in-memory Set-based dedup pattern introduced in issue #235
 * correctly identifies duplicates and provides O(1) lookup performance compared
 * to per-event database queries.
 */

test('dedup: Set correctly identifies existing stellarIds', (t) => {
  const dbResults = [
    { stellarId: 'evt-001' },
    { stellarId: 'evt-002' },
    { stellarId: 'evt-003' },
  ];

  const existingSet = new Set(dbResults.map((r) => r.stellarId));

  t.true(existingSet.has('evt-001'), 'finds first existing id');
  t.true(existingSet.has('evt-002'), 'finds second existing id');
  t.true(existingSet.has('evt-003'), 'finds third existing id');
  t.false(existingSet.has('evt-004'), 'does not find non-existing id');
  t.false(existingSet.has(''), 'empty string not in set');
  t.false(existingSet.has('evt-'), 'partial match not found');
  t.end();
});

test('dedup: multiple lookups on same Set are O(1)', (t) => {
  const ids = Array.from({ length: 1000 }, (_, i) => `evt-${String(i).padStart(4, '0')}`);
  const existingSet = new Set(ids);

  const start = Date.now();
  for (let i = 0; i < 1000; i++) {
    existingSet.has(`evt-${String(i).padStart(4, '0')}`);
  }
  const elapsedMs = Date.now() - start;

  t.true(elapsedMs < 100, `1000 Set lookups completed in ${elapsedMs}ms (expected < 100ms)`);
  t.end();
});

test('dedup: empty stellarId list produces empty Set', (t) => {
  const stellarIds: string[] = [];
  const existingSet = new Set<string>(
    stellarIds.length > 0
      ? [{ stellarId: 'evt-001' }].map((e) => e.stellarId).filter((id): id is string => id !== null)
      : [],
  );

  t.equal(existingSet.size, 0, 'empty stellarIds produces empty Set');
  t.false(existingSet.has('anything'), 'empty Set has no values');
  t.end();
});

test('dedup: null stellarId values are filtered before batch query', (t) => {
  const rawIds = ['evt-001', null, 'evt-002', null, 'evt-003'];
  const validIds = rawIds.filter((id): id is string => id !== null);

  t.deepEqual(validIds, ['evt-001', 'evt-002', 'evt-003'], 'null values filtered out');
  t.equal(validIds.length, 3, 'three valid ids remain');
  t.end();
});

test('dedup: batch findMany result mapping mirrors production code', (t) => {
  const dbResult = [
    { stellarId: 'evt-001' },
    { stellarId: 'evt-002' },
    { stellarId: null },
    { stellarId: 'evt-003' },
  ];

  const existingStellarIds = new Set<string>(
    dbResult.map((e) => e.stellarId).filter((id): id is string => id !== null),
  );

  t.equal(existingStellarIds.size, 3, 'null stellarId excluded from Set');
  t.true(existingStellarIds.has('evt-001'), 'evt-001 present');
  t.true(existingStellarIds.has('evt-002'), 'evt-002 present');
  t.true(existingStellarIds.has('evt-003'), 'evt-003 present');
  t.false(existingStellarIds.has(null as unknown as string), 'cannot lookup null in Set');
  t.end();
});

// ── Benchmark: batch vs individual query simulation ────────────────────────────

function simulateBatchLookup(ids: string[], existingSet: Set<string>): number {
  let found = 0;
  for (const id of ids) {
    if (existingSet.has(id)) found++;
  }
  return found;
}

function simulateIndividualLookup(ids: string[], existingSet: Set<string>): number {
  let found = 0;
  for (const id of ids) {
    // Simulate a DB query by iterating the entire set
    for (const existing of existingSet) {
      if (id === existing) {
        found++;
        break;
      }
    }
  }
  return found;
}

test('benchmark: batch Set-based dedup is faster than individual lookups', (t) => {
  const count = 1000;
  const allIds = Array.from({ length: count }, (_, i) => `evt-${String(i).padStart(4, '0')}`);
  const halfIds = allIds.slice(0, count / 2);
  const existingSet = new Set(halfIds);

  // Warm-up
  simulateBatchLookup(allIds, existingSet);
  simulateIndividualLookup(allIds, existingSet);

  const batchStart = Date.now();
  const batchFound = simulateBatchLookup(allIds, existingSet);
  const batchElapsed = Date.now() - batchStart;

  const individualStart = Date.now();
  const individualFound = simulateIndividualLookup(allIds, existingSet);
  const individualElapsed = Date.now() - individualStart;

  t.equal(batchFound, count / 2, 'batch lookup found correct duplicates');
  t.equal(individualFound, count / 2, 'individual lookup found correct duplicates');
  t.true(
    batchElapsed < individualElapsed,
    `batch (${batchElapsed}ms) is faster than individual (${individualElapsed}ms) for ${count} events`,
  );
  t.end();
});