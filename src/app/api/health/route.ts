import { getDbHealth } from "@/lib/ingest";
import { jsonOk } from "@/lib/api";
import { dbEnabled } from "@/lib/db";

/** ALB/ECS 헬스체크용. ingest 동기화는 하지 않는다. */
export async function GET() {
  const db = await getDbHealth();
  const ok = dbEnabled() && db.ok;
  return jsonOk(
    {
      ok,
      app: "ok",
      dbEnabled: dbEnabled(),
      db,
    },
    { status: ok ? 200 : 503 }
  );
}
