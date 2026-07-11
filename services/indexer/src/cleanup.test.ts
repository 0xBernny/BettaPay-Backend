process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'a'.repeat(32);
process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
process.env.SETTLEMENT_CONTRACT_ID = 'CDLZFC3SYXDT4MMSTXTU4Z4VABMFR6SPLPNCZF656SIHPXT6LPWEEXGO';
process.env.GOVERNANCE_CONTRACT_ID = 'CBJDHFU7XYDT4MMSTXTU4Z4VABMFR6SPLPNCZF656SIHPXT6LPWEEXGO';
process.env.ADMIN_ADDRESS = 'GBJDHFU7XYDT4MMSTXTU4Z4VABMFR6SPLPNCZF656SIHPXT6LPWEEXGO';

import test from 'tape';

// Dynamically import to ensure environment variables are loaded first
const { env, events, cleanupOldEvents, runCleanupJob, fastify } = await import('./index.js');

// Helper to clear events array
function clearEvents() {
  events.length = 0;
}

test('1. Cleanup disabled by default (EVENT_RETENTION_DAYS = 0)', (t) => {
  clearEvents();
  env.EVENT_RETENTION_DAYS = 0;

  // Add an old event and a new event
  events.push({
    id: 'evt_1',
    topic: 'test',
    contractId: 'test-contract',
    indexedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
  });
  events.push({
    id: 'evt_2',
    topic: 'test',
    contractId: 'test-contract',
    indexedAt: new Date().toISOString(), // now
  });

  const deleted = cleanupOldEvents();
  t.equal(deleted, 0, 'should return 0 deleted events');
  t.equal(events.length, 2, 'no events should be deleted');
  t.end();
});

test('2. Cleanup enabled and correct retention cutoff', (t) => {
  clearEvents();
  env.EVENT_RETENTION_DAYS = 5;

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  // Event 1: 6 days ago (should be deleted)
  events.push({
    id: 'evt_1',
    topic: 'test',
    contractId: 'test-contract',
    indexedAt: new Date(now - 6 * oneDay).toISOString(),
  });
  // Event 2: 5 days and 1 hour ago (should be deleted)
  events.push({
    id: 'evt_2',
    topic: 'test',
    contractId: 'test-contract',
    indexedAt: new Date(now - 5 * oneDay - oneHour).toISOString(),
  });
  // Event 3: 4 days 23 hours ago (should be kept)
  events.push({
    id: 'evt_3',
    topic: 'test',
    contractId: 'test-contract',
    indexedAt: new Date(now - 4 * oneDay - 23 * oneHour).toISOString(),
  });
  // Event 4: 1 day ago (should be kept)
  events.push({
    id: 'evt_4',
    topic: 'test',
    contractId: 'test-contract',
    indexedAt: new Date(now - oneDay).toISOString(),
  });

  const deleted = cleanupOldEvents();
  t.equal(deleted, 2, 'should delete exactly 2 events');
  t.equal(events.length, 2, '2 events should remain');
  t.ok(events.find((e: any) => e.id === 'evt_3'), 'evt_3 should remain');
  t.ok(events.find((e: any) => e.id === 'evt_4'), 'evt_4 should remain');
  t.end();
});

test('3. Zero events deleted when none match cutoff', (t) => {
  clearEvents();
  env.EVENT_RETENTION_DAYS = 5;

  events.push({
    id: 'evt_1',
    topic: 'test',
    contractId: 'test-contract',
    indexedAt: new Date().toISOString(),
  });

  const deleted = cleanupOldEvents();
  t.equal(deleted, 0, 'should return 0');
  t.equal(events.length, 1, 'event should remain');
  t.end();
});

test('4. Batch deletion across multiple batches (batch size = 1000)', (t) => {
  clearEvents();
  env.EVENT_RETENTION_DAYS = 1;

  const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const totalOldEvents = 2500;

  for (let i = 0; i < totalOldEvents; i++) {
    events.push({
      id: `evt_old_${i}`,
      topic: 'test',
      contractId: 'test-contract',
      indexedAt: oldDate,
    });
  }

  // Add 10 new events to keep
  for (let i = 0; i < 10; i++) {
    events.push({
      id: `evt_new_${i}`,
      topic: 'test',
      contractId: 'test-contract',
      indexedAt: new Date().toISOString(),
    });
  }

  const deleted = cleanupOldEvents();
  t.equal(deleted, totalOldEvents, 'should delete all 2500 old events');
  t.equal(events.length, 10, 'should retain the 10 new events');
  t.end();
});

test('5. Logging on successful run', (t) => {
  clearEvents();
  env.EVENT_RETENTION_DAYS = 5;

  // Add 1 old event
  events.push({
    id: 'evt_1',
    topic: 'test',
    contractId: 'test-contract',
    indexedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Spy on fastify.log.info
  const originalInfo = (fastify.log as any).info;
  let loggedPayload: any = null;
  let loggedMsg: string = '';

  (fastify.log as any).info = (payload: any, msg?: string) => {
    loggedPayload = payload;
    loggedMsg = msg || (typeof payload === 'string' ? payload : '');
  };

  try {
    runCleanupJob();
    t.ok(loggedPayload, 'should have logged a payload');
    t.equal(loggedPayload.retentionDays, 5, 'logged retentionDays should be 5');
    t.equal(loggedPayload.deletedCount, 1, 'logged deletedCount should be 1');
    t.equal(loggedPayload.status, 'success', 'logged status should be success');
    t.ok(loggedMsg.includes('Event retention cleanup completed'), 'log message matches expectation');
  } finally {
    // Restore original logger function
    (fastify.log as any).info = originalInfo;
  }
  t.end();
});
