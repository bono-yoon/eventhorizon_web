import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/auth";
import { LoginForm } from "../components/LoginForm";

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(homePathFor(user));

  return <LoginForm />;
}
