Current behavior:
CI runs Prisma generate but does not validate migration consistency.

Expected behavior:
Add CI step: pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma and pnpm exec prisma validate. Fail CI if either fails.

Files to modify:

.github/workflows/ci.yml — add steps
Test requirements:
N/A — CI configuration change. Verify pipeline passes.

Acceptance criteria:

CI catches schema drift and invalid schema files.