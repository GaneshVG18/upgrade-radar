import type { Candidate } from "../types.js";
import { sha256 } from "../core/util.js";

export const JEV_POLICY_VERSION = "jev-policy/v2";
export const JEV_QUESTION_VERSION = "jev-questions/v1";

export function providerCacheKey(candidate: Candidate, resolvedModel: string | undefined): string | undefined {
  if (!resolvedModel) return undefined;
  return sha256(JSON.stringify({
    policy: JEV_POLICY_VERSION,
    questions: JEV_QUESTION_VERSION,
    model: resolvedModel,
    package: candidate.upgrade.package,
    from: candidate.upgrade.from,
    to: candidate.upgrade.to,
    noteSourceHash: candidate.note.span.sourceHash,
    noteSpanHash: candidate.note.span.spanHash,
    codeSourceHash: candidate.usage.span.sourceHash,
    codeSpanHash: candidate.usage.span.spanHash,
    symbol: candidate.usage.symbol,
    configuration: candidate.usage.configuration
  }));
}
