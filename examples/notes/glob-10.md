---
package: glob
from: 8.1.0
to: 10.4.5
source: https://github.com/isaacs/node-glob/blob/main/changelog.md
retrieved: 2026-09-20
---

# Glob 10 reviewed migration notes

Family: glob-default-export-removed

Glob 9 replaced the callback-oriented API with a Promise-oriented API and changed exported function names. Glob 10 removed the default export entirely, so code that calls the imported or required package root as the glob function needs review and migration to the named API.
