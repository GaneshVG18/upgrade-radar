import { describe, expect, it } from "vitest";
import { JevProvider } from "../../src/providers/jev.js";
import { providerPayload } from "../../src/providers/baseline.js";
import { providerCacheKey } from "../../src/providers/cache.js";
import { sha256 } from "../../src/core/util.js";
import type { Candidate } from "../../src/types.js";

const candidate: Candidate = {
  id: "c1",
  upgrade: { package: "express", from: "4.21.2", to: "5.1.0" },
  note: { family: "express-query-parser-default", heading: "Query parser", text: "default changed", span: { id: "n", kind: "note", path: "n.md", startLine: 1, endLine: 1, sourceHash: "nh", spanHash: sha256("default changed"), excerpt: "default changed" } },
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

  it("uses deterministic visible configuration before calling Jev", async () => {
    const configured = {
      ...candidate,
      usage: { ...candidate.usage, configuration: { queryParser: "extended" } }
    };
    let calls = 0;
    const fake = { systemOne: async () => { calls += 1; throw new Error("should not call Jev"); } };
    const provider = new JevProvider({ client: fake as never, model: "jev-test" });
    expect(await provider.judge(configured)).toMatchObject({
      disposition: "no_direct_evidence",
      reasons: ["visible_query_parser_configuration_preserves_extended_parsing"]
    });
    expect(calls).toBe(0);
  });

  it("keeps review plus model-reported preservation unknown when host facts do not prove preservation", async () => {
    const fake = { systemOne: async () => ({ model: "jev-test", usage: { input_tokens: 1, output_tokens: 1 }, answers: { disposition: { type: "choice", choice: "review", confidence: .9, probabilities: { review: .9, not_this_change: .05, insufficient_evidence: .05 } }, depends_on_behavior: { type: "noul", noul: .9 }, preserves_old_behavior: { type: "noul", noul: .95 }, missing_required_facts: { type: "noul", noul: .05 } } }) };
    const provider = new JevProvider({ client: fake as never, model: "jev-test" });
    expect((await provider.judge(candidate)).disposition).toBe("unknown");
  });

  it("keeps low-confidence Jev choices unknown", async () => {
    const fake = { systemOne: async () => ({ model: "jev-test", usage: { input_tokens: 1, output_tokens: 1 }, answers: { disposition: { type: "choice", choice: "review", confidence: .49, probabilities: { review: .49, not_this_change: .31, insufficient_evidence: .2 } }, depends_on_behavior: { type: "noul", noul: .8 }, preserves_old_behavior: { type: "noul", noul: .1 }, missing_required_facts: { type: "noul", noul: .1 } } }) };
    const provider = new JevProvider({ client: fake as never, model: "jev-test" });
    expect(await provider.judge(candidate)).toMatchObject({
      disposition: "unknown",
      reasons: ["jev_choice_confidence_below_majority"]
    });
  });

  it("invalidates cache keys on source, note, policy inputs and model; aliases without resolved model bypass", () => {
    const first = providerCacheKey(candidate, "jev-1.13.0");
    expect(first).toBeTruthy();
    expect(providerCacheKey(candidate, undefined)).toBeUndefined();
    expect(providerCacheKey({ ...candidate, usage: { ...candidate.usage, span: { ...candidate.usage.span, sourceHash: "changed" } } }, "jev-1.13.0")).not.toBe(first);
    expect(providerCacheKey({ ...candidate, note: { ...candidate.note, span: { ...candidate.note.span, spanHash: "changed-note" } } }, "jev-1.13.0")).not.toBe(first);
    expect(providerCacheKey({ ...candidate, usage: { ...candidate.usage, configuration: { queryParser: "extended" } } }, "jev-1.13.0")).not.toBe(first);
    expect(providerCacheKey(candidate, "jev-1.14.0")).not.toBe(first);
  });

  it("redacts and bounds provider payload excerpts", () => {
    const longCandidate = {
      ...candidate,
      note: { ...candidate.note, text: `token=supersecretvalue ${"n".repeat(2500)}` },
      usage: { ...candidate.usage, span: { ...candidate.usage.span, excerpt: `Bearer abcdefghijklmnopqrstuvwxyz ${"s".repeat(2500)}` } }
    };
    const payload = providerPayload(longCandidate);
    expect(payload.state.note).not.toContain("supersecretvalue");
    expect(payload.state.sourceExcerpt).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(payload.state.note.length).toBeLessThan(1820);
    expect(payload.state.sourceExcerpt.length).toBeLessThan(1820);
    expect(payload.state.note).toContain("[truncated]");
    expect(payload.state.missingFacts).toEqual(expect.arrayContaining([
      "provider_note_excerpt_truncated",
      "provider_source_excerpt_truncated"
    ]));
  });

  it("does not call Jev when provider input is deterministically incomplete", async () => {
    let calls = 0;
    const fake = { systemOne: async () => { calls += 1; throw new Error("should not call Jev"); } };
    const provider = new JevProvider({ client: fake as never, model: "jev-test" });
    const longCandidate = {
      ...candidate,
      note: { ...candidate.note, text: "n".repeat(2500) }
    };
    expect(await provider.judge(longCandidate)).toMatchObject({
      disposition: "unknown",
      reasons: ["provider_input_incomplete:provider_note_excerpt_truncated"]
    });
    expect(calls).toBe(0);
  });

  it.each(["timeout", "429"])("propagates %s provider failures for the host to mark unknown", async (kind) => {
    const fake = { systemOne: async () => { throw new Error(kind); } };
    const provider = new JevProvider({ client: fake as never, model: "jev-test" });
    await expect(provider.judge(candidate)).rejects.toThrow(kind);
  });
});
