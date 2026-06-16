import { randomUUID } from "crypto";
import type {
  Annotation,
  CheckRequest,
  CheckResponse,
  MatchResult,
  Platform,
  RewriteResponse
} from "./types";
import { buildSummary } from "./lexicon";
import {
  validateCheckResponse,
  validateReviewAnnotationsResponse,
  validateRewriteResponse
} from "./validators";

type AgentName = "CHECK" | "REVIEW" | "REWRITE" | "TRADITIONAL";

type AgentConfig = {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  temperature: number;
  timeoutMs: number;
};

export function getAgentConfig(agent: AgentName): AgentConfig {
  return {
    baseURL: process.env[`AI_AGENT_${agent}_BASE_URL`],
    apiKey: process.env[`AI_AGENT_${agent}_API_KEY`],
    model: process.env[`AI_AGENT_${agent}_MODEL`],
    temperature: Number(process.env[`AI_AGENT_${agent}_TEMPERATURE`] ?? 0.2),
    timeoutMs: Number(process.env[`AI_AGENT_${agent}_TIMEOUT_MS`] ?? 15000)
  };
}

export function isAgentConfigured(config: AgentConfig) {
  return Boolean(config.baseURL && config.apiKey && config.model);
}

export function isFastGptAgentConfigured(config: AgentConfig) {
  return Boolean(config.baseURL && config.apiKey);
}

export async function requestAiCheck(input: CheckRequest) {
  const config = getAgentConfig("CHECK");
  if (!isFastGptAgentConfigured(config)) {
    throw new Error("AI_AGENT_CHECK_* 未配置，使用本地词库检测");
  }

  const json = await callFastGptJson(config, input.text, {
    platform: input.platform,
    languagePreference: input.languagePreference,
    enabledLexicons: input.enabledLexicons.join(",")
  });
  return normalizeAiCheckPayload(json, input.text);
}

export async function requestReviewAnnotations(
  localResult: CheckResponse,
  platform: Platform
) {
  const config = getAgentConfig("REVIEW");
  if (!isAgentConfigured(config)) return localResult.annotations;

  const json = await callOpenAIJson(config, [
    {
      role: "system",
      content:
        "你是内容平台文案质检批注 agent。只返回 JSON，不要 Markdown。你只负责根据 matches 生成 annotations，不要返回原文、统计、matches，也不要生成“批注1/2/3”这类编号。"
    },
    {
      role: "user",
      content: JSON.stringify({
        platform,
        contract:
          "Return ReviewAnnotationsResponse JSON: { ok: true, annotations: [{ matchId, title, reason, suggestion, alternatives }] }.",
        rules: [
          "annotations 必须与 matches 使用相同 matchId",
          "title 可使用 高风险表达 / 中风险表达 / 低风险表达",
          "reason 解释审核或内容风险",
          "suggestion 给出修改方向",
          "alternatives 给出 2-4 个替代表达",
          "不要返回批注序号，前端会按数组顺序显示"
        ],
        localResult
      })
    }
  ]);
  return validateReviewAnnotationsResponse(json).annotations;
}

export async function requestRewrite(
  originalText: string,
  platform: Platform,
  targetLanguage: "simplified" | "traditional",
  matches: MatchResult[],
  annotations: Annotation[]
) {
  const config = getAgentConfig("REWRITE");
  if (!isFastGptAgentConfigured(config)) {
    throw new Error("一键改写必须配置 AI_AGENT_REWRITE_* 后才能使用");
  }

  if (!config.model) {
    const json = await callFastGptJson(
      config,
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
    return validateRewritePayload(json, matches, annotations);
  }

  const json = await callOpenAIJson(config, [
    {
      role: "system",
      content:
        "你是文案改写 agent。只返回 JSON，不要 Markdown。目标是在保留原意的前提下降低审核风险，并按 targetLanguage 输出完整优化稿。"
    },
    {
      role: "user",
      content: JSON.stringify({
        platform,
        originalText,
        matches,
        annotations,
        targetLanguage,
        rewriteGoal: "reduce_risk_keep_meaning",
        requiredLogic: [
          "必须整合 originalText、matches 和 annotations 后生成整篇 rewrittenText",
          "rewrittenText 必须是完整文案，不要只返回片段",
          "changeSummary 必须列出你相对原文做出的主要调整点",
          "changeSummary.before 必须来自原文或原风险表达",
          "changeSummary.after 必须来自 rewrittenText 或新表达",
          "remainingRisk 评估改写后的剩余风险"
        ],
        contract: {
          ok: true,
          rewrittenText: "完整优化稿",
          changeSummary: [
            {
              before: "原表达",
              after: "新表达",
              reason: "为什么这样调整"
            }
          ],
          remainingRisk: {
            riskLevel: "low | medium | high",
            notes: ["剩余风险说明，可为空数组"]
          }
        }
      })
    }
  ]);
  return validateRewriteResponse(json);
}

async function callFastGptJson(
  config: AgentConfig,
  content: string,
  variables: Record<string, string>
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(getFastGptCompletionsURL(config), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chatId: randomUUID(),
        stream: false,
        detail: false,
        responseChatItemId: randomUUID(),
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
      throw new Error(`AI 检测请求失败：${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const messageContent = payload.choices?.[0]?.message?.content;
    if (!messageContent) throw new Error("AI 检测返回为空");

    return parseContent(messageContent);
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAIJson(
  config: AgentConfig,
  messages: Array<{ role: "system" | "user"; content: string }>
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseURL?.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        response_format: { type: "json_object" },
        messages
      })
    });

    if (!response.ok) {
      throw new Error(`AI 请求失败：${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回为空");

    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new Error("AI 返回不是合法 JSON");
    }
  } finally {
    clearTimeout(timeout);
  }
}

function getFastGptCompletionsURL(config: AgentConfig) {
  const baseURL = config.baseURL?.replace(/\/$/, "");
  if (!baseURL) throw new Error("AI_AGENT_CHECK_BASE_URL 未配置");
  if (baseURL.endsWith("/chat/completions")) return baseURL;
  if (baseURL.endsWith("/api/v1")) return `${baseURL}/chat/completions`;
  return `${baseURL}/api/v1/chat/completions`;
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
    matches.push({
      id,
      term,
      category: "sensitive",
      severity: "high",
      start,
      end: start + term.length,
      source: "ai_agent"
    });
    annotations.push({
      matchId: id,
      title:
        typeof record.title === "string" ? record.title : "高风险表达",
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
