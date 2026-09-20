# Upgrade Radar report

Run mode: **Illustrative fixture**
Source revision: `authored-demo-fixtures`
Complete: **yes**

## Upgrade

- `express` 4.21.2 → 5.1.0
- `zod` 3.25.76 → 4.1.5

## Review queue

### Needs review: Query parser default

Express 5 changes the default query parser; this handler reads a nested query object without an explicit extended-parser setting.

- Code: `examples/express-app/src/app.ts:6-6` (code-31faee0c39535981)
- Note: `examples/notes/express-5.md:13-13` (note-e682097c6bad5495)
- Reasons: Authored fixture decision, Executable fixture confirms the old/new output difference

### No direct evidence: Query parser default

This control app explicitly selects the extended query parser, preserving the nested query shape covered by the note.

- Code: `examples/express-app/src/app.ts:23-23` (code-4be7d03d5aa611bd)
- Note: `examples/notes/express-5.md:13-13` (note-e682097c6bad5495)
- Reasons: Authored fixture decision, Explicit extended query parser preserves the reviewed behavior

### Needs review: Optional field defaults

Zod 4 applies a default inside an optional object field; this schema uses that exact shape and changes parsed output.

- Code: `examples/zod-app/src/schema.ts:4-4` (code-3a649c7a8770b9b4)
- Note: `examples/notes/zod-4.md:13-13` (note-c5487bae107275c9)
- Reasons: Authored fixture decision, Executable fixture confirms the old/new output difference

## Coverage limitations

- Illustrative decisions are authored and do not measure Jev accuracy
- Analysis is bounded and does not perform full-program dataflow or call-graph tracing
- Computed imports, dynamic requires, and unresolved wrappers are not followed

This report is advisory. A no-direct-evidence row applies only to one note/site pair and does not mean an upgrade is safe to merge.
