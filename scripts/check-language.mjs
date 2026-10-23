import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);
const failures = [];
for (const file of new Set(files)) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  } catch {
    continue;
  }
  if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(text)) failures.push(file);
}
if (failures.length) {
  console.error('Non-English CJK text found in repository files:\n' + failures.join('\n'));
  process.exitCode = 1;
} else console.log('Repository language check passed.');
