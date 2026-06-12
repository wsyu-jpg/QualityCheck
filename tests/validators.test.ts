import { describe, expect, it } from "vitest";
import {
  validateCheckResponse,
  validateReviewAnnotationsResponse,
  validateRewriteResponse
} from "@/lib/quality/validators";

describe("AI JSON validators", () => {
  it("accepts the fixed check response contract", () => {
    const result = validateCheckResponse({
      ok: true,
      originalText: "保证好用",
      summary: {
        totalChars: 4,
        violationCount: 2,
        sensitiveCount: 0,
        riskLevel: "high"
      },
      matches: [
        {
          id: "match_001",
          term: "保证",
          category: "general",
          severity: "high",
          start: 0,
          end: 2,
          source: "local_lexicon"
        }
      ],
      annotations: [
        {
          matchId: "match_001",
          title: "高风险表达",
          reason: "确定性承诺",
          suggestion: "弱化表达",
          alternatives: ["帮助提升"]
        }
      ]
    });

    expect(result.annotations[0]?.alternatives).toEqual(["帮助提升"]);
  });

  it("rejects invalid severity in AI check response", () => {
    expect(() =>
      validateCheckResponse({
        ok: true,
        originalText: "保证好用",
        summary: {
          totalChars: 4,
          violationCount: 2,
          sensitiveCount: 0,
          riskLevel: "high"
        },
        matches: [
          {
            id: "match_001",
            term: "保证",
            category: "general",
            severity: "critical",
            start: 0,
            end: 2,
            source: "local_lexicon"
          }
        ],
        annotations: []
      })
    ).toThrow("severity");
  });

  it("accepts the fixed rewrite response contract", () => {
    const result = validateRewriteResponse({
      ok: true,
      rewrittenText: "帮助提升体验",
      changeSummary: [
        {
          before: "保证",
          after: "帮助提升",
          reason: "降低审核风险"
        }
      ],
      remainingRisk: {
        riskLevel: "low",
        notes: []
      }
    });

    expect(result.remainingRisk.riskLevel).toBe("low");
  });

  it("accepts the review agent annotation-only contract", () => {
    const result = validateReviewAnnotationsResponse({
      ok: true,
      annotations: [
        {
          matchId: "match_001",
          title: "中风险表达",
          reason: "该表达较绝对，可能降低平台审核通过率。",
          suggestion: "建议改成更可验证、不过度承诺的表达。",
          alternatives: ["比较", "相对", "更容易"]
        }
      ]
    });

    expect(result.annotations[0]?.title).toBe("中风险表达");
  });
});
