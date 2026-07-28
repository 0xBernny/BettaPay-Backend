/**
 * Settlement Engine Properties and Configuration Parameters.
 * 
 * Provides types, default thresholds, error recovery strategies,
 * and mapping functions used across bulk and single settlement tasks.
 */

export interface SystemThresholds {
  minLimitDefault: string;
  maxLimitDefault: string;
  dailyAggregateDefault: string;
  maxConcurrencyLimit: number;
}

export const SETTLEMENT_SYSTEM_DEFAULTS: SystemThresholds = {
  minLimitDefault: '10.00',
  maxLimitDefault: '100000.00',
  dailyAggregateDefault: '500000.00',
  maxConcurrencyLimit: 100,
};

export interface AssetPrecisionConfig {
  assetCode: string;
  decimals: number;
  roundingMode: 'down' | 'half-up' | 'up';
}

export const ASSET_PRECISION_MAPPINGS: Record<string, AssetPrecisionConfig> = {
  USDC: {
    assetCode: 'USDC',
    decimals: 6,
    roundingMode: 'down',
  },
  EURT: {
    assetCode: 'EURT',
    decimals: 6,
    roundingMode: 'down',
  },
  XLM: {
    assetCode: 'XLM',
    decimals: 7,
    roundingMode: 'down',
  },
  NGN: {
    assetCode: 'NGN',
    decimals: 2,
    roundingMode: 'down',
  },
};

/**
 * Returns the decimal precision configuration for a given asset code.
 * Defaults to 2 decimals with round-down strategy if asset is not pre-registered.
 */
export function getAssetPrecision(asset: string): AssetPrecisionConfig {
  const normalized = asset.toUpperCase();
  return ASSET_PRECISION_MAPPINGS[normalized] ?? {
    assetCode: normalized,
    decimals: 2,
    roundingMode: 'down',
  };
}

/**
 * Validates that an asset is currently supported by the payout engine.
 */
export function isSupportedAsset(asset: string): boolean {
  return asset.toUpperCase() in ASSET_PRECISION_MAPPINGS;
}
