import { afterEach, describe, expect, it } from "vitest";
import { requestRewrite } from "@/lib/quality/ai";

const originalEnv = { ...process.env };

describe("AI rewrite agent", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("requires AI_AGENT_REWRITE configuration", async () => {
    delete process.env.AI_AGENT_REWRITE_BASE_URL;
    delete process.env.AI_AGENT_REWRITE_API_KEY;
    delete process.env.AI_AGENT_REWRITE_MODEL;

    await expect(
      requestRewrite("我是第一名", "xiaohongshu", "simplified", [], [])
    ).rejects.toThrow("AI_AGENT_REWRITE");
  });
});
