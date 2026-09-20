---
package: express
from: 4.21.2
to: 5.1.0
source: https://expressjs.com/en/guide/migrating-5.html
retrieved: 2026-09-20
---

# express-req-param-removed

Family: express-req-param-removed

Express 5 removes `req.param(name)`; callers must read the intended route, body, or query parameter source explicitly.
