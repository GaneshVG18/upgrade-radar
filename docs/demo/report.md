# Upgrade Radar report

Run mode: **illustrative_fixture**
Source revision: `authored-demo-fixtures`
Complete: **yes**

## Upgrade

- `express` 4.21.2 → 5.1.0
- `zod` 3.25.76 → 4.1.5

## Review queue

### review: express-query-parser-default

Express 5 changes the default query parser; this handler reads a nested query object without an explicit extended-parser setting.

- Code: `examples/express-app/src/app.ts:6-6` (code-31faee0c39535981)
- Note: `examples/notes/express-5.md:13-13` (note-e682097c6bad5495)
- Reasons: authored_fixture_decision, executable_compatibility_fixture_confirms_old_new_output_difference

### no_direct_evidence: express-query-parser-default

This control app explicitly selects the extended query parser, preserving the nested query shape covered by the note.

- Code: `examples/express-app/src/app.ts:23-23` (code-4be7d03d5aa611bd)
- Note: `examples/notes/express-5.md:13-13` (note-e682097c6bad5495)
- Reasons: authored_fixture_decision, explicit_extended_query_parser_control

### review: zod-optional-default

Zod 4 applies a default inside an optional object field; this schema uses that exact shape and changes parsed output.

- Code: `examples/zod-app/src/schema.ts:4-4` (code-3a649c7a8770b9b4)
- Note: `examples/notes/zod-4.md:13-13` (note-c5487bae107275c9)
- Reasons: authored_fixture_decision, executable_compatibility_fixture_confirms_old_new_output_difference

## Coverage limitations

- illustrative_fixture_decisions_are_authored_and_do_not_measure_jev_accuracy
- bounded_static_analysis_no_full_program_dataflow_or_call_graph
- computed_imports_dynamic_requires_and_unresolved_wrappers_are_not_followed

This report is advisory. A negative row is only about the evaluated note/site pair and is not an upgrade compatibility guarantee.
