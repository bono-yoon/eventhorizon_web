import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  redirect(homePathFor(user));
}
