## Environment-Aware Validation

Some validation rules are relaxed in development to reduce friction,
and strictly enforced in production for security.

### How It Works

Pass `NODE_ENV` to schema factories, or let them read `process.env.NODE_ENV` automatically.

| Schema          | Rule                        | Production | Development |
|-----------------|-----------------------------|------------|-------------|
| Webhook URL     | HTTPS required              | ✅ enforced | ❌ relaxed  |
| CORS Origins    | No wildcard (*)             | ✅ enforced | ❌ relaxed  |
| CORS Origins    | HTTPS required              | ✅ enforced | ❌ relaxed  |

### Usage

```typescript
import { createWebhookUrlSchema } from '@bettapay/validation';

const schema = createWebhookUrlSchema(process.env.NODE_ENV);
schema.parse('http://localhost:3000/hook'); // ✅ passes in development
```
