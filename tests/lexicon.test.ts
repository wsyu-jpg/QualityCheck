import { describe, expect, it } from "vitest";
import {
  buildLocalCheckResult,
  detectMatches,
  getLexiconEntries
} from "@/lib/quality/lexicon";

describe("local lexicon detection", () => {
  it("merges base and platform lexicons", () => {
    const entries = getLexiconEntries("xiaohongshu", ["general", "sensitive"]);
    expect(entries.some((entry) => entry.term === "绝对")).toBe(true);
    expect(entries.some((entry) => entry.term === "全网最低")).toBe(true);
    expect(entries.some((entry) => entry.term === "点击领取")).toBe(false);
  });

  it("keeps exact offsets for highlighted matches", () => {
    const text = "这款产品保证是全网最低，闭眼入。";
    const matches = detectMatches(text, "xiaohongshu", [
      "general",
      "xiaohongshu"
    ]);

    expect(matches.map((match) => text.slice(match.start, match.end))).toEqual([
      "保证",
      "全网最低",
      "闭眼入"
    ]);
  });

  it("builds summary counts and risk level", () => {
    const result = buildLocalCheckResult("保证最有效，永久改善。", "wechat", [
      "general",
      "sensitive"
    ]);

    expect(result.summary.riskLevel).toBe("high");
    expect(result.summary.violationCount).toBeGreaterThan(0);
    expect(result.annotations).toHaveLength(result.matches.length);
  });
});
