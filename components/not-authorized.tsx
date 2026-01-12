import { SignOutButton } from "@clerk/nextjs";
import { Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotAuthorized() {
  return (
    <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#c45c3e]/10 flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-[#c45c3e]" />
        </div>

        <h1 className="font-serif text-2xl font-bold text-[#1a1a1a] mb-3">
          Access Restricted
        </h1>

        <p className="text-[#6b6b6b] mb-8 leading-relaxed">
          Vakya is currently in private beta. If you&apos;d like access, please reach out to the team.
        </p>

        <a
          href="mailto:prasoon2211@gmail.com?subject=Vakya%20Access%20Request"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#c45c3e] text-white rounded-xl font-medium hover:bg-[#b35537] transition-colors"
        >
          <Mail className="w-4 h-4" />
          Request Access
        </a>

        <div className="mt-8 pt-6 border-t border-[#e8dfd3]">
          <SignOutButton>
            <button className="text-sm text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors">
              Sign out and use a different account
            </button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
