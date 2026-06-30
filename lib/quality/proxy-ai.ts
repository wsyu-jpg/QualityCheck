import type {
  Annotation,
  CheckRequest,
  CheckResponse,
  MatchResult,
  Platform,
  RewriteResponse
} from "./types";
import { buildLocalCheckResult, buildSummary } from "./lexicon";
import { validateCheckResponse, validateRewriteResponse } from "./validators";

const AI_PROXY_URL =
  process.env.NEXT_PUBLIC_AI_PROXY_URL ??
  "https://smartai.centanet.com/ReelEstate/api/ai-proxy";
const AI_PROXY_SERVER_HOST =
  process.env.NEXT_PUBLIC_AI_PROXY_SERVER_HOST ?? "aigpt.centanet.com";

type ServeType = "type_c" | "type_d";

export async function requestQualityCheck(input: CheckRequest) {
  try {
    const payload = await callAiProxyJson("type_c", input.text, {
      platform: input.platform,
      languagePreference: input.languagePreference,
      enabledLexicons: input.enabledLexicons.join(",")
    });
    return normalizeAiCheckPayload(payload, input.text);
  } catch {
    return buildLocalCheckResult(
      input.text,
      input.platform,
      input.enabledLexicons
    );
  }
}

export async function requestQualityRewrite(
  originalText: string,
  platform: Platform,
  targetLanguage: "simplified" | "traditional",
  matches: MatchResult[],
  annotations: Annotation[]
) {
  const payload = await callAiProxyJson(
    "type_d",
    JSON.stringify({
      platform,
      originalText,
      matches,
      annotations,
      targetLanguage,
      rewriteGoal: "reduce_risk_keep_meaning"
    }),
    {
      platform,
      targetLanguage,
      rewriteGoal: "reduce_risk_keep_meaning"
    }
  );

  return validateRewritePayload(payload, matches, annotations);
}

