import { redirect } from "next/navigation";

export default function RootPage() {
  // Real auth check happens inside the protected pages via AuthGuard.
  redirect("/schedule");
}
