import { NextResponse } from "next/server";
import { requestAiCheck, requestReviewAnnotations } from "@/lib/quality/ai";
import { buildLocalCheckResult } from "@/lib/quality/lexicon";
import { parseCheckRequest } from "@/lib/quality/validators";

export async function POST(request: Request) {
  try {
    const input = parseCheckRequest(await request.json());

    try {
      return NextResponse.json(await requestAiCheck(input));
    } catch {
      // AI 检测失败时保留第一版可用性，回落到本地词库检测与批注。
    }

    const localResult = buildLocalCheckResult(
      input.text,
      input.platform,
      input.enabledLexicons
    );

    try {
      const annotations = await requestReviewAnnotations(
        localResult,
        input.platform
      );
      return NextResponse.json({ ...localResult, annotations });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "AI 检测建议返回格式错误",
          localResult
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "请求参数错误"
      },
      { status: 400 }
    );
  }
}
