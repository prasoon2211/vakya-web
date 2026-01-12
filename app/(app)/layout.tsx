import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { isEmailAllowed } from "@/lib/config/allowlist";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;

  if (!isEmailAllowed(email)) {
    redirect("/not-authorized");
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pb-20 md:pb-0">{children}</main>
      <MobileNav />
    </div>
  );
}
