import { NextResponse } from "next/server";
import { requestReviewAnnotations } from "@/lib/quality/ai";
import { buildLocalCheckResult } from "@/lib/quality/lexicon";
import { parseCheckRequest } from "@/lib/quality/validators";

export async function POST(request: Request) {
  try {
    const input = parseCheckRequest(await request.json());
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
