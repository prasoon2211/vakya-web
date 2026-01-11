import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-[#1e293b] border border-[var(--border)] shadow-xl",
            headerTitle: "text-[var(--text-primary)]",
            headerSubtitle: "text-[var(--text-muted)]",
            socialButtonsBlockButton: "bg-[var(--card-background)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--card-hover)]",
            formFieldLabel: "text-[var(--text-secondary)]",
            formFieldInput: "bg-[var(--card-background)] border-[var(--border)] text-[var(--text-primary)]",
            footerActionLink: "text-indigo-400 hover:text-indigo-300",
            formButtonPrimary: "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600",
          },
        }}
      />
    </div>
  );
}
