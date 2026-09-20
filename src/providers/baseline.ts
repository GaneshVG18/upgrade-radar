import type { Candidate, Disposition, Provider, ProviderPayload } from "../types.js";
import { redactSecrets, truncate } from "../core/util.js";

export function providerPayload(candidate: Candidate): ProviderPayload {
  const note = truncate(redactSecrets(candidate.note.text), 1800);
  const sourceExcerpt = truncate(redactSecrets(candidate.usage.span.excerpt), 1800);
  const missingFacts = [...candidate.usage.missingFacts];
  if (note.truncated) missingFacts.push("provider_note_excerpt_truncated");
  if (sourceExcerpt.truncated) missingFacts.push("provider_source_excerpt_truncated");
  return {
    state: {
      package: candidate.upgrade.package,
      from: candidate.upgrade.from,
      to: candidate.upgrade.to,
      note: note.value,
      noteContext: candidate.note.heading,
      noteFamily: candidate.note.family,
      sourceExcerpt: sourceExcerpt.value,
      resolvedSymbol: candidate.usage.symbol,
      visibleConfiguration: candidate.usage.configuration,
      missingFacts: [...new Set(missingFacts)]
    }
  };
}

export function deterministicDecision(candidate: Candidate): { disposition: Disposition; reasons: string[] } {
  if (candidate.usage.missingFacts.length > 0) {
    return { disposition: "unknown", reasons: [...candidate.usage.missingFacts] };
  }
  if (candidate.note.family === "express-query-parser-default" && candidate.usage.configuration.queryParser === "extended") {
    return { disposition: "no_direct_evidence", reasons: ["visible_query_parser_configuration_preserves_extended_parsing"] };
  }
  if (candidate.note.family === candidate.usage.family || candidate.note.family === "generic") {
    return { disposition: "review", reasons: ["deterministic_family_and_resolved_package_usage_match"] };
  }
  return { disposition: "no_direct_evidence", reasons: ["resolved_usage_does_not_match_change_family"] };
}

export class BaselineProvider implements Provider {
  readonly name = "baseline" as const;
  payload(candidate: Candidate): ProviderPayload { return providerPayload(candidate); }
  async judge(candidate: Candidate): Promise<{ disposition: Disposition; reasons: string[] }> {
    return deterministicDecision(candidate);
  }
}
