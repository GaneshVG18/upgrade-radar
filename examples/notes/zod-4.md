---
package: zod
from: 3.25.76
to: 4.1.5
source: https://zod.dev/v4/changelog
retrieved: 2026-09-20
---

# Zod 4 reviewed migration notes

Family: zod-optional-default

Zod 4 applies defaults inside optional object fields, so parsing an object with the field omitted can now materialize the default value in the output.

Family: zod-default-short-circuit

Zod 4 defaults short-circuit parsing when the input is `undefined`; a default value is returned without passing through the earlier transform pipeline.

Family: zod-number-infinity

Zod 4 numeric validation rejects infinite values, changing the result for schemas that accepted `Infinity` under Zod 3.

Family: zod-record-one-arg

Zod 4 changes the `z.record()` API so the former one-argument value-schema form requires migration to the current key/value signature.
