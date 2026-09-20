---
package: express
from: 4.21.2
to: 5.1.0
source: https://expressjs.com/en/guide/migrating-5.html
retrieved: 2026-09-20
---

# Express 5 reviewed migration notes

Family: express-query-parser-default

Express 5 uses the simple query parser by default. Applications that rely on nested query-string objects should review `req.query` consumers or explicitly select the parser behavior they require.

Family: express-wildcard-named

Express 5 path syntax requires wildcard route parameters to be named. Legacy wildcard strings such as `/*` should be reviewed against the migration guide.

Family: express-app-del-removed

The legacy `app.del()` alias is removed in Express 5. Applications should use the normal DELETE route method.

Family: express-req-param-removed

The old `req.param(name)` helper is removed. Code must read the intended parameter source explicitly, such as route params, body, or query.
