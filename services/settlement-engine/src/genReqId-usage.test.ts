import test from 'tape';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Settlement Engine imports and uses shared registerRequestId plugin', (t) => {
  const indexPath = path.resolve(__dirname, './index.ts');
  const content = fs.readFileSync(indexPath, 'utf-8');
  
  t.ok(content.includes('registerRequestId'), 'index.ts should reference registerRequestId');
  t.match(content, /import\s+{[^}]*registerRequestId[^}]*}\s+from\s+['"]@bettapay\/validation['"]/s, 'index.ts should import registerRequestId from @bettapay/validation');
  t.match(content, /registerRequestId\(fastify\)/s, 'index.ts should call registerRequestId(fastify)');
  t.end();
});

test('Settlement Engine configures BullMQ Redis retry options', (t) => {
  const indexPath = path.resolve(__dirname, './index.ts');
  const content = fs.readFileSync(indexPath, 'utf-8');

  t.match(content, /maxRetriesPerRequest:\s*env\.REDIS_MAX_RETRIES/s, 'BullMQ max retries should come from REDIS_MAX_RETRIES');
  t.match(content, /enableReadyCheck:\s*false/s, 'BullMQ should disable Redis ready checks for compatibility');
  t.match(content, /retryStrategy:\s*\(times:\s*number\)/s, 'BullMQ should configure an explicit retryStrategy');
  t.match(content, /Math\.min\(times \* 1000,\s*30000\)/s, 'retryStrategy should cap reconnect delay');
  t.end();
});
