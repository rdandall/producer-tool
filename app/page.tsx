import { redirect } from "next/navigation";

// Root URL goes straight to the dashboard — no login needed
export default function RootPage() {
  redirect("/dashboard");
}
