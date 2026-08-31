# Implementation Summary: Issues #607, #608, #611, #624

**Branch:** `fix/issues-607-608-611-624`  
**Target:** Betta-Pay/BettaPay-Backend  
**Assignee:** richardtoms100  
**Due Date:** August 31, 2026

## Overview

This document provides comprehensive implementation specifications for four critical security and reliability issues in the BettaPay-Backend system. All issues address authentication vulnerabilities, information leakage, and race condition hazards.

---

## Issue #607: Webhook Custom Headers CRLF Injection Vulnerability 🔒

**Type:** Security  
**Severity:** HIGH  
**Files Impacted:**
- `shared/validation/webhookSchema.ts`
- `services/settlement-engine/src/index.ts`
- `services/indexer/src/index.ts`

### Problem Statement
Webhook custom headers (`Settlement.webhookHeaders` and `WebhookSubscription.headers`) accept arbitrary JSON without CRLF (`\r\n`) validation. This allows header injection attacks where malicious merchants can:
- Inject HTTP response splitting headers
- Override critical headers (`Host`, `Content-Length`)
- Inject additional HTTP requests
- Poison webhook deliveries

**Attack Example:**
```json
{
  "headers": {
    "X-Custom": "value\r\nInjected-Header: malicious\r\n\r\n<script>alert('XSS')</script>"
  }
}
```

### Technical Requirements

#### 1. **Header Validation Module**
```typescript
// shared/validation/webhookHeadersValidator.ts (NEW FILE)

export interface WebhookHeaderValidationError {
  field: string
  message: string
  rejectedValue: string
}

export interface WebhookHeaderValidationResult {
  valid: boolean
  errors: WebhookHeaderValidationError[]
  sanitizedHeaders?: Record<string, string>
}

// RFC 7230 compliant header name validation
const HEADER_NAME_REGEX = /^[a-z0-9!#$%&'*+.^_`|~-]+$/i

// Disallowed headers that must not be overridden
const DISALLOWED_HEADERS = new Set([
  'host',
  'content-length',
  'content-type', // Managed by system
  'transfer-encoding',
  'connection',
  'upgrade',
  'te',
  'trailer',
  'proxy-authorization',
  'proxy-authenticate',
])

/**
 * Validates webhook custom headers for security vulnerabilities
 * 
 * @param headers - Record of header name to value
 * @returns Validation result with errors or sanitized headers
 */
export function validateWebhookHeaders(
  headers: unknown
): WebhookHeaderValidationResult {
  const errors: WebhookHeaderValidationError[] = []
  
  // Type check
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return {
      valid: false,
      errors: [{
        field: 'headers',
        message: 'Headers must be a non-null object',
        rejectedValue: JSON.stringify(headers),
      }],
    }
  }
  
  const sanitizedHeaders: Record<string, string> = {}
  const headerEntries = Object.entries(headers as Record<string, unknown>)
  
  // Limit number of headers
  if (headerEntries.length > 50) {
    errors.push({
      field: 'headers',
      message: 'Too many headers (max 50)',
      rejectedValue: `${headerEntries.length} headers provided`,
    })
  }
  
  for (const [name, value] of headerEntries) {
    const headerName = name.trim()
    const normalizedName = headerName.toLowerCase()
    
    // Validate header name format
    if (!HEADER_NAME_REGEX.test(headerName)) {
      errors.push({
        field: `headers.${name}`,
        message: 'Invalid header name format (RFC 7230)',
        rejectedValue: headerName,
      })
      continue
    }
    
    // Check for CRLF in header name
    if (headerName.includes('\r') || headerName.includes('\n')) {
      errors.push({
        field: `headers.${name}`,
        message: 'Header name contains CRLF characters',
        rejectedValue: headerName,
      })
      continue
    }
    
    // Check for colon prefix (header injection attempt)
    if (headerName.startsWith(':')) {
      errors.push({
        field: `headers.${name}`,
        message: 'Header name cannot start with colon',
        rejectedValue: headerName,
      })
      continue
    }
    
    // Check disallowed headers
    if (DISALLOWED_HEADERS.has(normalizedName)) {
      errors.push({
        field: `headers.${name}`,
        message: `Header '${normalizedName}' cannot be overridden (system-managed)`,
        rejectedValue: headerName,
      })
      continue
    }
    
    // Validate header value
    if (typeof value !== 'string') {
      errors.push({
        field: `headers.${name}`,
        message: 'Header value must be a string',
        rejectedValue: JSON.stringify(value),
      })
      continue
    }
    
    const headerValue = value.trim()
    
    // Check for CRLF in header value (injection attack)
    if (headerValue.includes('\r') || headerValue.includes('\n')) {
      errors.push({
        field: `headers.${name}`,
        message: 'Header value contains CRLF characters (injection attempt)',
        rejectedValue: headerValue.slice(0, 50) + '...',
      })
      continue
    }
    
    // Check header value length
    if (headerValue.length > 8192) {
      errors.push({
        field: `headers.${name}`,
        message: 'Header value too long (max 8192 characters)',
        rejectedValue: `${headerValue.length} characters`,
      })
      continue
    }
    
    // Check for non-printable ASCII characters (excluding tab)
    if (!/^[\x20-\x7E\t]*$/.test(headerValue)) {
      errors.push({
        field: `headers.${name}`,
        message: 'Header value contains non-printable characters',
        rejectedValue: headerValue.slice(0, 50) + '...',
      })
      continue
    }
    
    // Store with normalized name (lowercase per HTTP/2 spec)
    sanitizedHeaders[normalizedName] = headerValue
  }
  
  if (errors.length > 0) {
    return { valid: false, errors }
  }
  
  return {
    valid: true,
    errors: [],
    sanitizedHeaders,
  }
}

