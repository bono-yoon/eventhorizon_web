import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AWS/컨테이너 배포용 최소 산출물. 로컬 next start 도 동일 경로를 쓴다.
  output: "standalone",
  // dev(.next-dev)와 build(.next) 캐시 분리 — 동시에 돌릴 때 ENOENT 방지
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
