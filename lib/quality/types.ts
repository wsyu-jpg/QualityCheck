export type Platform = "xiaohongshu" | "wechat";
export type RiskLevel = "low" | "medium" | "high";
export type Severity = "low" | "medium" | "high";
export type LanguagePreference = "simplified" | "traditional";

export type LexiconEntry = {
  term: string;
  category: string;
  severity: Severity;
  alternatives: string[];
  note: string;
  platforms?: Platform[];
};

export type MatchResult = {
  id: string;
  term: string;
  category: string;
  severity: Severity;
  start: number;
  end: number;
  source: "local_lexicon" | "ai_agent";
};

export type Annotation = {
  matchId: string;
  riskLevel?: RiskLevel;
  title: string;
  reason: string;
  suggestion: string;
  alternatives: string[];
};

export type CheckSummary = {
  totalChars: number;
  violationCount: number;
  sensitiveCount: number;
  riskLevel: RiskLevel;
};

export type CheckResponse = {
  ok: true;
  originalText: string;
  summary: CheckSummary;
  matches: MatchResult[];
  annotations: Annotation[];
};

export type ReviewAnnotationsResponse = {
  ok: true;
  annotations: Annotation[];
};

export type RewriteResponse = {
  ok: true;
  rewrittenText: string;
  changeSummary: Array<{
    before: string;
    after: string;
    reason: string;
  }>;
  remainingRisk: {
    riskLevel: RiskLevel;
    notes: string[];
  };
};

export type CheckRequest = {
  platform: Platform;
  text: string;
  enabledLexicons: string[];
  languagePreference: LanguagePreference;
};

export type RewriteRequest = {
  platform: Platform;
  originalText: string;
  matches: MatchResult[];
  annotations: Annotation[];
  targetLanguage: LanguagePreference;
  rewriteGoal: "reduce_risk_keep_meaning";
};
