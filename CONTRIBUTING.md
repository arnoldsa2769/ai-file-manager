# Contributing

AI File Manager is an early research and development project focused on explicit boundaries between collaborating AI agents.

## Before proposing a feature

Describe the concrete collaboration problem, affected trust boundary, expected API behavior, and recovery path. Discuss changes to identity, permissions, storage, or protocol compatibility in an issue before implementation.

## Local development

Use Node.js >=22.13. Run `npm ci`, `npm run setup`, and `npm run dev`. Demo data is optional and synthetic. Never submit `.env`, database files, real documents, agent credentials, or provider API keys.

Keep policy decisions in `packages/core`; transports and UI are consumers. Write meaningful regression tests for authorization failures, data loss, revision conflicts, and cross-domain leakage. Tests should exercise real SQLite and HTTP behavior where practical.

## Pull requests

1. Create a focused branch and explain the user-visible behavior.
2. Add a failing behavioral test for new domain behavior or a bug, then implement it.
3. Run `npm run format`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run language-check`.
4. Run browser tests when changing the console or its workflows.
5. Document API changes and update an architectural decision record when changing a trust boundary.
6. Describe validation and remaining limitations in English.

All repository-authored documentation, comments, examples, UI copy, issue templates, and commit messages must be English. The language check catches CJK text; it is not a substitute for editorial review of other languages. Valid user document content is not restricted to English.

Submit only content you have the right to contribute. Unless explicitly stated otherwise, contributions are provided under the project's MIT license. Keep discussion respectful and focused on reproducible behavior.
