import { describe, expect, it } from "vitest";
import { JevProvider } from "../../src/providers/jev.js";
import { providerCacheKey } from "../../src/providers/cache.js";
import { sha256 } from "../../src/core/util.js";
import type { Candidate } from "../../src/types.js";

const candidate: Candidate = {
  id: "c1",
  upgrade: { package: "express", from: "4.21.2", to: "5.1.0" },
  note: { family: "express-query-parser-default", text: "default changed", span: { id: "n", kind: "note", path: "n.md", startLine: 1, endLine: 1, sourceHash: "nh", spanHash: sha256("default changed"), excerpt: "default changed" } },
  usage: { package: "express", family: "express-query-parser-default", symbol: "req.query", configuration: {}, missingFacts: [], span: { id: "s", kind: "code", path: "a.ts", startLine: 2, endLine: 2, sourceHash: "sh", spanHash: sha256("req.query"), excerpt: "req.query" } }
};

describe("Jev host policy", () => {
  it("turns malformed provider probabilities into an error instead of approval", async () => {
    const fake = { systemOne: async () => ({ model: "jev-test", usage: { input_tokens: 1, output_tokens: 1 }, answers: { disposition: { type: "choice", choice: "review", confidence: 2, probabilities: { review: 2, not_this_change: 0, insufficient_evidence: 0 } }, depends_on_behavior: { type: "noul", noul: 1 }, preserves_old_behavior: { type: "noul", noul: 0 }, missing_required_facts: { type: "noul", noul: 0 } } }) };
    const provider = new JevProvider({ client: fake as never, model: "jev-test" });
    await expect(provider.judge(candidate)).rejects.toThrow(/Malformed Jev probability/);
  });

  it("keeps contradictory answers unknown", async () => {
    const fake = { systemOne: async () => ({ model: "jev-test", usage: { input_tokens: 1, output_tokens: 1 }, answers: { disposition: { type: "choice", choice: "review", confidence: .8, probabilities: { review: .8, not_this_change: .1, insufficient_evidence: .1 } }, depends_on_behavior: { type: "noul", noul: .2 }, preserves_old_behavior: { type: "noul", noul: .1 }, missing_required_facts: { type: "noul", noul: .1 } } }) };
    const provider = new JevProvider({ client: fake as never, model: "jev-test" });
    expect((await provider.judge(candidate)).disposition).toBe("unknown");
  });

  it("invalidates cache keys on source, note, policy inputs and model; aliases without resolved model bypass", () => {
    const first = providerCacheKey(candidate, "jev-1.13.0");
    expect(first).toBeTruthy();
    expect(providerCacheKey(candidate, undefined)).toBeUndefined();
    expect(providerCacheKey({ ...candidate, usage: { ...candidate.usage, span: { ...candidate.usage.span, sourceHash: "changed" } } }, "jev-1.13.0")).not.toBe(first);
    expect(providerCacheKey(candidate, "jev-1.14.0")).not.toBe(first);
  });
});
