import { getDbHealth, syncIngestIntoStore } from "@/lib/ingest";
import { jsonOk } from "@/lib/api";
import { dbEnabled } from "@/lib/db";

export async function GET() {
  const health = await getDbHealth();
  if (dbEnabled() && health.ok) {
    await syncIngestIntoStore(undefined, true);
  }
  return jsonOk({
    app: "ok",
    dbEnabled: dbEnabled(),
    db: health,
  });
}