/**
 * Zod schema for webhook headers validation
 */
import { z } from 'zod'

export const webhookHeadersSchema = z.record(z.string()).refine(
  (headers) => validateWebhookHeaders(headers).valid,
  (headers) => ({
    message: validateWebhookHeaders(headers).errors.map(e => e.message).join('; '),
  })
)
```

#### 2. **Integration with Webhook Schema**
```typescript
// shared/validation/webhookSchema.ts (UPDATE)

import { validateWebhookHeaders, webhookHeadersSchema } from './webhookHeadersValidator'

// Update existing webhook schemas
export const createWebhookSubscriptionSchema = z.object({
  merchantId: z.string().optional(),
  url: z.string().url(),
  events: z.array(z.enum(['settlement.created', 'settlement.completed', 'payment.received'])),
  headers: webhookHeadersSchema.optional(), // ADD THIS
  secret: z.string().min(16).optional(),
})

export const updateWebhookSubscriptionSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(['settlement.created', 'settlement.completed', 'payment.received'])).optional(),
  headers: webhookHeadersSchema.optional(), // ADD THIS
  secret: z.string().min(16).optional(),
  active: z.boolean().optional(),
})
```

#### 3. **Settlement Engine Integration**
```typescript
// services/settlement-engine/src/index.ts (UPDATE)

import { validateWebhookHeaders } from '../../../shared/validation/webhookHeadersValidator'

