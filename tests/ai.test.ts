import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAiCheck, requestRewrite } from "@/lib/quality/ai";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe("AI rewrite agent", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requires AI_AGENT_REWRITE configuration", async () => {
    delete process.env.AI_AGENT_REWRITE_BASE_URL;
    delete process.env.AI_AGENT_REWRITE_API_KEY;
    delete process.env.AI_AGENT_REWRITE_MODEL;

    await expect(
      requestRewrite("我是第一名", "xiaohongshu", "simplified", [], [])
    ).rejects.toThrow("AI_AGENT_REWRITE");
  });

  it("requests FastGPT check with raw text content and repairs offsets", async () => {
    process.env.AI_AGENT_CHECK_BASE_URL = "https://aigpt.centanet.com";
    process.env.AI_AGENT_CHECK_API_KEY = "test-token";
    delete process.env.AI_AGENT_CHECK_MODEL;

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>;
      };
      expect(body.messages[0]?.content).toBe("這款產品保證有效");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  ok: true,
                  originalText: "這款產品保證有效",
                  summary: {
                    totalChars: 8,
                    violationCount: 2,
                    sensitiveCount: 0,
                    riskLevel: "high"
                  },
                  matches: [
                    {
                      id: "risk_a",
                      term: "保證",
                      category: "general",
                      severity: "high",
                      start: 0,
                      end: 2,
                      source: "ai_agent"
                    }
                  ],
                  annotations: [
                    {
                      matchId: "risk_a",
                      title: "高风险表达",
                      reason: "确定性承诺风险较高。",
                      suggestion: "建议弱化承诺语气。",
                      alternatives: ["有机会", "帮助"]
                    }
                  ]
                })
              },
              finish_reason: "stop",
              index: 0
            }
          ]
        })
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await requestAiCheck({
      platform: "xiaohongshu",
      text: "這款產品保證有效",
      enabledLexicons: ["general"],
      languagePreference: "traditional"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://aigpt.centanet.com/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(result.matches[0]).toMatchObject({
      id: "match_001",
      term: "保證",
      start: 4,
      end: 6,
      source: "ai_agent"
    });
    expect(result.annotations[0]?.matchId).toBe("match_001");
  });

  it("accepts FastGPT annotation arrays and derives highlight matches", async () => {
    process.env.AI_AGENT_CHECK_BASE_URL = "https://aigpt.centanet.com";
    process.env.AI_AGENT_CHECK_API_KEY = "test-token";

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify([
                  {
                    matchId: "match_001",
                    matchKeywords: "保證最有效",
                    title: "高风险表达",
                    reason: "包含绝对化效果承诺。",
                    suggestion: "建议改为体验型描述。",
                    alternatives: ["親測不錯", "效果很驚喜"]
                  }
                ])
              },
              finish_reason: "stop",
              index: 0
            }
          ]
        })
      )
    ) as unknown as typeof fetch;

    const result = await requestAiCheck({
      platform: "xiaohongshu",
      text: "這款產品保證最有效，全網最低。",
      enabledLexicons: ["general"],
      languagePreference: "traditional"
    });

    expect(result.matches[0]).toMatchObject({
      term: "保證最有效",
      start: 4,
      end: 9,
      source: "ai_agent"
    });
    expect(result.annotations[0]).toMatchObject({
      matchId: "match_001",
      title: "高风险表达"
    });
  });

  it("packages check results into FastGPT rewrite content", async () => {
    process.env.AI_AGENT_REWRITE_BASE_URL = "https://aigpt.centanet.com";
    process.env.AI_AGENT_REWRITE_API_KEY = "rewrite-token";
    delete process.env.AI_AGENT_REWRITE_MODEL;

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>;
      };
      const content = JSON.parse(body.messages[0]?.content ?? "{}") as {
        originalText?: string;
        matches?: unknown[];
        annotations?: unknown[];
      };

      expect(content.originalText).toBe("這款產品保證最有效。");
      expect(content.matches).toHaveLength(1);
      expect(content.annotations).toHaveLength(1);

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  ok: true,
                  rewrittenText: "這款產品有機會帶來不錯體驗。",
                  changeSummary: [
                    {
                      before: "保證最有效",
                      after: "有機會帶來不錯體驗",
                      reason: "弱化确定性效果承诺"
                    }
                  ],
                  remainingRisk: {
                    riskLevel: "low",
                    notes: []
                  }
                })
              },
              finish_reason: "stop",
              index: 0
            }
          ]
        })
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await requestRewrite(
      "這款產品保證最有效。",
      "xiaohongshu",
      "traditional",
      [
        {
          id: "match_001",
          term: "保證最有效",
          category: "sensitive",
          severity: "high",
          start: 4,
          end: 9,
          source: "ai_agent"
        }
      ],
      [
        {
          matchId: "match_001",
          title: "高风险表达",
          reason: "确定性效果承诺",
          suggestion: "建议弱化表达",
          alternatives: ["有机会改善"]
        }
      ]
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://aigpt.centanet.com/api/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.rewrittenText).toContain("不錯體驗");
  });

  it("accepts plain text FastGPT rewrite output", async () => {
    process.env.AI_AGENT_REWRITE_BASE_URL = "https://aigpt.centanet.com";
    process.env.AI_AGENT_REWRITE_API_KEY = "rewrite-token";
    delete process.env.AI_AGENT_REWRITE_MODEL;

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "這款產品有助提升，性價比高，值得入手。"
              },
              finish_reason: "stop",
              index: 0
            }
          ]
        })
      )
    ) as unknown as typeof fetch;

    const result = await requestRewrite(
      "這款產品保證最有效。",
      "xiaohongshu",
      "traditional",
      [
        {
          id: "match_001",
          term: "保證最有效",
          category: "sensitive",
          severity: "high",
          start: 4,
          end: 9,
          source: "ai_agent"
        }
      ],
      [
        {
          matchId: "match_001",
          title: "高风险表达",
          reason: "确定性效果承诺",
          suggestion: "建议弱化表达",
          alternatives: ["有助提升"]
        }
      ]
    );

    expect(result.rewrittenText).toContain("性價比高");
    expect(result.changeSummary[0]?.before).toBe("保證最有效");
    expect(result.remainingRisk.riskLevel).toBe("medium");
  });

  it("accepts FastGPT rewrite JSON with content field", async () => {
    process.env.AI_AGENT_REWRITE_BASE_URL = "https://aigpt.centanet.com";
    process.env.AI_AGENT_REWRITE_API_KEY = "rewrite-token";
    delete process.env.AI_AGENT_REWRITE_MODEL;

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  content: "這款產品質感不錯，性價比高，值得看看。"
                })
              },
              finish_reason: "stop",
              index: 0
            }
          ]
        })
      )
    ) as unknown as typeof fetch;

    const result = await requestRewrite(
      "這款產品保證最有效。",
      "xiaohongshu",
      "traditional",
      [
        {
          id: "match_001",
          term: "保證最有效",
          category: "sensitive",
          severity: "high",
          start: 4,
          end: 9,
          source: "ai_agent"
        }
      ],
      [
        {
          matchId: "match_001",
          title: "高风险表达",
          reason: "确定性效果承诺",
          suggestion: "建议弱化表达",
          alternatives: ["值得看看"]
        }
      ]
    );

    expect(result.rewrittenText).toContain("值得看看");
    expect(result.changeSummary[0]?.before).toBe("保證最有效");
  });

  it("accepts FastGPT rewrite JSON with string summary and risk", async () => {
    process.env.AI_AGENT_REWRITE_BASE_URL = "https://aigpt.centanet.com";
    process.env.AI_AGENT_REWRITE_API_KEY = "rewrite-token";
    delete process.env.AI_AGENT_REWRITE_MODEL;

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  ok: true,
                  rewrittenText: "这款产品有助于提升效果，全网低价，值得入手。",
                  changeSummary:
                    "1. 质检问题整改：针对高风险表达进行弱化。\n2. 格式优化：统一使用简体中文。",
                  remainingRisk: "无"
                })
              },
              finish_reason: "stop",
              index: 0
            }
          ]
        })
      )
    ) as unknown as typeof fetch;

    const result = await requestRewrite(
      "這款產品保證最有效。",
      "xiaohongshu",
      "simplified",
      [
        {
          id: "match_001",
          term: "保證最有效",
          category: "sensitive",
          severity: "high",
          start: 4,
          end: 9,
          source: "ai_agent"
        }
      ],
      [
        {
          matchId: "match_001",
          title: "高风险表达",
          reason: "确定性效果承诺",
          suggestion: "建议弱化表达",
          alternatives: ["有助于提升效果"]
        }
      ]
    );

    expect(result.rewrittenText).toContain("全网低价");
    expect(result.changeSummary[0]?.reason).toContain("质检问题整改");
    expect(result.remainingRisk).toEqual({
      riskLevel: "low",
      notes: []
    });
  });
});
