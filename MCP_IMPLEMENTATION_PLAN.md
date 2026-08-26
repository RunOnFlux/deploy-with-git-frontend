# Orbit MCP implementation plan

## Working rules from the request

- Build this plan from the active Orbit UI implementation. Ignore any other MCP plans in the project.
- Implement the plan one step at a time, in the order below.
- Every implementation step must have tests that validate that step, and those tests must be run before moving on.
- Use simulated Firebase users, Flux authentication, Flux blockchain responses, repository providers, Stripe responses, and node responses when real email accounts or real app registrations are unavailable.
- Tests must exercise the production code and observable behavior. They must not replace the code under test with the expected answer, swallow failures, or assert only that mocks were called.
- After implementation, have another agent review the implementation.
- Have another agent review the tests specifically to ensure they are meaningful and cannot fake success.
- Run the relevant tests after every review-driven correction.
- At the end, have another agent perform a final completeness and security review so missing requirements are caught.
- Keep the MCP server stateless. Firebase, FluxCore, Flux, and the payment bridge remain the systems of record; do not introduce an Orbit database.

## Scope and invariants

The first production version exposes a stateless Streamable HTTP MCP endpoint for Firebase-authenticated Orbit users. It supports repository analysis, deployment validation and registration, Stripe checkout creation, deployment status, app discovery, logs, build triggers, and instance controls. Firebase SSO is the signing method. Browser-only SSP and ZelCore actions are not exposed.

Security invariants:

- Never trust a caller-supplied ZelID, `zelidauth`, app owner, node URL, node IP, management port, webhook secret, API key, price, or raw Flux specification.
- Derive Flux authentication from the verified Firebase bearer token for every request (an optional in-memory TTL cache may optimize this, but correctness cannot depend on it).
- Verify app ownership before every authenticated app read and every mutation.
- Resolve node targets and management credentials from the owned Flux specification and Flux location response.
- Redact Git credentials, Flux authentication, webhook secrets, API keys, database credentials, and Enterprise plaintext from all tool results and errors.
- Use explicit allowlists for repository providers, Flux endpoints, node actions, and Orbit management paths.
- Mutating tools must be annotated as non-read-only/destructive where appropriate and return deterministic operation handles (`appName` and Flux transaction hash).

## Step 1 — Establish server module boundaries and shared pure logic

Implementation:

- Add server-side module directories for auth, Flux/FluxCore clients, repository analysis, deployment orchestration, payment, management, and MCP registration.
- Extract or wrap pure plan, validation, specification, geolocation, and database-compose logic so browser and server behavior cannot drift.
- Introduce dependency injection for `fetch`, clock, random/port generation, and upstream base URLs so tests can simulate external systems.
- Ensure the production Docker image copies the new server/shared modules.

Validation:

- Unit-test plan normalization, app-name and port validation, deterministic spec construction with injected ports, credential redaction, database/Redis composition, and geolocation conversion.
- Assert server modules load under Node without `window`, `document`, React, relative browser URLs, or browser Firebase imports.
- Run the existing deployment and repository-intelligence tests to prove no UI regression.

## Step 2 — Firebase bearer authentication and request-scoped Flux sessions

Implementation:

- Verify Firebase ID token JWT signature and claims (`alg`, `kid`, issuer, audience, expiry, subject, and verified email where applicable) using Google's published Firebase signing keys and the configured project ID.
- Extract a strict bearer-token middleware independent of React/Firebase browser state.
- Implement request-scoped Flux authentication: fetch a login phrase, preserve the sticky Flux node header, call FluxCore `signInOrUp` with the Firebase token, and construct `zelidauth` internally.
- Keep any signing-key or Flux-session cache in memory with bounded TTL and size; no persistent storage.

Validation:

- Generate test RSA keys and signed JWTs; verify valid tokens and reject expired, wrong-audience, wrong-issuer, unverified-email, unknown-key, and malformed tokens.
- Simulate login-phrase and FluxCore responses; assert the derived ZelID/signature and sticky backend are correct.
- Assert no Firebase or Flux credential appears in thrown errors or serialized auth context.

## Step 3 — Stateless MCP transport and protocol shell

Implementation:

- Add the official MCP server SDK and mount a stateless Streamable HTTP handler at `/mcp` in the existing Express BFF.
- Add health/capability metadata and consistent MCP error mapping.
- Apply bearer authentication at the MCP boundary while leaving the existing UI routes operational.
- Register `list_plans` first as a read-only tool to validate the complete transport.

Validation:

- Use the official MCP client in integration tests to initialize, list tools, call `list_plans`, and reject missing/invalid authorization.
- Send independent requests without a session identifier and prove results do not depend on process session state.
- Build the production Docker image or equivalent production dependency install check to prove runtime modules are included.