// In POST /api/settlements endpoint
app.post('/api/settlements', async (req, res) => {
  try {
    const { webhookUrl, webhookHeaders, ...settlementData } = req.body
    
    // Validate webhook headers if provided
    if (webhookHeaders) {
      const validation = validateWebhookHeaders(webhookHeaders)
      
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid webhook headers',
          details: validation.errors,
        })
      }
      
      // Use sanitized headers (normalized to lowercase)
      settlementData.webhookHeaders = validation.sanitizedHeaders
    }
    
    // Create settlement with validated headers
    const settlement = await prisma.settlement.create({
      data: {
        ...settlementData,
        webhookHeaders: settlementData.webhookHeaders || undefined,
      },
    })
    
    res.status(201).json(settlement)
  } catch (error) {
    console.error('Settlement creation failed:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
```

#### 4. **Indexer Webhook Subscription Integration**
```typescript
// services/indexer/src/index.ts (UPDATE)

import { validateWebhookHeaders } from '../../../shared/validation/webhookHeadersValidator'

// In POST /api/subscriptions endpoint
app.post('/api/subscriptions', async (req, res) => {
  try {
    const { headers: customHeaders, ...subscriptionData } = req.body
    
    // Validate custom headers
    if (customHeaders) {
      const validation = validateWebhookHeaders(customHeaders)
      
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid webhook headers',
          details: validation.errors,
        })
      }
      
      subscriptionData.headers = validation.sanitizedHeaders
    }
    
    const subscription = await prisma.webhookSubscription.create({
      data: subscriptionData,
    })
    
    res.status(201).json(subscription)
  } catch (error) {
    console.error('Subscription creation failed:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// In PATCH /api/subscriptions/:id endpoint
app.patch('/api/subscriptions/:id', async (req, res) => {
  try {
    const { headers: customHeaders, ...updateData } = req.body
    
    if (customHeaders !== undefined) {
      const validation = validateWebhookHeaders(customHeaders)
      
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid webhook headers',
          details: validation.errors,
        })
      }
      
      updateData.headers = validation.sanitizedHeaders
    }
    
    const subscription = await prisma.webhookSubscription.update({
      where: { id: req.params.id },
      data: updateData,
    })
    
    res.json(subscription)
  } catch (error) {
    console.error('Subscription update failed:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
```

#### 5. **Webhook Delivery Integration**
```typescript
// services/indexer/src/webhook-delivery.ts (UPDATE)

import { validateWebhookHeaders } from '../../../shared/validation/webhookHeadersValidator'

async function deliverWebhook(delivery: IndexedEventWebhookDelivery) {
  const { url, headers: customHeaders, payload, signature } = delivery
  
  // Validate stored headers before delivery (defense in depth)
  if (customHeaders) {
    const validation = validateWebhookHeaders(customHeaders)
    
    if (!validation.valid) {
      console.error('Stored webhook headers failed validation:', validation.errors)
      // Use empty headers as fallback
      customHeaders = {}
    }
  }
  
  const requestHeaders = {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signature,
    ...customHeaders, // Merge validated custom headers
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(payload),
  })
  
  return response
}
```

#### 6. **Unit Tests**
```typescript
// shared/validation/webhookHeadersValidator.test.ts (NEW FILE)

import { describe, it, expect } from 'vitest'
import { validateWebhookHeaders } from './webhookHeadersValidator'

describe('validateWebhookHeaders', () => {
  it('accepts valid headers', () => {
    const result = validateWebhookHeaders({
      'X-Custom-Header': 'value',
      'X-Another': 'another-value',
    })
    
    expect(result.valid).toBe(true)
    expect(result.sanitizedHeaders).toEqual({
      'x-custom-header': 'value',
      'x-another': 'another-value',
    })
  })
  
  it('rejects headers with CRLF in value (injection attack)', () => {
    const result = validateWebhookHeaders({
      'X-Malicious': 'value\r\nInjected-Header: evil',
    })
    
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].field).toBe('headers.X-Malicious')
    expect(result.errors[0].message).toContain('CRLF')
  })
  
  it('rejects headers with CRLF in name', () => {
    const result = validateWebhookHeaders({
      'X-Evil\r\n': 'value',
    })
    
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('CRLF')
  })
  
  it('rejects disallowed Host header override', () => {
    const result = validateWebhookHeaders({
      'Host': 'evil.com',
      'X-Ok': 'value',
    })
    
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].field).toBe('headers.Host')
    expect(result.errors[0].message).toContain('cannot be overridden')
  })
  
  it('rejects disallowed Content-Length header override', () => {
    const result = validateWebhookHeaders({
      'Content-Length': '99999',
    })
    
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('cannot be overridden')
  })
  
  it('rejects invalid header name format', () => {
    const result = validateWebhookHeaders({
      'Invalid Header': 'value', // space not allowed
    })
    
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('Invalid header name format')
  })
  
  it('rejects headers starting with colon', () => {
    const result = validateWebhookHeaders({
      ':authority': 'evil.com', // HTTP/2 pseudo-header injection
    })
    
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('cannot start with colon')
  })
  
  it('rejects non-string header values', () => {
    const result = validateWebhookHeaders({
      'X-Number': 123,
      'X-Object': { nested: 'value' },
    })
    
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
  })
  
  it('rejects non-printable characters in value', () => {
    const result = validateWebhookHeaders({
      'X-Binary': 'value\x00with\x01null',
    })
    
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('non-printable')
  })
  
  it('rejects too many headers', () => {
    const manyHeaders: Record<string, string> = {}
    for (let i = 0; i < 51; i++) {
      manyHeaders[`X-Header-${i}`] = 'value'
    }
    
    const result = validateWebhookHeaders(manyHeaders)
    
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('Too many headers')
  })
  
  it('normalizes header names to lowercase', () => {
    const result = validateWebhookHeaders({
      'X-Custom-HEADER': 'value',
      'X-Another-Header': 'another',
    })
    
    expect(result.valid).toBe(true)
    expect(result.sanitizedHeaders).toEqual({
      'x-custom-header': 'value',
      'x-another-header': 'another',
    })
  })
})
```

### Acceptance Criteria
- ✅ `headers: {"X-Ok":"a\r\nInjected: b"}` rejected with 400 and field error
- ✅ `Host` / `Content-Length` overrides rejected
- ✅ Valid headers round-trip and sent verbatim on delivery
- ✅ Header names normalized to lowercase
- ✅ All unit tests pass

---

## Issue #608: Settlement Webhook Payload Leaks Internal webhookUrl 🔐

**Type:** Security - Information Disclosure  
**Severity:** MEDIUM  
**Files Impacted:**
- `services/settlement-engine/src/webhook-payload.ts`
- `docs/INDEXER_AND_WEBHOOKS.md`

### Problem Statement
`buildSettlementWebhookData()` includes `webhookUrl: s.webhookUrl` in the webhook payload sent to merchants. This URL contains:
- Internal Vercel preview URLs
- ngrok tunnels
- Internal hostnames
- Infrastructure details

This leaks deployment topology to any merchant receiving webhooks.

### Technical Requirements

#### 1. **Remove webhookUrl from Payload**
```typescript
// services/settlement-engine/src/webhook-payload.ts (UPDATE)

export interface SettlementWebhookData {
  id: string
  merchantId: string
  amount: string
  currency: string
  status: 'pending' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
  metadata?: Record<string, any>
  // webhookUrl: string  ← REMOVE THIS LINE
}

export function buildSettlementWebhookData(
  settlement: Settlement
): SettlementWebhookData {
  return {
    id: settlement.id,
    merchantId: settlement.merchantId,
    amount: settlement.amount.toString(),
    currency: settlement.currency,
    status: settlement.status,
    createdAt: settlement.createdAt.toISOString(),
    completedAt: settlement.completedAt?.toISOString(),
    metadata: settlement.metadata as Record<string, any>,
    // DO NOT include webhookUrl here
  }
}

// webhookUrl is still available in IndexedEventWebhookDelivery for internal routing
export interface IndexedEventWebhookDelivery {
  id: string
  subscriptionId: string
  eventType: string
  url: string  // ← Internal routing only, not in payload
  headers?: Record<string, string>
  payload: SettlementWebhookData  // ← Public data without webhookUrl
  signature: string
  attempts: number
  status: 'pending' | 'delivered' | 'failed'
  createdAt: Date
}
```

#### 2. **Update Webhook Delivery Logic**
```typescript
// services/settlement-engine/src/webhook-sender.ts (UPDATE)

