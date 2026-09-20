export type RunMode = "illustrative_fixture" | "baseline" | "jev" | "dry_run";
export type Disposition = "review" | "no_direct_evidence" | "unknown";

export interface Upgrade {
  package: string;
  from: string;
  to: string;
}

export interface EvidenceSpan {
  id: string;
  kind: "code" | "note";
  path: string;
  startLine: number;
  endLine: number;
  sourceHash: string;
  spanHash: string;
  excerpt: string;
  url?: string;
}

export interface NoteBlock {
  family: string;
  heading: string;
  span: EvidenceSpan;
  text: string;
}

export interface NoteDocument {
  path: string;
  package: string;
  from: string;
  to: string;
  sourceUrl: string;
  retrieved: string;
  sha256: string;
  blocks: NoteBlock[];
  provenanceVerified: boolean;
}

export interface SourceFile {
  path: string;
  content: string;
  sha256: string;
}

export interface SourceSnapshot {
  repoPath: string;
  revision: string;
  repositoryPrefix: string;
  sourceWebBase?: string;
  files: SourceFile[];
  scannedCount: number;
  skippedCount: number;
  truncatedCount: number;
  limitations: string[];
}

export interface UsageSite {
  package: string;
  family: string;
  symbol: string;
  span: EvidenceSpan;
  configuration: Record<string, string | boolean | null>;
  missingFacts: string[];
}

export interface Candidate {
  id: string;
  upgrade: Upgrade;
  note: NoteBlock;
  usage: UsageSite;
}

export interface SemanticAnswer {
  model: string;
  disposition: "review" | "not_this_change" | "insufficient_evidence";
  dispositionProbabilities: Record<string, number>;
  confidence: number;
  dependsOnBehavior: number;
  preservesOldBehavior: number;
  missingRequiredFacts: number;
}

export interface Finding {
  id: string;
  package: string;
  changeFamily: string;
  disposition: Disposition;
  relationship: string;
  code: EvidenceSpan;
  note: EvidenceSpan;
  semantic?: SemanticAnswer;
  reasons: string[];
}

export interface Report {
  schemaVersion: "upgrade-radar-report/v1";
  runMode: RunMode;
  generatedAt: string;
  sourceRevision: string;
  upgrades: Upgrade[];
  noteProvenance: Array<{
    path: string;
    package: string;
    from: string;
    to: string;
    sourceUrl: string;
    retrieved: string;
    sha256: string;
    verified: boolean;
  }>;
  counts: {
    scanned: number;
    skipped: number;
    truncated: number;
    candidates: number;
    findings: number;
    unknown: number;
  };
  complete: boolean;
  findings: Finding[];
  unknownItems: string[];
  coverageLimitations: string[];
}

export interface ProviderPayload {
  state: {
    package: string;
    from: string;
    to: string;
    note: string;
    noteContext: string;
    noteFamily: string;
    sourceExcerpt: string;
    resolvedSymbol: string;
    visibleConfiguration: Record<string, string | boolean | null>;
    missingFacts: string[];
  };
}

export interface Provider {
  readonly name: "baseline" | "jev";
  judge(candidate: Candidate): Promise<{ disposition: Disposition; reasons: string[]; semantic?: SemanticAnswer }>;
  payload(candidate: Candidate): ProviderPayload;
}
