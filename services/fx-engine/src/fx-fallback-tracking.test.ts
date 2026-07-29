import test from 'tape';

// Mock state tracking for fallback mode
let lastSuccessfulFetch: number | null = null;
let fallbackStartTime: number | null = null;

function resetState(): void {
  lastSuccessfulFetch = null;
  fallbackStartTime = null;
}

function markFetchSuccess(): void {
  lastSuccessfulFetch = Date.now();
  fallbackStartTime = null;
}

function markFetchFailure(): void {
  if (fallbackStartTime === null) {
    fallbackStartTime = Date.now();
  }
}

function getStatus(): {
  mode: 'live' | 'fallback';
  lastSuccessfulFetch: string | null;
  fallbackActiveDurationMs: number;
  isUnhealthy: boolean;
} {
  const inFallback = fallbackStartTime !== null;
  const fallbackDurationMs = inFallback ? Date.now() - fallbackStartTime : 0;
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const isUnhealthy = fallbackDurationMs > ONE_HOUR_MS;

  return {
    mode: inFallback ? 'fallback' : 'live',
    lastSuccessfulFetch: lastSuccessfulFetch ? new Date(lastSuccessfulFetch).toISOString() : null,
    fallbackActiveDurationMs: fallbackDurationMs,
    isUnhealthy,
  };
}

test('Fallback tracking: initial state is live', (t) => {
  resetState();
  const status = getStatus();
  t.equal(status.mode, 'live', 'initial mode is live');
  t.equal(status.lastSuccessfulFetch, null, 'no successful fetch recorded');
  t.equal(status.fallbackActiveDurationMs, 0, 'fallback duration is 0');
  t.notOk(status.isUnhealthy, 'not unhealthy');
  t.end();
});

test('Fallback tracking: successful fetch marks live mode', (t) => {
  resetState();
  markFetchSuccess();

  const status = getStatus();
  t.equal(status.mode, 'live', 'mode is live after successful fetch');
  t.notEqual(status.lastSuccessfulFetch, null, 'lastSuccessfulFetch is recorded');
  t.end();
});

test('Fallback tracking: failed fetch enters fallback mode', (t) => {
  resetState();
  markFetchFailure();

  const status = getStatus();
  t.equal(status.mode, 'fallback', 'mode is fallback after fetch failure');
  t.ok(status.fallbackActiveDurationMs > 0, 'fallback duration is tracked');
  t.notOk(status.isUnhealthy, 'not unhealthy yet (duration < 1 hour)');
  t.end();
});

test('Fallback tracking: recovery to live mode', (t) => {
  resetState();
  markFetchFailure();
  // Simulate time passing
  const failureTime = Date.now();
  // Transition back to live
  markFetchSuccess();

  const status = getStatus();
  t.equal(status.mode, 'live', 'mode is live after recovery');
  t.equal(status.fallbackActiveDurationMs, 0, 'fallback duration is 0 after recovery');
  t.notOk(status.isUnhealthy, 'not unhealthy after recovery');
  t.end();
});

test('Fallback tracking: unhealthy after 1 hour in fallback', (t) => {
  resetState();
  fallbackStartTime = Date.now() - (61 * 60 * 1000); // 61 minutes ago

  const status = getStatus();
  t.equal(status.mode, 'fallback', 'mode is fallback');
  t.ok(status.fallbackActiveDurationMs > 60 * 60 * 1000, 'duration exceeds 1 hour');
  t.ok(status.isUnhealthy, 'is unhealthy after 1+ hour in fallback');
  t.end();
});

test('Fallback tracking: 59 minutes still healthy', (t) => {
  resetState();
  fallbackStartTime = Date.now() - (59 * 60 * 1000); // 59 minutes ago

  const status = getStatus();
  t.equal(status.mode, 'fallback', 'mode is fallback');
  t.ok(status.fallbackActiveDurationMs < 60 * 60 * 1000, 'duration under 1 hour');
  t.notOk(status.isUnhealthy, 'is still healthy under 1 hour');
  t.end();
});

test('Fallback tracking: multiple failed fetches', (t) => {
  resetState();
  markFetchFailure();
  const firstFailureTime = fallbackStartTime!;

  // Simulate another failed fetch shortly after
  markFetchFailure();

  t.equal(fallbackStartTime, firstFailureTime, 'fallback start time not reset on subsequent failures');
  t.end();
});

test('Fallback tracking: successful fetch after recovery', (t) => {
  resetState();
  markFetchFailure();
  markFetchSuccess(); // Recovery
  markFetchSuccess(); // Another success

  const status = getStatus();
  t.equal(status.mode, 'live', 'mode stays live');
  t.notEqual(status.lastSuccessfulFetch, null, 'lastSuccessfulFetch recorded');
  t.end();
});
