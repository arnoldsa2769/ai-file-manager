# Security

## Supported scope

Version 0.1 is a local development alpha. There is no production security support commitment or guaranteed response time. Use synthetic or low-risk data while evaluating it. Do not expose the service to the public internet.

## Reporting a vulnerability

If GitHub offers **Security > Report a vulnerability**, use that private channel. Otherwise, open an issue requesting a private reporting channel without including exploit details, document contents, tokens, personal data, or reproduction secrets. Wait for a maintainer-provided private channel before disclosing sensitive details.

## Current boundaries

- Agent tokens are random and stored only as SHA-256 digests. Operator credentials remain in private local configuration.
- Requests use bearer authentication, default-deny document policies, and explicit browser origin checks.
- The browser's operator token is session-scoped; any successful same-origin script injection could still steal it. Documents are rendered as text, not executable HTML.
- SQLite storage and backups contain plaintext documents. Owner-only filesystem modes reduce accidental local disclosure; they do not encrypt data or protect against the host administrator.
- No operating-system sandbox is provided. External agent processes can still use authority obtained outside this application.
- Request bodies and credentials are not logged. Activity covers successful mutations, not a complete record of denied reads or all access attempts.

See [the threat model](docs/threat-model.md) for assumptions, mitigations, residual risks, and deployment prerequisites.
