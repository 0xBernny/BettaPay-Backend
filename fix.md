Add event filtering to the events listing endpoint
Repo Avatar
Betta-Pay/BettaPay-Backend
Current behavior:
GET /api/events has no filters — clients must fetch all pages and filter client-side.

Expected behavior:
Add optional query parameters: type (exact), topic (contains in topics array), contractId (exact), fromLedger, toLedger (range). ALL combinable (AND). Add database index on (contractId, ledger DESC).

Files to modify:

services/indexer/src/index.ts — modify event listing query
shared/validation/schemas.ts
prisma/schema.prisma — add index (new migration)
Test requirements:

Filter by type — only that type returned.
Filter by topic — matching events returned.
Filter by ledger range — events in range.
All combined — AND logic.
No matches — empty result.
Acceptance criteria:

Events filterable by type, topic, contract, and ledger range.
Queries use index.