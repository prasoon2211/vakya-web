import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Globe, Sparkles, Headphones, BookMarked, ArrowRight, Play, BookOpen, Languages, Pen } from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "Any article, your level",
    description: "Paste any URL and get it translated at your exact CEFR proficiency level, from A1 to C2.",
    accent: "terracotta",
  },
  {
    icon: Sparkles,
    title: "Click to understand",
    description: "Tap any word to instantly see translations, grammar breakdowns, and contextual usage.",
    accent: "forest",
  },
  {
    icon: Headphones,
    title: "Listen and learn",
    description: "Generate natural AI audio for any article. Perfect for commutes or reading along.",
    accent: "inkblue",
  },
  {
    icon: BookMarked,
    title: "Build vocabulary",
    description: "Save words you discover and review them later with spaced repetition.",
    accent: "terracotta",
  },
];

export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#faf7f2] text-[#1a1a1a]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#faf7f2]/80 backdrop-blur-md border-b border-[#e8dfd3]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-[#c45c3e] flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <span className="font-serif text-xl font-bold text-white">V</span>
            </div>
            <span className="text-xl font-semibold text-[#1a1a1a]">Vakya</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors ink-underline"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="px-5 py-2.5 rounded-xl bg-[#1a1a1a] text-sm font-medium text-white hover:bg-[#3d3d3d] transition-all shadow-sm hover:shadow-md"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left side - Text */}
            <div className="opacity-0 animate-fade-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#f3ede4] border border-[#e8dfd3] text-[#6b6b6b] text-sm mb-8">
                <Languages className="w-4 h-4 text-[#c45c3e]" />
                Now supporting 20+ languages
              </div>

              <h1 className="font-serif text-5xl lg:text-6xl font-bold text-[#1a1a1a] leading-[1.1] mb-6">
                Read what you love.{" "}
                <span className="text-gradient">Learn as you go.</span>
              </h1>

              <p className="text-xl text-[#6b6b6b] leading-relaxed mb-10 max-w-lg">
                Transform any article into a personalized language lesson.
                Click words for instant meanings, listen with AI audio,
                and watch your vocabulary grow naturally.
              </p>

              <div className="flex flex-wrap gap-4 mb-12">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#c45c3e] text-base font-semibold text-white hover:bg-[#a34a30] transition-all shadow-md hover:shadow-lg group"
                >
                  Start Learning Free
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  href="#demo"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-[#e8dfd3] text-base font-medium text-[#3d3d3d] hover:bg-[#f3ede4] transition-all"
                >
                  <Play className="w-5 h-5" />
                  See how it works
                </Link>
              </div>

              {/* Stats - horizontal with dividers */}
              <div className="flex items-center gap-8 pt-8 border-t border-[#e8dfd3]">
                <div>
                  <div className="font-serif text-3xl font-bold text-[#1a1a1a]">20+</div>
                  <div className="text-sm text-[#9a9a9a]">Languages</div>
                </div>
                <div className="w-px h-10 bg-[#e8dfd3]"></div>
                <div>
                  <div className="font-serif text-3xl font-bold text-[#1a1a1a]">A1-C2</div>
                  <div className="text-sm text-[#9a9a9a]">All Levels</div>
                </div>
                <div className="w-px h-10 bg-[#e8dfd3]"></div>
                <div>
                  <div className="font-serif text-3xl font-bold text-[#1a1a1a]">Free</div>
                  <div className="text-sm text-[#9a9a9a]">To Start</div>
                </div>
              </div>
            </div>

            {/* Right side - Demo card */}
            <div className="relative opacity-0 animate-fade-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
              <div className="rounded-2xl border border-[#e8dfd3] bg-white p-8 shadow-lg">
                {/* Browser chrome */}
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#f3ede4]">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#c45c3e]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#d4a574]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#2d5a47]"></div>
                  </div>
                  <div className="flex-1 text-center text-xs text-[#9a9a9a] font-mono">
                    vakya.app/article
                  </div>
                </div>

                {/* Demo content */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-md bg-[#2d5a47]/10 text-[#2d5a47] text-xs font-medium border border-[#2d5a47]/20">
                      German B1
                    </span>
                    <span className="text-xs text-[#9a9a9a]">Der Spiegel</span>
                  </div>

                  <p className="font-serif text-2xl text-[#1a1a1a] leading-relaxed">
                    <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">Die</span>{" "}
                    <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">Sonne</span>{" "}
                    <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">scheint</span>{" "}
                    <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">heute</span>{" "}
                    <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">besonders</span>{" "}
                    <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">hell</span>...
                  </p>

                  <p className="text-sm text-[#9a9a9a] italic border-l-2 border-[#c45c3e] pl-4">
                    &ldquo;The sun shines especially bright today...&rdquo;
                  </p>
                </div>

                {/* Audio player preview */}
                <div className="mt-6 p-4 rounded-xl bg-[#faf7f2] border border-[#e8dfd3]">
                  <div className="flex items-center gap-4">
                    <button className="w-10 h-10 rounded-full bg-[#c45c3e] flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                      <Play className="w-4 h-4 text-white ml-0.5" />
                    </button>
                    <div className="flex-1 h-1.5 bg-[#e8dfd3] rounded-full overflow-hidden">
                      <div className="w-1/3 h-full bg-[#c45c3e] rounded-full"></div>
                    </div>
                    <span className="text-xs text-[#9a9a9a] font-mono">0:42</span>
                  </div>
                </div>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-[#c45c3e]/5 rounded-full blur-2xl -z-10"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-[#2d5a47]/5 rounded-full blur-2xl -z-10"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 bg-white border-y border-[#e8dfd3]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="decorative-rule mx-auto mb-6"></div>
            <h2 className="font-serif text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-6">
              Everything you need to{" "}
              <span className="text-gradient">learn effectively</span>
            </h2>
            <p className="text-lg text-[#6b6b6b] max-w-2xl mx-auto">
              Vakya combines intelligent translation, interactive learning, and natural audio
              to create the most effective reading-based language learning experience.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const accentColors: Record<string, { bg: string; icon: string; border: string }> = {
                terracotta: { bg: 'bg-[#c45c3e]/10', icon: 'text-[#c45c3e]', border: 'hover:border-[#c45c3e]/30' },
                forest: { bg: 'bg-[#2d5a47]/10', icon: 'text-[#2d5a47]', border: 'hover:border-[#2d5a47]/30' },
                inkblue: { bg: 'bg-[#2c4a6e]/10', icon: 'text-[#2c4a6e]', border: 'hover:border-[#2c4a6e]/30' },
              };
              const colors = accentColors[feature.accent];

              return (
                <div
                  key={feature.title}
                  className={`p-8 rounded-2xl bg-[#faf7f2] border border-[#e8dfd3] ${colors.border} hover:shadow-md transition-all duration-300 opacity-0 animate-fade-up`}
                  style={{ animationDelay: `${0.1 * (index + 1)}s`, animationFillMode: 'forwards' }}
                >
                  <div className={`w-14 h-14 rounded-xl ${colors.bg} flex items-center justify-center mb-5`}>
                    <Icon className={`w-6 h-6 ${colors.icon}`} />
                  </div>
                  <h3 className="font-serif text-xl font-semibold text-[#1a1a1a] mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-[#6b6b6b] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl border border-[#e8dfd3] bg-white p-12 shadow-lg">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#c45c3e]/10 mb-6">
                <Pen className="w-7 h-7 text-[#c45c3e]" />
              </div>
              <h2 className="font-serif text-3xl lg:text-4xl font-bold text-[#1a1a1a] mb-4">
                Try it yourself
              </h2>
              <p className="text-[#6b6b6b]">
                Hover over any word to see the interaction — just like in the real app
              </p>
            </div>

            <div className="p-8 rounded-2xl bg-[#faf7f2] border border-[#e8dfd3]">
              <div className="flex items-center gap-3 mb-6">
                <span className="px-3 py-1.5 rounded-lg bg-[#2d5a47]/10 text-[#2d5a47] text-sm font-medium border border-[#2d5a47]/20">
                  German B1
                </span>
                <span className="text-sm text-[#9a9a9a]">Sample Article</span>
              </div>

              <p className="font-serif text-3xl text-[#1a1a1a] leading-relaxed mb-6">
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">Die</span>{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">Sonne</span>{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">scheint</span>{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">heute</span>{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">besonders</span>{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">hell</span>.{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">Es</span>{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">ist</span>{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">ein</span>{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">wunderschöner</span>{" "}
                <span className="hover:bg-[#c45c3e]/10 hover:text-[#a34a30] px-1 rounded cursor-pointer transition-all">Tag</span>.
              </p>

              <p className="text-[#6b6b6b] italic border-l-2 border-[#c45c3e] pl-4">
                &ldquo;The sun shines especially bright today. It is a beautiful day.&rdquo;
              </p>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-[#2d5a47]/5 border border-[#2d5a47]/10">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-[#2d5a47]/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-[#2d5a47]" />
                </div>
                <p className="text-sm text-[#6b6b6b]">
                  <strong className="text-[#1a1a1a]">Pro tip:</strong> In the full app, click any word
                  to save it to your vocabulary list for spaced repetition review.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl bg-[#1a1a1a] p-16 text-center relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-[#c45c3e]/20 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-[#2d5a47]/20 rounded-full blur-3xl"></div>

            <div className="relative">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-8">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <h2 className="font-serif text-4xl lg:text-5xl font-bold text-white mb-6">
                Start your journey today
              </h2>
              <p className="text-lg text-white/70 mb-10 max-w-xl mx-auto">
                Join language learners who use Vakya to read content they love
                while building vocabulary naturally. No flashcard grind required.
              </p>
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-white text-lg font-semibold text-[#1a1a1a] hover:bg-[#f3ede4] transition-all shadow-lg group"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <p className="mt-6 text-sm text-white/50">
                Free forever for core features. No credit card required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e8dfd3] py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#c45c3e] flex items-center justify-center">
              <span className="font-serif text-lg font-bold text-white">V</span>
            </div>
            <span className="font-semibold text-[#1a1a1a]">Vakya</span>
          </div>
          <p className="text-sm text-[#9a9a9a]">
            Built with care for language learners everywhere.
          </p>
        </div>
      </footer>
    </div>
  );
}
