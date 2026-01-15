import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/admin";
import { isEmailAllowed } from "@/lib/config/allowlist";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;

  // First check allowlist
  if (!(await isEmailAllowed(email))) {
    redirect("/not-authorized");
  }

  // Then check admin status
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Admin Header */}
      <header className="sticky top-0 z-50 border-b border-[#e8dfd3] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="p-2 -ml-2 text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors rounded-lg hover:bg-[#f3ede4]"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#c45c3e]" />
                <h1 className="text-lg font-semibold text-[#1a1a1a]">
                  Admin
                </h1>
              </div>
            </div>
            <span className="text-sm text-[#6b6b6b]">{email}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
