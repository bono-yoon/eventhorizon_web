import { NextResponse } from "next/server";

export async function GET() {
  const kakaoMapJsKey = String(
    process.env.KAKAO_MAP_JS_KEY ||
      process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ||
      ""
  ).trim();

  return NextResponse.json({
    kakaoMapJsKey,
    hasKakaoMapJsKey: Boolean(kakaoMapJsKey),
  });
}
