Add Redis connection error handling and reconnection
Repo Avatar
Betta-Pay/BettaPay-Backend
Description: The settlement-engine creates BullMQ connections using parsed Redis URL but has no error handling if Redis is unreachable at startup or disconnects during operation.

Requirements:

Add error event handlers on the BullMQ Queue and Worker
On connection failure, log the error and attempt reconnection
If Redis is unreachable at startup, retry with backoff instead of crashing
Add a retryStrategy to the Redis connection options
Suggested execution steps:

Add connection.on('error', ...) handlers for the queue and worker connections
Implement a retry strategy with max 10 attempts and exponential backoff
Log each reconnection attempt
Add maxRetriesPerRequest: 3 and retryStrategy: (times) => Math.min(times * 1000, 30000) to connection params
