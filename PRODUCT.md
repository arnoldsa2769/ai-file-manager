# Product

## Purpose

AI File Manager is a developer-first control plane for multi-agent document workspaces. It makes access boundaries, proposed changes, approvals, and document history explicit.

## Audience

Developers integrating AI tools, agent framework authors, and technical workspace owners.

## Platform

Web administration console, local HTTP service, TypeScript SDK, CLI, and MCP stdio bridge. Local-first, single trusted operator in the first release.

## Primary workflow

Create a workspace, register agents, grant scoped capabilities, let agents propose edits, review exact changes, apply atomically, and inspect or restore document history.

## Constraints

All repository-authored text is English. MIT license. Real persistence and permission enforcement. No claims of operating-system isolation or production multi-tenancy. No invented usage metrics or testimonials.

## Product decisions

The owner delegated implementation and design details. Start with managed text documents in SQLite rather than arbitrary host directory access. Model inference remains in the connected agent, keeping the control plane provider-neutral. Provide a complete web console alongside developer integrations.

## Design assumptions

The operator values dense, legible review interfaces and explicit states over decorative dashboards. A calm engineering workbench with an ink sidebar, light document canvas, restrained teal actions, and monospace paths supports daily use. These are implementation decisions, not user-specified aesthetics.