async function sendSettlementWebhook(settlement: Settlement) {
  // Build clean payload without internal URLs
  const payload = buildSettlementWebhookData(settlement)
  
  // Get subscription for internal routing
  const subscription = await prisma.webhookSubscription.findUnique({
    where: { id: settlement.webhookSubscriptionId },
  })
  
  if (!subscription) {
    console.error(`No webhook subscription found for settlement ${settlement.id}`)
    return
  }
  
  // Create delivery record with internal URL separate from payload
  const delivery = await prisma.webhookDelivery.create({
    data: {
      subscriptionId: subscription.id,
      eventType: 'settlement.completed',
      url: subscription.url,  // ← Internal URL for routing
      payload: payload,  // ← Clean payload without internal URLs
      signature: generateSignature(payload, subscription.secret),
      status: 'pending',
    },
  })
  
  // Deliver webhook
  await deliverWebhook(delivery)
}
```

#### 3. **Update Documentation**
```markdown
<!-- docs/INDEXER_AND_WEBHOOKS.md (UPDATE) -->

## Webhook Payload Format

### Settlement Webhook Payload

When a settlement event occurs, BettaPay sends a POST request to your configured webhook URL:

**Example Payload:**
\`\`\`json
{
  "id": "stl_1234567890",
  "merchantId": "mch_abcdef123456",
  "amount": "100.50",
  "currency": "USD",
  "status": "completed",
  "createdAt": "2026-08-31T12:00:00Z",
  "completedAt": "2026-08-31T12:05:00Z",
  "metadata": {
    "orderId": "order_xyz",
    "customField": "value"
  }
}
\`\`\`

**Note:** The `webhookUrl` field has been removed from the payload as of v2.0 for security reasons. Your webhook endpoint URL is configured in your merchant dashboard and is not included in webhook payloads.

### Webhook Headers

Each webhook request includes:
- `Content-Type: application/json`
- `X-Webhook-Signature: <HMAC-SHA256 signature>`
- Custom headers configured in your webhook subscription (optional)

### Verifying Webhook Signatures

\`\`\`typescript
import crypto from 'crypto'

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}
\`\`\`
```

#### 4. **Migration Guide**
```markdown
<!-- docs/MIGRATION_V2.md (NEW FILE) -->

# Migration Guide: v1 → v2

## Breaking Changes

### Webhook Payload Changes

**Removed Field:** `webhookUrl`

The `webhookUrl` field has been removed from all webhook payloads for security reasons.

**Before (v1):**
\`\`\`json
{
  "id": "stl_123",
  "merchantId": "mch_abc",
  "amount": "100.00",
  "webhookUrl": "https://internal-preview-xyz.vercel.app/webhooks"  ← REMOVED
}
\`\`\`

**After (v2):**
\`\`\`json
{
  "id": "stl_123",
  "merchantId": "mch_abc",
  "amount": "100.00"
}
\`\`\`

**Action Required:** If your application parses the `webhookUrl` field from webhook payloads, remove this dependency. The webhook URL is managed in your merchant dashboard and should not be used for validation or routing logic.

**Rationale:** The `webhookUrl` field exposed internal infrastructure details (Vercel preview URLs, ngrok tunnels, etc.) that should not be shared with merchants.
```

#### 5. **Unit Tests**
```typescript
// services/settlement-engine/src/webhook-payload.test.ts (UPDATE)

import { describe, it, expect } from 'vitest'
import { buildSettlementWebhookData } from './webhook-payload'

describe('buildSettlementWebhookData', () => {
  it('does not include webhookUrl in payload', () => {
    const settlement = {
      id: 'stl_123',
      merchantId: 'mch_abc',
      amount: new Decimal('100.50'),
      currency: 'USD',
      status: 'completed',
      webhookUrl: 'https://internal-preview.vercel.app/webhooks', // Internal URL
      createdAt: new Date('2026-08-31T12:00:00Z'),
      completedAt: new Date('2026-08-31T12:05:00Z'),
      metadata: { orderId: 'order_xyz' },
    }
    
    const payload = buildSettlementWebhookData(settlement)
    
    // Verify webhookUrl is NOT in payload
    expect(payload).not.toHaveProperty('webhookUrl')
    
    // Verify other fields are present
    expect(payload.id).toBe('stl_123')
    expect(payload.merchantId).toBe('mch_abc')
    expect(payload.amount).toBe('100.50')
    expect(payload.status).toBe('completed')
  })
  
  it('includes all public settlement data', () => {
    const settlement = {
      id: 'stl_456',
      merchantId: 'mch_def',
      amount: new Decimal('250.00'),
      currency: 'EUR',
      status: 'pending',
      webhookUrl: 'https://ngrok-tunnel.io/hook',
      createdAt: new Date('2026-08-31T14:00:00Z'),
      metadata: { transactionId: 'tx_789' },
    }
    
    const payload = buildSettlementWebhookData(settlement)
    
    expect(payload).toEqual({
      id: 'stl_456',
      merchantId: 'mch_def',
      amount: '250.00',
      currency: 'EUR',
      status: 'pending',
      createdAt: '2026-08-31T14:00:00.000Z',
      metadata: { transactionId: 'tx_789' },
    })
  })
})
```

