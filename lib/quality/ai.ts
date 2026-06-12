import type {
  Annotation,
  CheckResponse,
  MatchResult,
  Platform,
  RewriteResponse
} from "./types";
import {
  validateReviewAnnotationsResponse,
  validateRewriteResponse
} from "./validators";

type AgentName = "REVIEW" | "REWRITE" | "TRADITIONAL";

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
  if (!isAgentConfigured(config)) {
    throw new Error("一键改写必须配置 AI_AGENT_REWRITE_* 后才能使用");
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
