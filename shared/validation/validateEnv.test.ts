import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv, validateEnvOrExit } from './index.js';

function validEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    JWT_SECRET: 'a'.repeat(32),
    FIELD_ENCRYPTION_KEY: 'b'.repeat(32),
    GOOGLE_CLIENT_ID: 'test-client-id',
    INTER_SERVICE_SECRET: 'a'.repeat(16),
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    SETTLEMENT_CONTRACT_ID: 'CONTRACT123',
    GOVERNANCE_CONTRACT_ID: 'CONTRACT456',
    ADMIN_ADDRESS: 'GADMIN',
    ADMIN_SECRET: 'SADMIN',
    ...overrides,
  };
}

test('validateEnv returns parsed config when all required variables are valid', () => {
  const env = validateEnv(validEnv());
  assert.equal(env.JWT_SECRET, 'a'.repeat(32));
  assert.deepEqual(env.CONTRACT_IDS, ['CONTRACT123']);
});

test('validateEnv throws with a human-readable message for a too-short secret', () => {
  assert.throws(
    () => validateEnv(validEnv({ JWT_SECRET: 'short' })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /JWT_SECRET: JWT_SECRET must be at least 32 characters \(got 5\)/);
      return true;
    },
  );
});

test('validateEnv throws listing every invalid variable, not just the first', () => {
  assert.throws(
    () => validateEnv(validEnv({ JWT_SECRET: 'short', INTER_SERVICE_SECRET: 'x' })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /JWT_SECRET/);
      assert.match(error.message, /INTER_SERVICE_SECRET/);
      return true;
    },
  );
});

test('validateEnv throws when a required variable is missing entirely', () => {
  const { DATABASE_URL, ...withoutDatabaseUrl } = validEnv();
  assert.throws(
    () => validateEnv(withoutDatabaseUrl),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DATABASE_URL/);
      return true;
    },
  );
});

test('validateEnvOrExit returns parsed config on valid input without exiting', () => {
  const originalExit = process.exit;
  let exitCalled = false;
  process.exit = ((() => {
    exitCalled = true;
  }) as unknown) as typeof process.exit;

  try {
    const env = validateEnvOrExit(validEnv());
    assert.equal(exitCalled, false);
    assert.equal(env.JWT_SECRET, 'a'.repeat(32));
  } finally {
    process.exit = originalExit;
  }
});

test('validateEnvOrExit logs a clean message and exits with code 1 on invalid input', () => {
  const originalExit = process.exit;
  const originalConsoleError = console.error;
  let exitCode: number | undefined;
  let loggedMessage = '';

  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('process.exit called');
  }) as unknown as typeof process.exit;
  console.error = ((message: string) => {
    loggedMessage = message;
  }) as typeof console.error;

  try {
    assert.throws(() => validateEnvOrExit(validEnv({ JWT_SECRET: 'short' })), /process\.exit called/);
    assert.equal(exitCode, 1);
    assert.match(loggedMessage, /JWT_SECRET: JWT_SECRET must be at least 32 characters \(got 5\)/);
  } finally {
    process.exit = originalExit;
    console.error = originalConsoleError;
  }
});
