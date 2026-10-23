# Console Design System

## Direction and task

An engineering review workbench for a trusted local operator. The primary evidence is a path, a scoped identity, an exact proposal, and a revision chain. The interface prioritizes scanability and explicit state transitions.

## Visual system

Use an ink navigation rail, a light neutral document canvas, and restrained teal actions. Warning, approval, applied, revoked, and denied states use distinct text labels as well as color. Native system sans supports daily operational reading; monospace is reserved for paths, identifiers, code, and content snapshots.

Navigation remains stable across Overview, Documents, Agents, Permissions, Change sets, Tasks, and Activity. Desktop content uses a sidebar, contextual header, and workbench panels; mobile navigation becomes a horizontal strip and content panels stack. Tables scroll within their containers when necessary.

## Interaction rules

- Proposal, approval, and application are separate actions.
- Before/after snapshots use the proposal's base revisions, not mutable current content.
- History is tied to its document path; restore creates a proposal.
- New identities reveal a token once and start with no access.
- Errors stay visible and tell the operator what failed.
- Empty and loading states describe a real next action.
- Use semantic form labels, keyboard focus, native dialogs, and reduced-motion support.
- Never render document or review text as HTML.

## Scope

This file records the implemented console. It does not claim a complete enterprise design system, charting layer, dark theme, or standalone component library.
