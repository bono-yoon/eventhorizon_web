import { getSession } from "@/lib/auth";
import { jsonOk } from "@/lib/api";
import { effectivePermissions } from "@/lib/permissions";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonOk({ user: null });
  return jsonOk({
    user: { ...user, permissions: effectivePermissions(user) },
  });
}
