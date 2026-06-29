// Shared Type Definitions for BettaPay — single source of truth for TS types

export * from '@bettapay/validation';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
export type ID = string;
export type Currency = string;

export type ServiceName = 'api-gateway' | 'fx-engine' | 'settlement-engine' | 'indexer';

export type ServiceClientConfig = {
  baseUrl: string;
  timeout: number;
  retries: number;
  authToken?: string;
};