### Acceptance Criteria
- ✅ Webhook `data` no longer contains `webhookUrl`
- ✅ Internal `IndexedEventWebhookDelivery.url` retained for routing
- ✅ Documentation updated with v2 payload example
- ✅ Migration guide created
- ✅ All unit tests pass

---

## Issue #611: Wallet Challenge Consume Race Condition (Lua vs getdel) 🏃

**Type:** Reliability - Race Condition  
**Severity:** HIGH  
**Files Impacted:**
- `services/api-gateway/src/wallet-auth-challenge.ts`
- `services/api-gateway/src/wallet-challenge-store.ts`
- `services/api-gateway/src/wallet-auth-challenge-binding.test.ts`

### Problem Statement
Two different implementations exist for consuming wallet challenges:
1. **Lua script** with `GET+DEL` in `wallet-auth-challenge.ts:54`
2. **`getdel`** command in `wallet-challenge-store.ts:112`

Only the `getdel` path has test coverage. The Lua path is untested for concurrent `consume()` calls, creating a race condition where two simultaneous verifications could both see the same challenge and accept it twice.

### Technical Requirements

#### 1. **Consolidate to Single Implementation**
```typescript
// services/api-gateway/src/wallet-challenge-store.ts (CONSOLIDATED)

import { createClient, type RedisClientType } from 'redis'

export interface StoredWalletChallenge {
  address: string
  challenge: string
  createdAt: number
  expiresAt: number
}

export class WalletChallengeStore {
  private redis: RedisClientType
  
  constructor(redisClient: RedisClientType) {
    this.redis = redisClient
  }
  
  /**
   * Stores a challenge for a wallet address
   * TTL is set to prevent stale challenges from accumulating
   */
  async set(address: string, challenge: string, ttlSeconds: number = 300): Promise<void> {
    const key = this.getKey(address)
    const now = Date.now()
    
    const data: StoredWalletChallenge = {
      address,
      challenge,
      createdAt: now,
      expiresAt: now + (ttlSeconds * 1000),
    }
    
    await this.redis.setEx(key, ttlSeconds, JSON.stringify(data))
  }
  
  /**
   * Atomically retrieves and deletes a challenge (consume)
   * Uses Redis 6.2+ GETDEL command for atomic read-and-delete
   * 
   * This prevents race conditions where two concurrent consume calls
   * could both read the same challenge before deletion.
   * 
   * @returns StoredWalletChallenge if found, null if not found or already consumed
   */
  async consume(address: string): Promise<StoredWalletChallenge | null> {
    const key = this.getKey(address)
    
    // GETDEL is atomic in Redis 6.2+
    // It retrieves the value and deletes the key in a single operation
    const data = await this.redis.getDel(key)
    
    if (!data) {
      return null
    }
    
    try {
      const stored: StoredWalletChallenge = JSON.parse(data)
      
      // Verify not expired (defense in depth - Redis TTL should handle this)
      if (Date.now() > stored.expiresAt) {
        return null
      }
      
      return stored
    } catch (error) {
      console.error('Failed to parse stored challenge:', error)
      return null
    }
  }
  
  /**
   * Non-consuming read (for admin/debugging only)
   */
  async get(address: string): Promise<StoredWalletChallenge | null> {
    const key = this.getKey(address)
    const data = await this.redis.get(key)
    
    if (!data) {
      return null
    }
    
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  
  /**
   * Deletes a challenge without reading it
   */
  async delete(address: string): Promise<boolean> {
    const key = this.getKey(address)
    const deleted = await this.redis.del(key)
    return deleted > 0
  }
  
  private getKey(address: string): string {
    return `wallet:challenge:${address.toLowerCase()}`
  }
}
```

#### 2. **Remove Lua Script Implementation**
```typescript
// services/api-gateway/src/wallet-auth-challenge.ts (UPDATE - REMOVE LUA SCRIPT)

import { WalletChallengeStore } from './wallet-challenge-store'

// REMOVE THIS BLOCK:
/*
const LUA_GET_DEL_SCRIPT = `
  local key = KEYS[1]
  local value = redis.call('GET', key)
  if value then
    redis.call('DEL', key)
    return value
  end
  return nil
`
*/

export async function verifyWalletChallenge(
  address: string,
  signature: string,
  challengeStore: WalletChallengeStore
): Promise<boolean> {
  // Use consolidated consume method (GETDEL)
  const stored = await challengeStore.consume(address)
  
  if (!stored) {
    console.warn(`No challenge found for address ${address}`)
    return false
  }
  
  // Verify signature
  const isValid = await verifySignature(stored.challenge, signature, address)
  
  if (!isValid) {
    console.warn(`Invalid signature for address ${address}`)
    return false
  }
  
  return true
}
```

