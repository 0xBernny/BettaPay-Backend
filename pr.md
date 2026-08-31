# fix: enforce strong JWT_SECRET in production and prevent silent dev value fallback (#563)

Closes #563

## Summary

- **Production Startup Guard**: Modified the shared environment validation schema so that if the application starts up in a production environment (`NODE_ENV === "production"`), it refuses to boot and fails fast with a clear error message if `JWT_SECRET` is missing, set to a known development default, or is too weak.
- **Development/Test Compatibility**: Maintained compatibility for development and test environments so they can still boot and run test suites using simple or default keys.
- **JWT Strength Checks**: Implemented security requirements in production for `JWT_SECRET`:
  - Must not be one of the known development secrets (e.g., `super-secret-development-key-please-change`, `change-me-to-a-long-random-secret-before-production`).
  - Must not contain development placeholders (like `change-me`, `please-change`, or `development`).
  - Must contain at least 8 unique characters (preventing simple repeated patterns like `a.repeat(32)`).
  - Must contain a mix of uppercase letters, lowercase letters, and digits or special characters.
- **Unit Tests**: Added 6 tests to `shared/validation/validateEnv.test.ts` to assert all validation rules across environments.

## Files changed

**Shared Libraries:**
- [index.ts](file:///c:/Users/SHATTER/.vscode/BettaPay-Backend/shared/validation/index.ts) — replaced `EnvSchema.refine` with `EnvSchema.superRefine` incorporating the production environment check, default block list, placeholder checks, and complexity strength validator.
- [validateEnv.test.ts](file:///c:/Users/SHATTER/.vscode/BettaPay-Backend/shared/validation/validateEnv.test.ts) — added unit tests for production vs non-production validation behavior.

## Test Coverage

- ✅ Validation allows defaults/simple keys in `development` and `test` environments
- ✅ Validation fails in `production` for default/known development secrets
- ✅ Validation fails in `production` for placeholder-containing secrets
- ✅ Validation fails in `production` for secrets lacking 8 unique characters
- ✅ Validation fails in `production` for secrets lacking lowercase/uppercase/digits/special characters mix
- ✅ Validation succeeds in `production` for a strong, complex secret
