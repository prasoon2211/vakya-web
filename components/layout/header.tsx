"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { BookOpen, Home, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/vocabulary", label: "Vocabulary", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Header() {
  const pathname = usePathname();

  // Hide header on article pages on mobile - article has its own header
  const isArticlePage = pathname.startsWith("/article/");

  return (
    <header className={cn(
      "sticky top-0 z-50 bg-[#faf7f2]/90 backdrop-blur-md border-b border-[#e8dfd3]",
      isArticlePage && "hidden md:block"
    )}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 sm:gap-3 group">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#c45c3e] flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
            <span className="font-serif text-lg sm:text-xl font-bold text-white">V</span>
          </div>
          <span className="text-lg sm:text-xl font-semibold text-[#1a1a1a]">Vakya</span>
        </Link>

        {/* Desktop Navigation */}
        <SignedIn>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                    isActive
                      ? "text-[#c45c3e] bg-[#c45c3e]/10"
                      : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f3ede4]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SignedIn>

        {/* Right Side */}
        <div className="flex items-center gap-3 sm:gap-4">
          <SignedOut>
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Get Started</Button>
            </Link>
          </SignedOut>

          <SignedIn>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8 sm:h-9 sm:w-9 ring-2 ring-[#e8dfd3] ring-offset-2 ring-offset-[#faf7f2]",
                },
              }}
            />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
