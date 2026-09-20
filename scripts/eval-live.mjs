import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { analyzeUpgrade } from "../dist/analyze.js";
import { JevProvider } from "../dist/providers/jev.js";

const { values } = parseArgs({ args: process.argv.slice(2), options: { output: { type: "string" } } });
if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.error("eval:live requires TYPESAFE_API_KEY; no mock fallback is used");
  process.exit(69);
}
const output = path.resolve(values.output ?? ".private-evals/run");
mkdirSync(output, { recursive: true });
const provider = new JevProvider();
const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const runs = [];
for (const spec of [
  ["express-app", "express", "4.21.2", "5.1.0", "express-5.md"],
  ["zod-app", "zod", "3.25.76", "4.1.5", "zod-4.md"]
]) {
  const [repoName, packageName, from, to, note] = spec;
  const result = await analyzeUpgrade({
    repo: path.join(projectRoot, "examples", repoName),
    upgrade: { package: packageName, from, to },
    notesPath: path.join(projectRoot, "examples", "notes", note),
    provider,
    runMode: "jev"
  });
  runs.push(result.report);
}
writeFileSync(path.join(output, "reports.private.json"), `${JSON.stringify(runs, null, 2)}\n`);
console.log(`private live evaluation written under ${output}`);
