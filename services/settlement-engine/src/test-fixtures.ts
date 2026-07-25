/**
 * Shared Test Fixtures for Settlement Engine Bulk Operations.
 * 
 * Provides mock merchant profiles with various limits configurations,
 * and arrays of settlement request payloads to test limit validations
 * and partial batch processing failures.
 */

export const MOCK_STELLAR_KEY_1 = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
export const MOCK_STELLAR_KEY_2 = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
export const MOCK_STELLAR_KEY_3 = 'GC3O6JFSB7N66H4XEQNZG3EXK72CS2W4D5LSLG2R7EXXEZBXZZZZZZZZ';
export const MOCK_STELLAR_KEY_4 = 'GD7V32JFSB7N66H4XEQNZG3EXK72CS2W4D5LSLG2R7EXXEZBXZYYYYYYYY';

// 1. Merchant with normal standard limits (min: 10, max: 5000, daily: 10000)
export const MOCK_MERCHANT_STANDARD = {
  id: MOCK_STELLAR_KEY_1,
  name: 'Standard Volume Merchant',
  ownerId: 'owner-user-standard-01',
  deletedAt: null,
  settings: {
    feeBps: 100,
    autoSettle: true,
    preferredAsset: 'USDC',
    minSettlementAmount: '10.00',
    maxSettlementAmount: '5000.00',
    dailySettlementLimit: '10000.00',
  },
  secretHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
};

// 2. Merchant with no settings or limits (falls back to defaults)
export const MOCK_MERCHANT_NO_LIMITS = {
  id: MOCK_STELLAR_KEY_2,
  name: 'No Limits Merchant',
  ownerId: 'owner-user-nolimits-02',
  deletedAt: null,
  settings: {},
  secretHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
};

// 3. Merchant with extremely tight limits (min: 5, max: 100, daily: 200)
export const MOCK_MERCHANT_TIGHT_LIMITS = {
  id: MOCK_STELLAR_KEY_3,
  name: 'Tight Limit Merchant',
  ownerId: 'owner-user-tight-03',
  deletedAt: null,
  settings: {
    feeBps: 50,
    autoSettle: false,
    preferredAsset: 'XLM',
    minSettlementAmount: '5.00',
    maxSettlementAmount: '100.00',
    dailySettlementLimit: '200.00',
  },
  secretHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
};

// 4. Merchant with soft-deleted state
export const MOCK_MERCHANT_DELETED = {
  id: MOCK_STELLAR_KEY_4,
  name: 'Inactive Soft-Deleted Merchant',
  ownerId: 'owner-user-deleted-04',
  deletedAt: new Date('2026-01-01T00:00:00.000Z'),
  settings: {},
  secretHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
};

// Reusable payload batches for validation testing
export const BATCH_VALID_STANDARD = [
  { amount: '50.00', asset: 'USDC' },
  { amount: '120.00', asset: 'USDC' },
  { amount: '75.50', asset: 'USDC' },
];

export const BATCH_WITH_MIN_LIMIT_VIOLATION = [
  { amount: '50.00', asset: 'USDC' },
  { amount: '2.00', asset: 'USDC' }, // Violates standard min limit (10.00)
  { amount: '80.00', asset: 'USDC' },
];

export const BATCH_WITH_MAX_LIMIT_VIOLATION = [
  { amount: '100.00', asset: 'USDC' },
  { amount: '6000.00', asset: 'USDC' }, // Violates standard max limit (5000.00)
  { amount: '150.00', asset: 'USDC' },
];

export const BATCH_WITH_DAILY_LIMIT_VIOLATION = [
  { amount: '4000.00', asset: 'USDC' },
  { amount: '5000.00', asset: 'USDC' },
  { amount: '2000.00', asset: 'USDC' }, // Cumulative total (11000.00) violates daily limit (10000.00)
];

export const BATCH_WITH_INVALID_AMOUNTS = [
  { amount: '100.00', asset: 'USDC' },
  { amount: '-50.00', asset: 'USDC' }, // Negative amount is invalid
  { amount: 'not-a-number', asset: 'USDC' }, // Non-numeric is invalid
  { amount: '200.00', asset: 'USDC' },
];

export const BATCH_WITH_MIXED_VIOLATIONS = [
  { amount: '5.00', asset: 'USDC' }, // Violates min limit
  { amount: '150.00', asset: 'USDC' }, // Valid
  { amount: '6500.00', asset: 'USDC' }, // Violates max limit
  { amount: '200.00', asset: 'USDC' }, // Valid
];
