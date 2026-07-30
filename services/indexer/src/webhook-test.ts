import type { WebhookTestPayload, WebhookTestResult } from '@bettapay/validation';

export interface WebhookTestSubscription {
  id: string;
  url: string;
}

interface SendWebhookTestOptions {
  fetchFn?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
}

const DEFAULT_WEBHOOK_TEST_TIMEOUT_MS = 5000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'Request timed out' : error.message;
  }
  return String(error);
}

export async function sendWebhookTest(
  subscription: WebhookTestSubscription,
  options: SendWebhookTestOptions = {}
): Promise<WebhookTestResult> {
  const testedAt = options.now ?? new Date();
  const payload: WebhookTestPayload = {
    type: 'test',
    timestamp: testedAt.toISOString(),
    subscriptionId: subscription.id,
    test: true,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_WEBHOOK_TEST_TIMEOUT_MS
  );

  try {
    const response = await (options.fetchFn ?? fetch)(subscription.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.ok) {
      return { success: true, statusCode: response.status };
    }

    return {
      success: false,
      statusCode: response.status,
      error: 'HTTP ' + response.status,
    };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}