#### 3. **Concurrent Consume Test**
```typescript
// services/api-gateway/src/wallet-auth-challenge-binding.test.ts (ADD CONCURRENT TEST)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from 'redis'
import { WalletChallengeStore } from './wallet-challenge-store'

describe('WalletChallengeStore - Concurrent Consume', () => {
  let redis: RedisClientType
  let store: WalletChallengeStore
  
  beforeEach(async () => {
    redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })
    await redis.connect()
    store = new WalletChallengeStore(redis)
  })
  
  afterEach(async () => {
    await redis.quit()
  })
  
  it('ensures only one of 10 concurrent consume calls succeeds', async () => {
    const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST'
    const challenge = 'test-challenge-12345'
    
    // Store a challenge
    await store.set(address, challenge, 60)
    
    // Fire 10 parallel consume calls
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.consume(address))
    )
    
    // Exactly one should succeed, others should get null
    const successfulConsumes = results.filter(r => r !== null)
    const failedConsumes = results.filter(r => r === null)
    
    expect(successfulConsumes).toHaveLength(1)
    expect(failedConsumes).toHaveLength(9)
    expect(successfulConsumes[0]?.challenge).toBe(challenge)
    
    // Verify challenge is fully consumed
    const afterConsume = await store.get(address)
    expect(afterConsume).toBeNull()
  })
  
  it('ensures concurrent consume of different addresses works independently', async () => {
    const addresses = [
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAA234567ABCDEFGHIJKLMNOPQRST',
      'GBBBBBBBBBBBBBBBBBBBBBBBBBBB234567ABCDEFGHIJKLMNOPQRST',
      'GCCCCCCCCCCCCCCCCCCCCCCCCCCC234567ABCDEFGHIJKLMNOPQRST',
    ]
    
    // Store challenges for each address
    await Promise.all(
      addresses.map((addr, i) => store.set(addr, `challenge-${i}`, 60))
    )
    
    // Consume all concurrently (should all succeed independently)
    const results = await Promise.all(
      addresses.map(addr => store.consume(addr))
    )
    
    expect(results).toHaveLength(3)
    results.forEach((result, i) => {
      expect(result).not.toBeNull()
      expect(result?.challenge).toBe(`challenge-${i}`)
    })
  })
  
  it('handles race between consume and expiry gracefully', async () => {
    const address = 'GDDDDDDDDDDDDDDDDDDDDDDDDDDD234567ABCDEFGHIJKLMNOPQRST'
    const challenge = 'short-lived-challenge'
    
    // Store with 1 second TTL
    await store.set(address, challenge, 1)
    
    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 1100))
    
    // Attempt to consume expired challenge
    const result = await store.consume(address)
    
    // Should return null (either Redis TTL or expiry check)
    expect(result).toBeNull()
  })
})
```

#### 4. **Integration Test**
```typescript
// services/api-gateway/src/wallet-auth-challenge.integration.test.ts (NEW FILE)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from 'redis'
import { WalletChallengeStore } from './wallet-challenge-store'
import { verifyWalletChallenge } from './wallet-auth-challenge'
import { Keypair } from '@stellar/stellar-sdk'

describe('Wallet Challenge Integration - Concurrent Verification', () => {
  let redis: RedisClientType
  let store: WalletChallengeStore
  let keypair: Keypair
  
  beforeEach(async () => {
    redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })
    await redis.connect()
    store = new WalletChallengeStore(redis)
    keypair = Keypair.random()
  })
  
  afterEach(async () => {
    await redis.quit()
  })
  
  it('prevents double-verification with concurrent calls', async () => {
    const address = keypair.publicKey()
    const challenge = `BettaPay wants you to sign in at ${Date.now()}`
    
    // Store challenge
    await store.set(address, challenge, 60)
    
    // Sign challenge
    const signature = keypair.sign(Buffer.from(challenge)).toString('base64')
    
    // Fire 5 concurrent verification attempts
    const results = await Promise.all(
      Array.from({ length: 5 }, () => 
        verifyWalletChallenge(address, signature, store)
      )
    )
    
    // Only one should succeed
    const successCount = results.filter(r => r === true).length
    expect(successCount).toBe(1)
    
    // Challenge should be consumed
    const remaining = await store.get(address)
    expect(remaining).toBeNull()
  })
})
```

### Acceptance Criteria
- ✅ Single `WalletChallengeStore` implementation using `GETDEL`
- ✅ Lua script removed from `wallet-auth-challenge.ts`
- ✅ Concurrent consume test passes deterministically (10 parallel calls, 1 succeeds)
- ✅ No duplicate `StoredWalletChallenge` interface
- ✅ All tests pass

---

## Issue #624: Webhook Test Endpoint Cross-Merchant Poisoning 🚨

**Type:** Security - Authorization Bypass  
**Severity:** CRITICAL  
**Files Impacted:**
- `services/indexer/src/index.ts`

### Problem Statement
`POST /api/webhooks/:id/test` updates `lastTestedAt` and `lastTestStatus` without verifying that `subscription.merchantId === request.merchantId`. Any authenticated merchant can:
- Test another merchant's webhook URL
- Poison their `lastTestStatus`
- Probe internal infrastructure
- Cause webhook delivery failures

**Attack Scenario:**
1. Attacker (Merchant A) authenticates
2. Obtains webhook subscription ID of Merchant B (via enumeration or leak)
3. POSTs to `/api/webhooks/{merchant_b_subscription_id}/test`
4. Merchant B's webhook is tested with Merchant A's context, poisoning status

### Technical Requirements

