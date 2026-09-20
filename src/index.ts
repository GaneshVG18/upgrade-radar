export { analyzeUpgrade, dryRunPlan, mergeReports } from "./analyze.js";
export { analyzeUsageSites } from "./adapters/index.js";
export { parseNotes } from "./notes/parser.js";
export { BaselineProvider } from "./providers/baseline.js";
export { JevProvider } from "./providers/jev.js";
export { renderHtml, renderMarkdown, validateReport, writeReport } from "./report/render.js";
export type * from "./types.js";
