// Reproducible evidence for the Express 4 -> 5 default query-parser change.
//
// Boots the two pinned Express versions in-process, sends one identical nested
// query string to each, and prints exactly what `req.query` becomes. The third
// case is the control: Express 5 with the extended parser selected explicitly.
//
// Run: npm run evidence:query-parser
// Pinned by devDependencies: express4 = express@4.21.2, express5 = express@5.1.0

import e4 from "express4";
import e5 from "express5";

const PATH = "/products?filters[color]=red&filters[size]=L";

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, () => resolve(server));
});

async function probe(label, makeApp) {
  const app = makeApp();
  app.get("/products", (req, res) => res.json({ filters: req.query.filters, query: req.query }));
  const server = await listen(app);
  const response = await fetch(`http://127.0.0.1:${server.address().port}${PATH}`);
  const body = await response.json();
  server.close();
  console.log(`\n${label}`);
  console.log(`  req.query          = ${JSON.stringify(body.query)}`);
  console.log(`  req.query.filters  = ${JSON.stringify(body.filters)}`);
  console.log(`  typeof filters     = ${body.filters === undefined ? "undefined" : typeof body.filters}`);
  return body;
}

console.log(`Request path: ${PATH}`);

const four = await probe("Express 4.21.2 — default query parser", () => e4());
const five = await probe("Express 5.1.0 — default query parser", () => e5());
const control = await probe("Express 5.1.0 — app.set('query parser', 'extended')  [CONTROL]", () => {
  const app = e5();
  app.set("query parser", "extended");
  return app;
});

const changed = JSON.stringify(four.filters) !== JSON.stringify(five.filters);
const restored = JSON.stringify(four.filters) === JSON.stringify(control.filters);

console.log("\n--- assertions ---");
console.log(`  default behavior changed between 4 and 5 : ${changed}`);
console.log(`  explicit extended parser restores v4     : ${restored}`);
if (!changed || !restored) {
  console.error("\nFAIL: pinned behavior does not match the documented change.");
  process.exit(1);
}
console.log("\nOK: both assertions hold against the pinned packages.");
