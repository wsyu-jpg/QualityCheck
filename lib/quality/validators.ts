import type {
  Annotation,
  CheckRequest,
  CheckResponse,
  MatchResult,
  ReviewAnnotationsResponse,
  RewriteRequest,
  RewriteResponse
} from "./types";

const platforms = ["xiaohongshu", "wechat"] as const;
const languages = ["simplified", "traditional"] as const;
const riskLevels = ["low", "medium", "high"] as const;
const severities = ["low", "medium", "high"] as const;
const matchSources = ["local_lexicon", "ai_agent"] as const;

export function parseCheckRequest(value: unknown): CheckRequest {
  const body = assertRecord(value, "请求体必须是 JSON 对象");
  const platform = assertOneOf(body.platform, platforms, "platform");
  const text = assertString(body.text, "text");
  const enabledLexicons = assertStringArray(
    body.enabledLexicons,
    "enabledLexicons"
  );
  const languagePreference = assertOneOf(
    body.languagePreference,
    languages,
    "languagePreference"
  );

  if (!text.trim()) throw new Error("text 不能为空");
  if (text.length > 1500) throw new Error("text 不能超过 1500 字");

  return { platform, text, enabledLexicons, languagePreference };
}

export function parseRewriteRequest(value: unknown): RewriteRequest {
  const body = assertRecord(value, "请求体必须是 JSON 对象");
  return {
    platform: assertOneOf(body.platform, platforms, "platform"),
    originalText: assertString(body.originalText, "originalText"),
    matches: assertMatches(body.matches),
    annotations: assertAnnotations(body.annotations),
    targetLanguage: assertOneOf(body.targetLanguage, languages, "targetLanguage"),
    rewriteGoal: assertOneOf(
      body.rewriteGoal,
      ["reduce_risk_keep_meaning"],
      "rewriteGoal"
    )
  };
}

export function validateCheckResponse(value: unknown): CheckResponse {
  const body = assertRecord(value, "AI 检测返回必须是 JSON 对象");
  if (body.ok !== true) throw new Error("AI 检测返回 ok 必须为 true");
  return {
    ok: true,
    originalText: assertString(body.originalText, "originalText"),
    summary: {
      totalChars: assertNumber(assertRecord(body.summary, "summary").totalChars, "summary.totalChars"),
      violationCount: assertNumber(assertRecord(body.summary, "summary").violationCount, "summary.violationCount"),
      sensitiveCount: assertNumber(assertRecord(body.summary, "summary").sensitiveCount, "summary.sensitiveCount"),
      riskLevel: assertOneOf(assertRecord(body.summary, "summary").riskLevel, riskLevels, "summary.riskLevel")
    },
    matches: assertMatches(body.matches),
    annotations: assertAnnotations(body.annotations)
  };
}

export function validateReviewAnnotationsResponse(
  value: unknown
): ReviewAnnotationsResponse {
  const body = assertRecord(value, "AI 批注返回必须是 JSON 对象");
  if (body.ok !== true) throw new Error("AI 批注返回 ok 必须为 true");
  return {
    ok: true,
    annotations: assertAnnotations(body.annotations)
  };
}

export function validateRewriteResponse(value: unknown): RewriteResponse {
  const body = assertRecord(value, "AI 改写返回必须是 JSON 对象");
  if (body.ok !== true) throw new Error("AI 改写返回 ok 必须为 true");
  const remainingRisk = assertRecord(body.remainingRisk, "remainingRisk");
  const changes = assertArray(body.changeSummary, "changeSummary").map(
    (item, index) => {
      const change = assertRecord(item, `changeSummary.${index}`);
      return {
        before: assertString(change.before, `changeSummary.${index}.before`),
        after: assertString(change.after, `changeSummary.${index}.after`),
        reason: assertString(change.reason, `changeSummary.${index}.reason`)
      };
    }
  );

  return {
    ok: true,
    rewrittenText: assertString(body.rewrittenText, "rewrittenText"),
    changeSummary: changes,
    remainingRisk: {
      riskLevel: assertOneOf(
        remainingRisk.riskLevel,
        riskLevels,
        "remainingRisk.riskLevel"
      ),
      notes: assertStringArray(remainingRisk.notes, "remainingRisk.notes")
    }
  };
}

function assertMatches(value: unknown): MatchResult[] {
  return assertArray(value, "matches").map((item, index) => {
    const match = assertRecord(item, `matches.${index}`);
    return {
      id: assertString(match.id, `matches.${index}.id`),
      term: assertString(match.term, `matches.${index}.term`),
      category: assertString(match.category, `matches.${index}.category`),
      severity: assertOneOf(
        match.severity,
        severities,
        `matches.${index}.severity`
      ),
      start: assertNumber(match.start, `matches.${index}.start`),
      end: assertNumber(match.end, `matches.${index}.end`),
      source: assertOneOf(match.source, matchSources, `matches.${index}.source`)
    };
  });
}

function assertAnnotations(value: unknown): Annotation[] {
  return assertArray(value, "annotations").map((item, index) => {
    const annotation = assertRecord(item, `annotations.${index}`);
    return {
      matchId: assertString(annotation.matchId, `annotations.${index}.matchId`),
      title: assertString(annotation.title, `annotations.${index}.title`),
      reason: assertString(annotation.reason, `annotations.${index}.reason`),
      suggestion: assertString(
        annotation.suggestion,
        `annotations.${index}.suggestion`
      ),
      alternatives: assertStringArray(
        annotation.alternatives,
        `annotations.${index}.alternatives`
      )
    };
  });
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 格式错误`);
  }
  return value as Record<string, unknown>;
}

function assertArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组`);
  return value;
}

function assertString(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} 必须是字符串`);
  return value;
}

function assertStringArray(value: unknown, label: string) {
  return assertArray(value, label).map((item, index) =>
    assertString(item, `${label}.${index}`)
  );
}

function assertNumber(value: unknown, label: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} 必须是数字`);
  }
  return value;
}

function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} 不在允许范围内`);
  }
  return value as T;
}
