// Reproducible evidence for the Express 4 -> 5 default query-parser change.
//
// Boots the two pinned Express versions in-process on the loopback interface,
// sends one identical nested query string to each, and asserts exactly what
// `req.query.filters` becomes. The third case is the control: Express 5 with
// the extended parser selected explicitly.
//
// Run: npm run evidence:query-parser
// Pinned by devDependencies: express4 = express@4.21.2, express5 = express@5.1.0
//
// This measures library behavior only. It does not exercise an application
// test suite and makes no claim about what a given application does with the
// resulting value.

import assert from "node:assert/strict";
import e4 from "express4";
import e5 from "express5";

const PATH = "/products?filters[color]=red&filters[size]=L";
const EXPECTED_V4 = { color: "red", size: "L" };

const listen = (app) => new Promise((resolve, reject) => {
  const server = app.listen(0, "127.0.0.1", () => resolve(server));
  server.on("error", reject);
});

async function probe(label, makeApp) {
  const app = makeApp();
  app.get("/products", (req, res) => res.json({ filters: req.query.filters, query: req.query }));
  let server;
  try {
    server = await listen(app);
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${PATH}`);
    assert.equal(response.status, 200, `${label}: expected HTTP 200`);
    const body = await response.json();
    console.log(`\n${label}`);
    console.log(`  req.query          = ${JSON.stringify(body.query)}`);
    console.log(`  req.query.filters  = ${JSON.stringify(body.filters)}`);
    console.log(`  typeof filters     = ${body.filters === undefined ? "undefined" : typeof body.filters}`);
    return body;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

console.log(`Request path: ${PATH}`);

const four = await probe("Express 4.21.2 - default query parser", () => e4());
const five = await probe("Express 5.1.0 - default query parser", () => e5());
const control = await probe("Express 5.1.0 - app.set('query parser', 'extended')  [CONTROL]", () => {
  const app = e5();
  app.set("query parser", "extended");
  return app;
});

console.log("\n--- assertions ---");

assert.deepEqual(four.filters, EXPECTED_V4,
  `express@4.21.2 should parse nested filters into ${JSON.stringify(EXPECTED_V4)}`);
console.log(`  v4 req.query.filters deep-equals ${JSON.stringify(EXPECTED_V4)}`);

assert.equal(five.filters, undefined,
  "express@5.1.0 should leave req.query.filters undefined under the simple parser");
console.log("  v5 req.query.filters is undefined");

assert.deepEqual(five.query, { "filters[color]": "red", "filters[size]": "L" },
  "express@5.1.0 should keep the bracketed keys literal");
console.log("  v5 req.query keeps the bracketed keys literal");

assert.deepEqual(control.filters, EXPECTED_V4,
  "the extended parser should restore the express@4.21.2 result exactly");
console.log(`  control restores ${JSON.stringify(EXPECTED_V4)}`);

console.log("\nOK: all assertions hold against the pinned packages.");
