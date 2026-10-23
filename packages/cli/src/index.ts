#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { WorkspaceClient } from '../../sdk/src/index.js';
import type { Operation } from '../../core/src/types.js';
const [command, wid, arg] = process.argv.slice(2);
const help = `AI File Manager CLI

Environment: AFM_URL (default http://127.0.0.1:7310), AFM_TOKEN
Commands:
  me
  workspaces                         Operator only
  documents <workspace>
  read <workspace> <virtual-path>
  history <workspace> <virtual-path>
  changes <workspace>
  propose <workspace> <local-json-file>
  tasks <workspace>

Proposal JSON: {"title":"Update notes","operations":[{"path":"/notes.md","baseRevision":null,"content":"Draft"}]}
`;
if (!command || command === 'help' || command === '--help') {
  console.log(help);
  process.exit(0);
}
try {
  const token = process.env.AFM_TOKEN;
  if (!token) throw new Error('Set AFM_TOKEN to an operator or scoped agent token.');
  const c = new WorkspaceClient({ baseUrl: process.env.AFM_URL ?? 'http://127.0.0.1:7310', token });
  let result: unknown;
  if (command === 'me') result = await c.me();
  else if (command === 'workspaces') result = await c.workspaces();
  else {
    if (!wid) throw new Error('A workspace ID is required.');
    switch (command) {
      case 'documents':
        result = await c.documents(wid);
        break;
      case 'read':
        if (!arg) throw new Error('A virtual path is required.');
        result = await c.read(wid, arg);
        break;
      case 'history':
        if (!arg) throw new Error('A virtual path is required.');
        result = await c.history(wid, arg);
        break;
      case 'changes':
        result = await c.changes(wid);
        break;
      case 'tasks':
        result = await c.tasks(wid);
        break;
      case 'propose': {
        if (!arg) throw new Error('A proposal JSON file is required.');
        const input = JSON.parse(await readFile(arg, 'utf8')) as {
          title: string;
          operations: Operation[];
        };
        result = await c.propose(wid, input.title, input.operations);
        break;
      }
      default:
        throw new Error('Unknown command. Run with --help.');
    }
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Command failed.');
  process.exitCode = 1;
}
