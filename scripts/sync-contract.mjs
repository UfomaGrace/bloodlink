// Copies the API contract from the service repository and regenerates the TypeScript types.
//
//   npm run contract:sync    download contract/openapi.yaml and regenerate src/api/schema.d.ts
//   npm run contract:check   fail (exit 1) if our copy differs from the service repository's main
//
// Never edit contract/openapi.yaml here. Ask for the change in the service repository,
// where it is logged in docs/decisions.md with both names, then run contract:sync.
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const { url, file, types } = pkg.contract ?? {};
if (!url || !file || !types) {
  console.error('package.json needs "contract": { "url", "file", "types" }');
  process.exit(1);
}

const checkOnly = process.argv.includes('--check');

const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
if (!res.ok) {
  console.error(`Could not download the contract (${res.status} ${res.statusText}) from ${url}`);
  process.exit(1);
}
const remote = (await res.text()).replace(/\r\n/g, '\n');

if (checkOnly) {
  let local = '';
  try {
    local = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  } catch {
    console.error(`${file} is missing. Run: npm run contract:sync`);
    process.exit(1);
  }
  if (local !== remote) {
    console.error(`${file} differs from the service repository's contract.`);
    console.error('Run "npm run contract:sync", commit both files, and check docs/decisions.md in the service repo.');
    process.exit(1);
  }
  console.log('Contract matches the service repository.');
  process.exit(0);
}

await writeFile(file, remote);
console.log(`Saved ${file}`);
execSync(`npx openapi-typescript ${file} -o ${types}`, { stdio: 'inherit' });
console.log(`Generated ${types}. Commit both files.`);