#### 1. **Add Authorization Check**
```typescript
// services/indexer/src/index.ts (UPDATE)

app.post('/api/webhooks/:id/test', async (req, res) => {
  try {
    const subscriptionId = req.params.id
    const requestMerchantId = req.auth.merchantId // From JWT or session
    const isAdmin = req.auth.isAdmin // Admin flag
    
    // Fetch subscription
    const subscription = await prisma.webhookSubscription.findUnique({
      where: { id: subscriptionId },
    })
    
    if (!subscription) {
      return res.status(404).json({ error: 'Webhook subscription not found' })
    }
    
    // Authorization check: merchant can only test their own webhooks
    if (subscription.merchantId !== null) {
      // Merchant-scoped subscription
      if (subscription.merchantId !== requestMerchantId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot test webhook subscription owned by another merchant',
        })
      }
    } else {
      // Global subscription (merchantId = null)
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins can test global webhook subscriptions',
        })
      }
    }
    
    // Authorization passed - proceed with test
    const testPayload = {
      eventType: 'webhook.test',
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook delivery',
    }
    
    try {
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Test': 'true',
          ...subscription.headers,
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000), // 10s timeout
      })
      
      // Update test status
      await prisma.webhookSubscription.update({
        where: { id: subscriptionId },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: response.ok ? 'success' : 'failed',
          lastTestStatusCode: response.status,
        },
      })
      
      res.json({
        success: response.ok,
        statusCode: response.status,
        message: response.ok ? 'Webhook test successful' : 'Webhook test failed',
      })
    } catch (error) {
      // Network error or timeout
      await prisma.webhookSubscription.update({
        where: { id: subscriptionId },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: 'error',
          lastTestError: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      
      res.status(500).json({
        success: false,
        error: 'Webhook test failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  } catch (error) {
    console.error('Webhook test endpoint error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
```

#### 2. **Add Merchant Context Middleware**
```typescript
// services/indexer/src/middleware/auth.ts (UPDATE OR CREATE)

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthenticatedRequest extends Request {
  auth: {
    merchantId: string
    isAdmin: boolean
    sub: string
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid authorization header' })
  }
  
  const token = authHeader.substring(7)
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string
      merchantId: string
      isAdmin?: boolean
    }
    
    ;(req as AuthenticatedRequest).auth = {
      merchantId: decoded.merchantId,
      isAdmin: decoded.isAdmin ?? false,
      sub: decoded.sub,
    }
    
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' })
  }
}
```

#### 3. **Unit Tests**
```typescript
// services/indexer/src/webhooks.test.ts (ADD TESTS)

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from './index'
import { generateTestToken } from '../../test-utils'

describe('POST /api/webhooks/:id/test', () => {
  let merchantAToken: string
  let merchantBToken: string
  let adminToken: string
  let merchantASubscriptionId: string
  let merchantBSubscriptionId: string
  let globalSubscriptionId: string
  
  beforeEach(async () => {
    // Generate test tokens
    merchantAToken = generateTestToken({ merchantId: 'mch_a', isAdmin: false })
    merchantBToken = generateTestToken({ merchantId: 'mch_b', isAdmin: false })
    adminToken = generateTestToken({ merchantId: 'mch_admin', isAdmin: true })
    
    // Create test subscriptions
    merchantASubscriptionId = await createTestSubscription({ merchantId: 'mch_a', url: 'https://merchant-a.com/webhook' })
    merchantBSubscriptionId = await createTestSubscription({ merchantId: 'mch_b', url: 'https://merchant-b.com/webhook' })
    globalSubscriptionId = await createTestSubscription({ merchantId: null, url: 'https://global-system.com/webhook' })
  })
  
  it('returns 403 when merchant A tries to test merchant B webhook', async () => {
    const response = await request(app)
      .post(`/api/webhooks/${merchantBSubscriptionId}/test`)
      .set('Authorization', `Bearer ${merchantAToken}`)
      .expect(403)
    
    expect(response.body.error).toBe('Forbidden')
    expect(response.body.message).toContain('another merchant')
    
    // Verify lastTestedAt was NOT updated
    const subscription = await prisma.webhookSubscription.findUnique({
      where: { id: merchantBSubscriptionId },
    })
    expect(subscription.lastTestedAt).toBeNull()
  })
  
  it('allows merchant A to test their own webhook', async () => {
    const response = await request(app)
      .post(`/api/webhooks/${merchantASubscriptionId}/test`)
      .set('Authorization', `Bearer ${merchantAToken}`)
      .expect(200)
    
    expect(response.body.success).toBe(true)
    
    // Verify lastTestedAt was updated
    const subscription = await prisma.webhookSubscription.findUnique({
      where: { id: merchantASubscriptionId },
    })
    expect(subscription.lastTestedAt).not.toBeNull()
    expect(subscription.lastTestStatus).toBe('success')
  })
  
  it('returns 403 when non-admin tries to test global webhook', async () => {
    const response = await request(app)
      .post(`/api/webhooks/${globalSubscriptionId}/test`)
      .set('Authorization', `Bearer ${merchantAToken}`)
      .expect(403)
    
    expect(response.body.error).toBe('Forbidden')
    expect(response.body.message).toContain('Only admins')
  })
  
  it('allows admin to test global webhook', async () => {
    const response = await request(app)
      .post(`/api/webhooks/${globalSubscriptionId}/test`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    
    expect(response.body.success).toBeDefined()
  })
  
  it('allows admin to test any merchant webhook', async () => {
    const response = await request(app)
      .post(`/api/webhooks/${merchantBSubscriptionId}/test`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    
    expect(response.body.success).toBeDefined()
  })
  
  it('returns 404 for non-existent webhook subscription', async () => {
    const response = await request(app)
      .post('/api/webhooks/non_existent_id/test')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .expect(404)
    
    expect(response.body.error).toBe('Webhook subscription not found')
  })
})
```

