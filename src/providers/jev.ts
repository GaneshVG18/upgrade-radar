import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Candidate, Disposition, Provider, ProviderPayload, SemanticAnswer } from "../types.js";
import { providerPayload } from "./baseline.js";

type ClientLike = Pick<TypeSafeClient, "systemOne">;

function finiteProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export class JevProvider implements Provider {
  readonly name = "jev" as const;
  private readonly client: ClientLike;
  private readonly model: string;

  constructor(options: { client?: ClientLike; model?: string } = {}) {
    this.model = options.model ?? "jev-latest";
    this.client = options.client ?? new TypeSafeClient({
      defaultModel: this.model,
      timeout: 8_000,
      logLevel: "off",
      retry: { maxRetries: 1, httpStatuses: new Set([408, 429, 500, 502, 503, 504]) }
    });
  }

  payload(candidate: Candidate): ProviderPayload { return providerPayload(candidate); }

  async judge(candidate: Candidate): Promise<{ disposition: Disposition; reasons: string[]; semantic?: SemanticAnswer }> {
    const payload = this.payload(candidate);
    const questions = {
      disposition: choice(
        "Assess only whether state.sourceExcerpt is relevant to state.note. Choose insufficient_evidence when required facts are absent.",
        {
          review: "The shown usage plausibly depends on the described changed behavior and deserves human review.",
          not_this_change: "The shown usage does not depend on this described change, based on the supplied evidence.",
          insufficient_evidence: "The supplied state lacks facts needed for either conclusion."
        }
      ),
      depends_on_behavior: noul("Does state.sourceExcerpt depend on the behavior described in state.note?"),
      preserves_old_behavior: noul("Does state.visibleConfiguration explicitly preserve the old behavior described by state.note?"),
      missing_required_facts: noul("Are facts required to judge this note/source relationship missing from state?")
    } as const;
    const result = await this.client.systemOne({ state: payload.state, questions, model: this.model }, { timeout: 8_000, retry: { maxRetries: 1 } });
    const selected = result.answers.disposition;
    const depends = result.answers.depends_on_behavior.noul;
    const preserves = result.answers.preserves_old_behavior.noul;
    const missing = result.answers.missing_required_facts.noul;
    const probs = selected.probabilities;
    const numeric = [selected.confidence, depends, preserves, missing, ...Object.values(probs)];
    if (!numeric.every(finiteProbability)) throw new Error("Malformed Jev probability response");

    const semantic: SemanticAnswer = {
      model: result.model,
      disposition: selected.choice,
      dispositionProbabilities: { ...probs },
      confidence: selected.confidence,
      dependsOnBehavior: depends,
      preservesOldBehavior: preserves,
      missingRequiredFacts: missing
    };

    if (selected.choice === "insufficient_evidence" || missing >= 0.5) {
      return { disposition: "unknown", reasons: ["jev_reports_missing_required_facts"], semantic };
    }
    if (preserves >= 0.5) {
      return { disposition: "no_direct_evidence", reasons: ["jev_explicit_configuration_preserves_old_behavior"], semantic };
    }
    if (selected.choice === "review" && depends >= 0.5 && preserves < 0.5) {
      return { disposition: "review", reasons: ["jev_relevance_judgment_with_host_policy_v2"], semantic };
    }
    if (selected.choice === "not_this_change" && depends < 0.5) {
      return { disposition: "no_direct_evidence", reasons: ["jev_negative_pair_judgment_with_host_policy_v2"], semantic };
    }
    return { disposition: "unknown", reasons: ["jev_answers_are_contradictory_or_policy_boundary_is_ambiguous"], semantic };
  }
}
