import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Globe, Sparkles, Headphones, BookMarked, ArrowRight, Play } from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "Any article, your level",
    description: "Paste any URL and get it translated at your exact CEFR proficiency level, from A1 to C2.",
  },
  {
    icon: Sparkles,
    title: "Click to understand",
    description: "Tap any word to instantly see translations, grammar breakdowns, and contextual usage.",
  },
  {
    icon: Headphones,
    title: "Listen and learn",
    description: "Generate natural AI audio for any article. Perfect for commutes or workouts.",
  },
  {
    icon: BookMarked,
    title: "Build vocabulary",
    description: "Save words you discover and review them later with spaced repetition.",
  },
];

export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/60 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
              <span className="font-serif text-xl font-bold text-white">V</span>
            </div>
            <span className="text-xl font-semibold text-white">Vakya</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm text-gray-400 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left side - Text */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-100 text-sm mb-8">
                <span className="w-2 h-2 rounded-full bg-indigo-300 animate-pulse"></span>
                Now supporting 20+ languages
              </div>

              <h1 className="font-serif text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                Read what you love.{" "}
                <span className="text-gradient">Learn as you go.</span>
              </h1>

              <p className="text-xl text-gray-400 leading-relaxed mb-10">
                Transform any article into a personalized language lesson.
                Click words for instant meanings, listen with AI audio,
                and watch your vocabulary grow naturally.
              </p>

              <div className="flex flex-wrap gap-4 mb-12">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-base font-semibold text-white hover:from-[#7c83ff] hover:to-[#a08cff] transition-all shadow-lg shadow-indigo-500/25"
                >
                  Start Learning Free
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="#demo"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-white/15 text-base font-medium text-white hover:bg-white/5 transition-all"
                >
                  <Play className="w-5 h-5" />
                  See how it works
                </Link>
              </div>

              <div className="flex gap-10">
                <div>
                  <div className="text-2xl font-bold text-white">20+</div>
                  <div className="text-sm text-gray-500">Languages</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">A1-C2</div>
                  <div className="text-sm text-gray-500">All Levels</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">Free</div>
                  <div className="text-sm text-gray-500">To Start</div>
                </div>
              </div>
            </div>

            {/* Right side - Demo card */}
            <div className="relative">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/60"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/60"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/60"></div>
                  </div>
                  <div className="flex-1 text-center text-xs text-gray-500 font-mono">
                    vakya.app/article
                  </div>
                </div>

                {/* Demo content */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-md bg-indigo-500/15 text-indigo-100 text-xs font-medium">
                      German B1
                    </span>
                    <span className="text-xs text-gray-500">Der Spiegel</span>
                  </div>

                  <p className="font-serif text-2xl text-white leading-relaxed">
                    <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">Die</span>{" "}
                    <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">Sonne</span>{" "}
                    <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">scheint</span>{" "}
                    <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">heute</span>{" "}
                    <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">besonders</span>{" "}
                    <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">hell</span>...
                  </p>

                  <p className="text-sm text-gray-500 italic">
                    &ldquo;The sun shines especially bright today...&rdquo;
                  </p>
                </div>

                {/* Audio player preview */}
                <div className="mt-6 p-4 rounded-xl bg-slate-950/60 border border-white/5">
                  <div className="flex items-center gap-4">
                    <button className="w-10 h-10 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-lg shadow-indigo-500/25">
                      <Play className="w-4 h-4 text-white ml-0.5" />
                    </button>
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="w-1/3 h-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-full"></div>
                    </div>
                    <span className="text-xs text-gray-500 font-mono">0:42</span>
                  </div>
                </div>
              </div>

              {/* Decorative glow */}
              <div className="absolute -inset-4 bg-gradient-to-r from-[#6366f1]/25 via-[#8b5cf6]/20 to-transparent rounded-3xl blur-3xl -z-10"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="w-16 h-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-full mx-auto mb-6"></div>
            <h2 className="font-serif text-4xl lg:text-5xl font-bold text-white mb-6">
              Everything you need to{" "}
              <span className="text-gradient">learn effectively</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Vakya combines intelligent translation, interactive learning, and natural audio
              to create the most effective reading-based language learning experience.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-indigo-400/30 transition-all duration-300"
                >
                  <div className="w-14 h-14 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-5">
                    <Icon className="w-6 h-6 text-indigo-100" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed">
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
          <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-12 backdrop-blur">
            <div className="text-center mb-10">
              <h2 className="font-serif text-3xl lg:text-4xl font-bold text-white mb-4">
                Try it yourself
              </h2>
              <p className="text-gray-400">
                Hover over any word to see its meaning — just like in the real app
              </p>
            </div>

            <div className="p-8 rounded-2xl bg-slate-950/50 border border-white/10">
              <div className="flex items-center gap-3 mb-6">
                <span className="px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-100 text-sm font-medium">
                  German B1
                </span>
                <span className="text-sm text-gray-500">Sample Article</span>
              </div>

              <p className="font-serif text-3xl text-white leading-relaxed mb-6">
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">Die</span>{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">Sonne</span>{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">scheint</span>{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">heute</span>{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">besonders</span>{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">hell</span>.{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">Es</span>{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">ist</span>{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">ein</span>{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">wunderschöner</span>{" "}
                <span className="hover:bg-indigo-500/20 hover:text-indigo-100 px-1 rounded cursor-pointer transition-all">Tag</span>.
              </p>

              <p className="text-gray-500 italic border-l-2 border-amber-500/30 pl-4">
                &ldquo;The sun shines especially bright today. It is a beautiful day.&rdquo;
              </p>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-indigo-100" />
                </div>
                <p className="text-sm text-gray-400">
                  <strong className="text-white">Pro tip:</strong> In the full app, click any word
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
          <div className="rounded-3xl bg-gradient-to-br from-[#6366f1]/15 via-[#8b5cf6]/10 to-transparent border border-indigo-400/30 p-16 text-center backdrop-blur">
            <h2 className="font-serif text-4xl lg:text-5xl font-bold text-white mb-6">
              Start your journey today
            </h2>
            <p className="text-lg text-gray-400 mb-10 max-w-xl mx-auto">
              Join language learners who use Vakya to read content they love
              while building vocabulary naturally. No flashcard grind required.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-lg font-semibold text-white hover:from-[#7c83ff] hover:to-[#a08cff] transition-all shadow-lg shadow-indigo-500/25"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="mt-6 text-sm text-gray-500">
              Free forever for core features. No credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <span className="font-serif text-lg font-bold text-white">V</span>
            </div>
            <span className="font-semibold text-white">Vakya</span>
          </div>
          <p className="text-sm text-gray-500">
            Built with care for language learners everywhere.
          </p>
        </div>
      </footer>
    </div>
  );
}
