---
package: commander
from: 11.1.0
to: 12.1.0
source: https://github.com/tj/commander.js/blob/master/CHANGELOG.md
retrieved: 2026-09-20
---

# Commander 12 reviewed migration notes

Family: commander-commonjs-global-export-removed

Commander 12 removed the CommonJS default export of the global Command instance. CommonJS code that calls program methods directly on the value returned by `require("commander")` needs review and should use the named `program` export or another explicit Command instance.
