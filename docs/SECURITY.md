# Security & Trust

- Passwords: Node `scrypt`, per-password random salt.
- Sessions: random 256-bit tokens, only SHA-256 token hashes stored server-side, HttpOnly/SameSite cookies.
- Workspace authorization: authenticated workspace resolved from membership before private data queries.
- SSRF: HTTP(S) only, DNS lookup, private/loopback/link-local/metadata targets blocked, redirects re-validated.
- Rate limiting: PostgreSQL-backed counters for login, signup, onboarding, research and refresh endpoints.
- Secrets: environment-only provider keys. Integration endpoints/numbers are AES-256-GCM encrypted with `APP_SECRET`.
- Security headers: CSP, frame denial, no-sniff, restrictive referrer and permissions policy.
- Evidence trust: public source URLs are retained; blocked sources surface as errors rather than invented facts.
- Cross-workspace policy: no query should accept an object ID without also constraining by workspace, unless the object is reached through an already workspace-scoped record.

Before enterprise use add formal penetration testing, audit logs, key rotation, deletion/retention UI, DPA/privacy review, and jurisdiction-specific compliance review.
