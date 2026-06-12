import { NextResponse } from "next/server";
import { requestRewrite } from "@/lib/quality/ai";
import { parseRewriteRequest } from "@/lib/quality/validators";

export async function POST(request: Request) {
  try {
    const input = parseRewriteRequest(await request.json());
    const result = await requestRewrite(
      input.originalText,
      input.platform,
      input.targetLanguage,
      input.matches,
      input.annotations
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "改写失败"
      },
      { status: 400 }
    );
  }
}