#### 4. **Integration Test**
```typescript
// services/indexer/src/webhooks.integration.test.ts (ADD TEST)

import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from './index'

describe('Webhook Test Authorization - Integration', () => {
  it('prevents cross-merchant webhook status poisoning', async () => {
    // Merchant A creates a webhook
    const merchantAToken = await createTestMerchantAndToken('merchant-a')
    const createResponse = await request(app)
      .post('/api/subscriptions')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .send({
        url: 'https://merchant-a.example.com/webhook',
        events: ['settlement.completed'],
      })
      .expect(201)
    
    const subscriptionId = createResponse.body.id
    
    // Merchant B tries to test Merchant A's webhook (attack)
    const merchantBToken = await createTestMerchantAndToken('merchant-b')
    const attackResponse = await request(app)
      .post(`/api/webhooks/${subscriptionId}/test`)
      .set('Authorization', `Bearer ${merchantBToken}`)
      .expect(403)
    
    expect(attackResponse.body.message).toContain('another merchant')
    
    // Verify Merchant A's webhook status was NOT poisoned
    const statusResponse = await request(app)
      .get(`/api/subscriptions/${subscriptionId}`)
      .set('Authorization', `Bearer ${merchantAToken}`)
      .expect(200)
    
    expect(statusResponse.body.lastTestedAt).toBeNull()
    expect(statusResponse.body.lastTestStatus).toBeNull()
  })
})
```

### Acceptance Criteria
- ✅ Cross-merchant test returns 403 and does not mutate `lastTestedAt`
- ✅ Own subscription test succeeds and updates status
- ✅ Global subscription test requires admin role
- ✅ Admin can test any webhook
- ✅ All authorization tests pass

---

## Environment Variables

No new environment variables required. All fixes use existing infrastructure.

## Testing Matrix

| Issue | Unit Tests | Integration Tests | Security Tests |
|-------|-----------|-------------------|----------------|
| #607 | ✅ Header validation (CRLF, disallowed headers) | ✅ API endpoint rejection | ✅ Injection attack prevention |
| #608 | ✅ Payload serialization | ✅ Webhook delivery | ✅ Information disclosure check |
| #611 | ✅ Concurrent consume (10 parallel) | ✅ End-to-end verification | ✅ Race condition prevention |
| #624 | ✅ Authorization logic | ✅ Cross-merchant attack prevention | ✅ Privilege escalation check |

## Deployment Checklist

- [ ] All unit tests passing (100% coverage on new code)
- [ ] Integration tests passing
- [ ] Security tests passing (injection, auth bypass)
- [ ] Documentation updated (`INDEXER_AND_WEBHOOKS.md`)
- [ ] Migration guide created (`MIGRATION_V2.md`)
- [ ] Redis 6.2+ verified in production (for `GETDEL`)
- [ ] JWT middleware configured with `JWT_SECRET`
- [ ] PR created and linked to issues #607, #608, #611, #624

## Security Considerations

### Issue #607: CRLF Injection
- **Impact:** Critical - HTTP response splitting, XSS via headers
- **Mitigation:** RFC 7230 validation, CRLF rejection, header allowlist
- **Defense in Depth:** Validation at API entry, storage, and delivery

### Issue #608: Information Disclosure
- **Impact:** Medium - Infrastructure topology leak
- **Mitigation:** Remove internal URLs from public payloads
- **Breaking Change:** Yes - requires migration guide

### Issue #611: Race Condition
- **Impact:** High - Replay attacks via double-consume
- **Mitigation:** Atomic `GETDEL` operation
- **Requirement:** Redis 6.2+ (released April 2021)

### Issue #624: Authorization Bypass
- **Impact:** Critical - Cross-merchant data manipulation
- **Mitigation:** Merchant ID verification, admin-only global access
- **Defense in Depth:** JWT validation + resource ownership check

## Rollback Plan

All fixes are additive (validation, authorization checks). Rollback is straightforward:

1. **Immediate Rollback:** Revert commit, redeploy previous version
2. **Data Impact:** No database schema changes, no migration needed
3. **Redis:** `GETDEL` is backward compatible (no special rollback needed)

## Performance Considerations

- **Header Validation:** O(n) where n = number of headers (max 50)
- **Payload Serialization:** Removing `webhookUrl` reduces payload size by ~100 bytes
- **Redis GETDEL:** Single round-trip, faster than Lua script
- **Authorization Check:** Single DB query (already cached in most cases)

---

**Implementation Status:** ✅ Specification Complete  
**Next Steps:** Implement code changes, run test suite, create PR
