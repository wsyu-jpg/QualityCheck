import rawLexicons from "@/data/lexicons.json";
import type {
  Annotation,
  CheckResponse,
  CheckSummary,
  LexiconEntry,
  MatchResult,
  Platform,
  RiskLevel
} from "./types";

const lexicons = rawLexicons as Record<string, LexiconEntry[]>;

export function getLexiconEntries(
  platform: Platform,
  enabledLexicons: string[]
) {
  const normalized = new Set(["general", "sensitive", platform, ...enabledLexicons]);
  const entries: LexiconEntry[] = [];

  for (const key of normalized) {
    for (const entry of lexicons[key] ?? []) {
      if (!entry.platforms || entry.platforms.includes(platform)) {
        entries.push(entry);
      }
    }
  }

  return entries;
}

export function detectMatches(
  text: string,
  platform: Platform,
  enabledLexicons: string[]
) {
  const entries = getLexiconEntries(platform, enabledLexicons);
  const rawMatches: MatchResult[] = [];

  entries.forEach((entry) => {
    let cursor = 0;
    while (cursor < text.length) {
      const start = text.indexOf(entry.term, cursor);
      if (start === -1) break;
      rawMatches.push({
        id: "",
        term: entry.term,
        category: entry.category,
        severity: entry.severity,
        start,
        end: start + entry.term.length,
        source: "local_lexicon"
      });
      cursor = start + Math.max(entry.term.length, 1);
    }
  });

  return removeOverlaps(rawMatches)
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .map((match, index) => ({
      ...match,
      id: `match_${String(index + 1).padStart(3, "0")}`
    }));
}

export function buildLocalCheckResult(
  text: string,
  platform: Platform,
  enabledLexicons: string[]
): CheckResponse {
  const matches = detectMatches(text, platform, enabledLexicons);
  return {
    ok: true,
    originalText: text,
    summary: buildSummary(text, matches),
    matches,
    annotations: buildFallbackAnnotations(matches)
  };
}

export function buildSummary(
  text: string,
  matches: MatchResult[]
): CheckSummary {
  const violationCount = matches
    .filter((match) => match.severity !== "low")
    .reduce((sum, match) => sum + match.term.length, 0);
  const sensitiveCount = matches
    .filter((match) => match.category === "sensitive")
    .reduce((sum, match) => sum + match.term.length, 0);

  return {
    totalChars: Array.from(text).length,
    violationCount,
    sensitiveCount,
    riskLevel: getRiskLevel(matches)
  };
}

export function buildFallbackAnnotations(matches: MatchResult[]): Annotation[] {
  return matches.map((match) => {
    const entry = findEntry(match);
    return {
      matchId: match.id,
      title: `${severityLabel(match.severity)}风险表达`,
      reason: entry?.note ?? "该表达可能触发平台审核或降低内容通过率。",
      suggestion: "建议替换为更中性、可验证、不过度承诺的表达。",
      alternatives: entry?.alternatives ?? []
    };
  });
}

export function findAlternative(term: string) {
  for (const entries of Object.values(lexicons)) {
    const entry = entries.find((item) => item.term === term);
    if (entry?.alternatives.length) return entry.alternatives[0];
  }
  return "更温和的表达";
}

function removeOverlaps(matches: MatchResult[]) {
  const severityWeight = { high: 3, medium: 2, low: 1 };
  const sorted = [...matches].sort(
    (a, b) =>
      a.start - b.start ||
      b.end - b.start - (a.end - a.start) ||
      severityWeight[b.severity] - severityWeight[a.severity]
  );
  const accepted: MatchResult[] = [];

  for (const match of sorted) {
    const overlaps = accepted.some(
      (current) => match.start < current.end && match.end > current.start
    );
    if (!overlaps) accepted.push(match);
  }

  return accepted;
}

function getRiskLevel(matches: MatchResult[]): RiskLevel {
  if (matches.some((match) => match.severity === "high")) return "high";
  if (matches.some((match) => match.severity === "medium")) return "medium";
  return "low";
}

function findEntry(match: MatchResult) {
  return Object.values(lexicons)
    .flat()
    .find(
      (entry) => entry.term === match.term && entry.category === match.category
    );
}

function severityLabel(severity: "low" | "medium" | "high") {
  return {
    low: "低",
    medium: "中",
    high: "高"
  }[severity];
}
