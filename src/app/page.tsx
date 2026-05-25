import { redirect } from "next/navigation";
import { getCurrentSessionClaims } from "@/lib/auth";

export default async function HomePage() {
  const claims = await getCurrentSessionClaims();
  redirect(claims ? "/dashboard" : "/login");
}