## Step 4 — Read-only application and repository tools

Implementation:

- Add `analyze_repository`, `list_apps`, `get_app`, `get_deployment_status`, `get_instances`, `get_logs`, and `get_network_capacity`.
- Reuse the exact repository compatibility rules used by the UI, including root-level lowercase HTML fallback and Erlang/Elixir/Dart markers.
- Support public GitHub, GitLab, and Bitbucket repositories. Support private-repository analysis only through explicit secret input, never echoing it.
- Decrypt Enterprise specifications server-side only after ownership validation and redact outputs.

Validation:

- Simulate all three Git providers, pagination, private tokens, branches, subdirectories, monorepos, config imports, markers, and unrecognized repositories.
- Test static HTML plus Erlang, Elixir, and Dart samples through mocked provider responses.
- Test that another user's app, forged owner input, arbitrary nodes, and secret-bearing specifications cannot be returned.
- Test log truncation, ANSI cleanup, and credential redaction.

## Step 5 — Deployment validation and preview

Implementation:

- Add `validate_deployment` to normalize the requested plan/configuration, rerun repository analysis, validate app-name availability, generate ports, build the Flux specification, verify it with Flux, determine free eligibility from permanent messages, and calculate authoritative pricing when payment is required.
- Return a sanitized canonical request and preview; never return the signable specification when it contains secrets.
- Fail closed when eligibility or pricing cannot be verified.

Validation:

- Cover every plan, additional-app pricing, billing periods, custom resources, two-port restrictions, geolocation, custom domains, commands, environment variables, databases, Redis, Enterprise requirements, and name collisions.
- Prove the preview is based on upstream normalized specs and authoritative pricing, not caller-supplied prices.
- Prove repository credentials and generated secrets are absent from results and errors.

## Step 6 — Firebase-signed deployment registration and test installation

Implementation:

- Add `deploy_app`, accepting the same declarative input as validation plus explicit terms acceptance.
- Recompute all validation instead of trusting a previous preview.
- Upload contacts, build and verify the spec, encrypt Enterprise/private specs, sign through FluxCore `signMessage`, register through Flux, and run/collect the test-install stream.
- Return app name, registration transaction hash, sanitized test result/log tail, free/payment-required state, and the input needed for the separate checkout tool.
- Do not provide a bypass that silently ignores failed test installation; report failure while preserving the transaction handle.

Validation:

- Simulate success and failure at every upstream phase, including contacts being non-fatal, verification fallback behavior, encryption, signing, duplicate registration, malformed streaming output, and test-install failure.
- Assert terms are mandatory, registration is called once, timestamp/signature payloads match exactly, retries cannot accidentally execute twice within one call, and secrets are redacted.
- Assert a timeout after registration still returns or preserves the transaction hash in the error result.

## Step 7 — Stripe checkout and deployment monitoring

Implementation:

- Add `create_stripe_checkout`, deriving ZelID, price, plan, app name, and transaction association server-side.
- Allowlist success/cancel origins rather than accepting arbitrary redirect URLs.
- Add or complete `get_deployment_status` using Flux transaction/app specification and location endpoints.
- Use stable upstream idempotency material derived from Firebase UID, operation type, app name, and Flux transaction hash when the payment bridge supports it.

Validation:

- Simulate one-time and subscription checkouts, free deployments, invalid/zero prices, mismatched app/transaction ownership, bridge failures, and malicious redirect URLs.
- Assert caller-supplied prices and ZelIDs are ignored/rejected.
- Simulate blockchain pending, confirmed/installing, deployed, and timeout/error states without timers that make the suite slow.

## Step 8 — Logs, build triggers, and instance controls

Implementation:

- Add `trigger_build` and `control_instance` with an enum of supported actions: redeploy, hard-redeploy, restart, start, stop, pause, unpause, and remove.
- Resolve node targets from Flux locations and management ports/secrets from the owned app spec.
- Separate read-only log access from mutations and annotate destructive actions appropriately.
- Collect bounded progress output for streaming Flux node actions.

Validation:

- Prove ownership is checked before resolving or contacting a node.
- Reject arbitrary IP addresses, ports, URLs, paths, action names, and nodes not present in Flux locations.
- Assert webhook signatures are generated from the stored secret and that the secret never appears in output.
- Exercise every action and partial multi-node failure with simulated concatenated JSON streams.

## Step 9 — App updates and renewals

Implementation:

- Add constrained `update_app` inputs for domains, Orbit settings, environment variables, geolocation, and editable resources; do not accept arbitrary raw Flux specs.
- Preserve hidden settings, add-on components, and remaining subscription blocks; re-encrypt Enterprise apps and sign updates through Firebase SSO.
- Add `renew_app` for allowed extension periods, authoritative pricing, Flux update registration, and optional Stripe checkout continuation.