async function callAiProxyJson(
  serveType: ServeType,
  content: string,
  variables: Record<string, string>
) {
  const response = await fetch(AI_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "serve-host": AI_PROXY_SERVER_HOST,
      "serve-type": serveType
    },
    body: JSON.stringify({
      chatId: createUUID(),
      stream: false,
      detail: false,
      responseChatItemId: createUUID(),
      variables,
      messages: [
        {
          role: "user",
          content
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`AI 代理请求失败：${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const messageContent = payload.choices?.[0]?.message?.content;
  if (!messageContent) throw new Error("AI 代理返回为空");

  return parseContent(messageContent);
}

function createUUID() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const next = char === "x" ? value : (value & 0x3) | 0x8;
    return next.toString(16);
  });
}

function parseContent(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    return withoutFence;
  }
}

function validateRewritePayload(
  payload: unknown,
  matches: MatchResult[],
  annotations: Annotation[]
): RewriteResponse {
  if (typeof payload !== "string") {
    const record =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    if (
      record?.ok === true &&
      typeof record.rewrittenText === "string" &&
      typeof record.changeSummary === "string" &&
      typeof record.remainingRisk === "string"
    ) {
      return {
        ok: true,
        rewrittenText: record.rewrittenText,
        changeSummary: buildFallbackChangeSummary(
          record.changeSummary,
          matches,
          annotations
        ),
        remainingRisk: normalizeRemainingRisk(record.remainingRisk)
      };
    }
    if (typeof record?.content === "string") {
      return buildPlainTextRewriteResponse(record.content, matches, annotations);
    }
    return validateRewriteResponse(payload);
  }
  return buildPlainTextRewriteResponse(payload, matches, annotations);
}

function buildFallbackChangeSummary(
  summary: string,
  matches: MatchResult[],
  annotations: Annotation[]
) {
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const fallbackChanges = annotations.map((annotation) => ({
    before: matchById.get(annotation.matchId)?.term ?? annotation.title,
    after: annotation.alternatives[0] ?? "更温和的表达",
    reason: annotation.suggestion
  }));

  if (fallbackChanges.length > 0) {
    return fallbackChanges.map((change, index) => ({
      ...change,
      reason: index === 0 ? summary : change.reason
    }));
  }

  return [
    {
      before: "原文",
      after: "优化稿",
      reason: summary
    }
  ];
}

function normalizeRemainingRisk(riskText: string): RewriteResponse["remainingRisk"] {
  const normalized = riskText.trim();
  if (!normalized || normalized === "无" || normalized === "無") {
    return {
      riskLevel: "low",
      notes: []
    };
  }

  if (normalized.includes("高")) {
    return {
      riskLevel: "high",
      notes: [normalized]
    };
  }

  if (normalized.includes("中")) {
    return {
      riskLevel: "medium",
      notes: [normalized]
    };
  }

  return {
    riskLevel: "low",
    notes: [normalized]
  };
}

function buildPlainTextRewriteResponse(
  rewrittenText: string,
  matches: MatchResult[],
  annotations: Annotation[]
): RewriteResponse {
  if (!rewrittenText.trim()) throw new Error("AI 改写返回为空");
  const matchById = new Map(matches.map((match) => [match.id, match]));

  return {
    ok: true,
    rewrittenText,
    changeSummary: annotations.map((annotation) => ({
      before: matchById.get(annotation.matchId)?.term ?? annotation.title,
      after: annotation.alternatives[0] ?? "更温和的表达",
      reason: annotation.suggestion
    })),
    remainingRisk: {
      riskLevel: "medium",
      notes: ["改写 AI 返回纯文本，剩余风险由系统保守标记。"]
    }
  };
}

function normalizeAiCheckResult(
  result: CheckResponse,
  originalText: string
): CheckResponse {
  if (result.originalText !== originalText) {
    throw new Error("AI 检测返回的 originalText 与请求原文不一致");
  }

  const normalizedMatches: MatchResult[] = [];
  const idMap = new Map<string, string>();

  for (const match of result.matches) {
    const repaired = repairMatchOffset(match, originalText);
    if (!repaired) continue;
    const nextId = `match_${String(normalizedMatches.length + 1).padStart(3, "0")}`;
    idMap.set(match.id, nextId);
    normalizedMatches.push({
      ...repaired,
      id: nextId,
      source: "ai_agent"
    });
  }

  const dedupedMatches = removeOverlaps(normalizedMatches);
  const validMatchIds = new Set(dedupedMatches.map((match) => match.id));
  const annotations = result.annotations
    .map((annotation) => {
      const matchId = idMap.get(annotation.matchId);
      return matchId ? { ...annotation, matchId } : null;
    })
    .filter(
      (annotation): annotation is Annotation =>
        annotation !== null && validMatchIds.has(annotation.matchId)
    );

  return {
    ok: true,
    originalText,
    summary: buildSummary(originalText, dedupedMatches),
    matches: dedupedMatches,
    annotations
  };
}

function normalizeAiCheckPayload(payload: unknown, originalText: string) {
  if (Array.isArray(payload)) {
    return normalizeFastGptAnnotationList(payload, originalText);
  }
  return normalizeAiCheckResult(validateCheckResponse(payload), originalText);
}

function normalizeFastGptAnnotationList(
  payload: unknown[],
  originalText: string
): CheckResponse {
  const matches: MatchResult[] = [];
  const annotations: Annotation[] = [];

  payload.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const record = item as Record<string, unknown>;
    const term =
      typeof record.matchKeywords === "string"
        ? record.matchKeywords.trim()
        : typeof record.title === "string"
          ? record.title.trim()
          : "";
    if (!term) return;

    const start = originalText.indexOf(term);
    if (start === -1) return;

    const id = `match_${String(matches.length + 1).padStart(3, "0")}`;
    const severity = normalizeAnnotationRiskLevel(record);
    matches.push({
      id,
      term,
      category: "sensitive",
      severity,
      start,
      end: start + term.length,
      source: "ai_agent"
    });
    annotations.push({
      matchId: id,
      riskLevel: severity,
      title:
        typeof record.title === "string"
          ? record.title
          : defaultRiskTitle(severity),
      reason:
        typeof record.reason === "string"
          ? record.reason
          : "该表达可能触发平台审核或降低内容通过率。",
      suggestion:
        typeof record.suggestion === "string"
          ? record.suggestion
          : "建议替换为更中性、可验证、不过度承诺的表达。",
      alternatives: Array.isArray(record.alternatives)
        ? record.alternatives.filter(
            (alternative): alternative is string =>
              typeof alternative === "string"
          )
        : []
    });
  });

  if (payload.length > 0 && matches.length === 0) {
    throw new Error("AI 检测返回缺少可定位的命中词");
  }

  const dedupedMatches = removeOverlaps(matches);
  const validMatchIds = new Set(dedupedMatches.map((match) => match.id));

  return {
    ok: true,
    originalText,
    summary: buildSummary(originalText, dedupedMatches),
    matches: dedupedMatches,
    annotations: annotations.filter((annotation) =>
      validMatchIds.has(annotation.matchId)
    )
  };
}

function normalizeAnnotationRiskLevel(record: Record<string, unknown>) {
  if (
    record.riskLevel === "high" ||
    record.riskLevel === "medium" ||
    record.riskLevel === "low"
  ) {
    return record.riskLevel;
  }

  if (typeof record.title === "string") {
    if (record.title.includes("高")) return "high";
    if (record.title.includes("中")) return "medium";
    if (record.title.includes("低")) return "low";
  }

  return "high";
}

function defaultRiskTitle(severity: MatchResult["severity"]) {
  return {
    high: "高风险表达",
    medium: "中风险表达",
    low: "低风险表达"
  }[severity];
}

function repairMatchOffset(match: MatchResult, text: string) {
  if (!Number.isInteger(match.start) || !Number.isInteger(match.end)) {
    return null;
  }

  if (
    match.start >= 0 &&
    match.end > match.start &&
    match.end <= text.length &&
    text.slice(match.start, match.end) === match.term
  ) {
    return match;
  }

  const start = text.indexOf(match.term);
  if (start === -1) return null;
  return {
    ...match,
    start,
    end: start + match.term.length
  };
}

function removeOverlaps(matches: MatchResult[]) {
  const severityWeight = { high: 3, medium: 2, low: 1 };
  const accepted: MatchResult[] = [];

  for (const match of [...matches].sort(
    (a, b) =>
      a.start - b.start ||
      b.end - b.start - (a.end - a.start) ||
      severityWeight[b.severity] - severityWeight[a.severity]
  )) {
    const overlaps = accepted.some(
      (current) => match.start < current.end && match.end > current.start
    );
    if (!overlaps) accepted.push(match);
  }

  return accepted.sort((a, b) => a.start - b.start);
}
