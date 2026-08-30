import { logout } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

export async function POST() {
  await logout();
  return jsonOk({ ok: true });
}