Validation:

- Prove maintenance updates do not extend expiry, renewal cannot exceed the one-year cap, fixed-plan resources cannot be modified, add-on minimum instances are preserved, and hidden credentials survive without being disclosed.
- Test zero-price updates, paid updates, signing failure, blockchain confirmation, and Stripe continuation.

## Step 10 — UI connection experience, documentation, and packaging

Implementation:

- Add an authenticated “Connect an agent” page that explains the stateless bearer-token connection, token lifetime, available tools, approvals, and reconnection.
- Add a server endpoint that exchanges a currently valid Firebase ID token for a short-lived signed Orbit MCP access token only if this improves client compatibility; keep it self-contained and short-lived.
- Document environment variables, supported MCP clients, security limitations, public/private repository behavior, and examples.
- Update Docker runtime dependencies, health checks, and versioning.

Validation:

- Test that unauthenticated users cannot mint connection credentials.
- Test token expiry and claim binding without relying on wall-clock sleeps.
- Run production build, targeted lint for new files, unit tests, MCP integration tests, and container smoke tests.

## Required reviews and completion gate

1. Implementation review by another agent after the functional steps are complete. Address findings and rerun affected tests.
2. Dedicated test-integrity review by another agent. The reviewer must look for mocks that replace the behavior under test, assertions that cannot fail for broken code, swallowed errors, untested negative paths, and false-positive integration tests. Address findings and deliberately mutate or fault-inject critical paths to prove tests fail.
3. Final review by another agent covering feature completeness, statelessness, ownership enforcement, secret handling, MCP schema/annotations, deployment/payment correctness, Docker packaging, and documentation.
4. Final local gate: existing tests, all new tests, targeted lint, production build, and MCP protocol smoke test must pass. Record any unrelated pre-existing global lint failures separately; do not hide them or claim a clean global lint result.

## Progress log

- [x] Step 1 implemented and validated — `node --test test/mcpCore.test.js test/deployService.test.js test/repoIntelligenceService.test.js`
- [x] Step 2 implemented and validated — `node --test test/mcpAuth.test.js test/mcpCore.test.js`
- [x] Step 3 implemented and validated — official client integration in `test/mcpTransport.test.js` (localhost binding requires sandbox escalation)
- [x] Step 4 implemented and validated — `test/mcpReadServices.test.js`, `test/mcpManagement.test.js`
- [x] Step 5 implemented and validated — `test/mcpDeployment.test.js`
- [x] Step 6 implemented and validated — `test/mcpDeployment.test.js`
- [x] Step 7 implemented and validated — `test/mcpPayment.test.js`, deployment-status tests
- [x] Step 8 implemented and validated — `test/mcpManagement.test.js`
- [x] Step 9 implemented and validated — `test/mcpUpdate.test.js`
- [x] Step 10 implemented and validated — `test/mcpConnection.test.js`, production build, Docker build/runtime import smoke test
- [x] Implementation review completed and findings resolved — fixed transaction/spec-bound pricing, Orbit-only ownership, complete credential redaction, terminal stream validation, management target/bounds checks, Origin checks, annotations, pagination, RAM units, token expiry, and transaction-handle preservation
- [x] Test-integrity review completed and findings resolved — expanded official-client registrations, error redaction, schema rejection, faulted streams/prices/checkouts, non-Orbit ownership, Enterprise re-encryption, all log paths, reserved IPs, pagination, and expired-token tests
- [x] Final completeness/security review completed and findings resolved — removed caller-controlled custom-plan pricing, constrained authenticated Bitbucket pagination, bounded install streams with final-state validation, protected fixed plans with add-ons, added stateless update/renewal checkout recovery, and proved ownership for pending deployment status
- [x] Final validation gate passed — 84 tests, targeted lint, production build/prerender, dependency lock dry-run, Docker rebuild, and in-container MCP runtime import smoke test

Validation notes:

- The complete suite passes 84 tests when run outside the restricted filesystem sandbox because the official MCP client integration test binds a temporary loopback port.
- Targeted lint for the new MCP/server/UI/test files passes except for the existing `react-refresh/only-export-components` warning in `src/App.jsx`; no targeted lint errors remain.
- `npm run build`, `docker build -t orbit-ui-mcp-test .`, and an MCP module import inside that image pass.
- `npm ci` reports 22 dependency audit findings (3 low, 2 moderate, 16 high, 1 critical). These are recorded for dependency triage and were not auto-fixed with potentially breaking upgrades.
- A production-only `npm audit --omit=dev` query after removing the unused MCP Express package reports 13 findings in existing Axios, Puppeteer, React Router, Firebase/transitive, and development-support dependency chains; none are attributed to the MCP SDK packages.
