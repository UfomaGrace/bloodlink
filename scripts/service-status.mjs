// Which contract paths does the service repo implement yet?
//   npm run service:status   (needs ../bloodlink-service cloned next to this repo)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SERVICE = process.argv[2] ?? "../bloodlink-service/src/main";

const contract = readFileSync("contract/openapi.yaml", "utf8");
const paths = [...contract.matchAll(/^ {2}(\/[^:\s]*):\s*$/gm)].map((m) => m[1]);

function javaFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? javaFiles(p) : p.endsWith(".java") ? [p] : [];
  });
}
const code = javaFiles(SERVICE).map((f) => readFileSync(f, "utf8")).join("\n");
const mapped = [...code.matchAll(/@(?:Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(?:value\s*=\s*|path\s*=\s*)?"([^"]+)"/g)]
  .map((m) => m[1].replace(/\{[^}]+\}/g, "{}"));

let missing = 0;
for (const path of paths) {
  const shape = path.replace(/\{[^}]+\}/g, "{}");
  const live = mapped.includes(shape) || path.startsWith("/actuator/");
  if (!live) missing++;
  console.log(`${live ? "built  " : "MISSING"}  ${path}`);
}
console.log(`\n${paths.length - missing} of ${paths.length} contract paths have a handler in the service repo.`);