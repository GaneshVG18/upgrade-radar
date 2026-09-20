---
package: glob
from: 8.1.0
to: 10.4.5
source: https://github.com/isaacs/node-glob/blob/main/changelog.md
retrieved: 2026-09-20
---

# glob-default-export-removed

Family: glob-default-export-removed

Glob 9 moved from callbacks to promises and changed exported function names; Glob 10 removed the default export, so code that calls the imported or required package root needs migration to a named API.
