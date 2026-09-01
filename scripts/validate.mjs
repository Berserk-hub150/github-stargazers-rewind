import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const jsFiles = [
  'extension/background.js',
  'extension/content.js',
  'extension/popup.js',
];

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) {
  throw new Error('Expected Manifest V3');
}
if (!manifest.version || !manifest.name) {
  throw new Error('Manifest must include name and version');
}

const requiredFiles = [
  'extension/background.js',
  'extension/content.js',
  'extension/content.css',
  'extension/popup.html',
  'extension/popup.js',
  'extension/popup.css',
];

for (const file of requiredFiles) {
  await readFile(file);
}

console.log(`Validation passed: ${manifest.name} v${manifest.version}`);
