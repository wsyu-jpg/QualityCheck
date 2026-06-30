import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestQualityCheck,
  requestQualityRewrite
} from "@/lib/quality/proxy-ai";

const originalFetch = global.fetch;

describe("AI proxy client", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests type_c proxy with raw text content and repairs offsets", async () => {
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

    const result = await requestQualityCheck({
      platform: "xiaohongshu",
      text: "這款產品保證有效",
      enabledLexicons: ["general"],
      languagePreference: "traditional"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://smartai.centanet.com/ReelEstate/api/ai-proxy",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "serve-host": "aigpt.centanet.com",
          "serve-type": "type_c"
        })
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

  it("accepts type_c annotation arrays and derives highlight matches", async () => {
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
                    riskLevel: "medium",
                    title: "中風險表達",
                    reason: "包含較強的效果承諾。",
                    suggestion: "建議改為體驗型描述。",
                    alternatives: ["亲测不错", "体验较好"]
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

    const result = await requestQualityCheck({
      platform: "xiaohongshu",
      text: "這款產品保證最有效，全網最低。",
      enabledLexicons: ["general"],
      languagePreference: "traditional"
    });

    expect(result.matches[0]).toMatchObject({
      term: "保證最有效",
      severity: "medium",
      start: 4,
      end: 9,
      source: "ai_agent"
    });
    expect(result.annotations[0]).toMatchObject({
      matchId: "match_001",
      riskLevel: "medium",
      title: "中風險表達"
    });
  });

  it("infers annotation risk from title when riskLevel is missing", async () => {
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
                    matchKeywords: "值得入手",
                    title: "低風險表達",
                    reason: "屬於輕度主觀推薦。",
                    suggestion: "建議改為更客觀的描述。",
                    alternatives: ["可以关注", "值得了解"]
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

    const result = await requestQualityCheck({
      platform: "xiaohongshu",
      text: "這款產品值得入手。",
      enabledLexicons: ["general"],
      languagePreference: "traditional"
    });

    expect(result.matches[0]).toMatchObject({
      term: "值得入手",
      severity: "low",
      source: "ai_agent"
    });
    expect(result.summary.riskLevel).toBe("low");
  });

  it("accepts empty type_c annotation arrays as no findings", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "[]"
              },
              finish_reason: "stop",
              index: 0
            }
          ]
        })
      )
    ) as unknown as typeof fetch;

    const result = await requestQualityCheck({
      platform: "wechat",
      text: "這是一段普通文案。",
      enabledLexicons: ["general"],
      languagePreference: "traditional"
    });

    expect(result.matches).toEqual([]);
    expect(result.annotations).toEqual([]);
    expect(result.summary).toEqual({
      totalChars: 9,
      violationCount: 0,
      sensitiveCount: 0,
      riskLevel: "low"
    });
  });

  it("falls back to the local lexicon when type_c proxy fails", async () => {
    global.fetch = vi.fn(async () => new Response("error", { status: 502 })) as
      unknown as typeof fetch;

    const result = await requestQualityCheck({
      platform: "xiaohongshu",
      text: "这款产品保证是全网最低，闭眼入。",
      enabledLexicons: ["general", "xiaohongshu"],
      languagePreference: "simplified"
    });

    expect(result.matches.map((match) => match.term)).toEqual([
      "保证",
      "全网最低",
      "闭眼入"
    ]);
    expect(result.matches[0]?.source).toBe("local_lexicon");
  });

  it("packages check results into type_d rewrite content", async () => {
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

    const result = await requestQualityRewrite(
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
      "https://smartai.centanet.com/ReelEstate/api/ai-proxy",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "serve-host": "aigpt.centanet.com",
          "serve-type": "type_d"
        })
      })
    );
    expect(result.rewrittenText).toContain("不錯體驗");
  });

  it("accepts type_d plain text rewrite output", async () => {
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

    const result = await requestQualityRewrite(
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

  it("accepts type_d rewrite JSON with content field", async () => {
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

    const result = await requestQualityRewrite(
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

  it("accepts type_d rewrite JSON with string summary and risk", async () => {
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

    const result = await requestQualityRewrite(
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
