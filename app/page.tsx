import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles, Volume2 } from "lucide-react";

export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#fffbf5] text-[#2d2a26] overflow-x-hidden">
      {/* Subtle grain texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03] z-50"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#fffbf5]/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-[#c45c3e] flex items-center justify-center transform group-hover:rotate-[-4deg] transition-transform">
              <span className="font-serif text-lg font-bold text-white">V</span>
            </div>
            <span className="text-lg font-medium text-[#2d2a26]">Vakya</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/sign-in"
              className="text-sm text-[#6b6560] hover:text-[#2d2a26] transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-2 rounded-lg bg-[#2d2a26] text-sm font-medium text-[#fffbf5] hover:bg-[#1a1816] transition-colors"
            >
              Start reading
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative">
        {/* Decorative blob */}
        <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-[#c45c3e]/[0.07] rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#2d5a47]/[0.05] rounded-full blur-3xl -z-10" />

        <div className="max-w-5xl mx-auto">
          <div className="max-w-3xl">
            {/* Handwritten-style label */}
            <div className="inline-block mb-8 opacity-0 animate-fade-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
              <span className="text-[#c45c3e] text-sm tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                for the curious reader
              </span>
            </div>

            <h1
              className="font-serif text-5xl sm:text-6xl lg:text-7xl font-normal text-[#2d2a26] leading-[1.1] mb-8 opacity-0 animate-fade-up"
              style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}
            >
              Read the world.{" "}
              <span className="relative inline-block">
                <span className="relative z-10">Word by word.</span>
                <svg className="absolute -bottom-2 left-0 w-full h-3 text-[#c45c3e]/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                  <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                </svg>
              </span>
            </h1>

            <p
              className="text-xl text-[#6b6560] leading-relaxed mb-10 max-w-xl opacity-0 animate-fade-up"
              style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}
            >
              Paste any article. Get it translated to your level.
              Click any word to understand it. That&apos;s it — language learning
              that fits into the reading you already love.
            </p>

            <div
              className="flex flex-wrap items-center gap-4 mb-16 opacity-0 animate-fade-up"
              style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}
            >
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#c45c3e] text-base font-medium text-white hover:bg-[#a84832] transition-all shadow-sm hover:shadow-md group"
              >
                Start learning free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <span className="text-sm text-[#9a9590]">No credit card needed</span>
            </div>
          </div>

          {/* Language cards - featuring our 3 languages with personality */}
          <div
            className="grid sm:grid-cols-3 gap-4 opacity-0 animate-fade-up"
            style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}
          >
            {/* German */}
            <div className="group p-6 rounded-2xl bg-white border border-[#e8e4dd] hover:border-[#c45c3e]/30 hover:shadow-lg transition-all duration-300 cursor-default">
              <div className="text-3xl mb-3">🇩🇪</div>
              <h3 className="font-serif text-xl text-[#2d2a26] mb-1">Deutsch</h3>
              <p className="text-sm text-[#9a9590] leading-relaxed">
                From Kafka to Der Spiegel — tackle compound words with confidence
              </p>
              <div className="mt-4 pt-4 border-t border-[#f3f0eb]">
                <p className="font-serif text-[#6b6560] italic text-sm">&ldquo;Wanderlust, Zeitgeist, Gemütlichkeit...&rdquo;</p>
              </div>
            </div>

            {/* Spanish */}
            <div className="group p-6 rounded-2xl bg-white border border-[#e8e4dd] hover:border-[#2d5a47]/30 hover:shadow-lg transition-all duration-300 cursor-default">
              <div className="text-3xl mb-3">🇪🇸</div>
              <h3 className="font-serif text-xl text-[#2d2a26] mb-1">Español</h3>
              <p className="text-sm text-[#9a9590] leading-relaxed">
                From García Márquez to El País — navigate subjunctive with ease
              </p>
              <div className="mt-4 pt-4 border-t border-[#f3f0eb]">
                <p className="font-serif text-[#6b6560] italic text-sm">&ldquo;Sobremesa, madrugada, estrenar...&rdquo;</p>
              </div>
            </div>

            {/* French */}
            <div className="group p-6 rounded-2xl bg-white border border-[#e8e4dd] hover:border-[#2c4a6e]/30 hover:shadow-lg transition-all duration-300 cursor-default">
              <div className="text-3xl mb-3">🇫🇷</div>
              <h3 className="font-serif text-xl text-[#2d2a26] mb-1">Français</h3>
              <p className="text-sm text-[#9a9590] leading-relaxed">
                From Camus to Le Monde — master liaisons and faux amis
              </p>
              <div className="mt-4 pt-4 border-t border-[#f3f0eb]">
                <p className="font-serif text-[#6b6560] italic text-sm">&ldquo;Dépaysement, flâner, retrouvailles...&rdquo;</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works - more intimate, less corporate */}
      <section className="py-24 px-6 bg-[#2d2a26] text-[#fffbf5] relative overflow-hidden">
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />

        <div className="max-w-5xl mx-auto relative">
          <div className="max-w-xl mb-16">
            <span className="text-[#c45c3e] text-sm tracking-wide mb-4 block" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
              how it works
            </span>
            <h2 className="font-serif text-4xl lg:text-5xl font-normal leading-tight">
              Three steps to reading fluency
            </h2>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
            <div className="relative">
              <div className="text-7xl font-serif text-[#c45c3e]/20 absolute -top-4 -left-2">1</div>
              <div className="relative pt-8">
                <h3 className="font-serif text-xl mb-3">Paste any article</h3>
                <p className="text-[#a8a5a0] leading-relaxed">
                  News, blogs, Wikipedia — if it&apos;s on the web, you can learn from it.
                  We extract the content and prepare it for you.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="text-7xl font-serif text-[#c45c3e]/20 absolute -top-4 -left-2">2</div>
              <div className="relative pt-8">
                <h3 className="font-serif text-xl mb-3">Choose your level</h3>
                <p className="text-[#a8a5a0] leading-relaxed">
                  A1 beginner to C2 native — we rewrite the article to match your proficiency.
                  The same story, adapted for where you are.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="text-7xl font-serif text-[#c45c3e]/20 absolute -top-4 -left-2">3</div>
              <div className="relative pt-8">
                <h3 className="font-serif text-xl mb-3">Read and discover</h3>
                <p className="text-[#a8a5a0] leading-relaxed">
                  Click any word for instant meaning. Save words you want to remember.
                  Listen with natural AI audio. Learn as you go.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-[#c45c3e] text-sm tracking-wide mb-4 block" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
              try it yourself
            </span>
            <h2 className="font-serif text-3xl lg:text-4xl text-[#2d2a26]">
              Hover over any word
            </h2>
          </div>

          {/* Demo card - styled like a reading page */}
          <div className="rounded-2xl bg-white border border-[#e8e4dd] shadow-xl overflow-hidden">
            {/* Article header */}
            <div className="px-8 py-5 border-b border-[#f3f0eb] flex items-center justify-between bg-[#faf8f5]">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-md bg-[#2d5a47]/10 text-[#2d5a47] text-xs font-medium">
                  German · B1
                </span>
                <span className="text-sm text-[#9a9590]">Der Spiegel</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-lg hover:bg-[#f3f0eb] transition-colors">
                  <Volume2 className="w-4 h-4 text-[#6b6560]" />
                </button>
                <button className="p-2 rounded-lg hover:bg-[#f3f0eb] transition-colors">
                  <BookOpen className="w-4 h-4 text-[#6b6560]" />
                </button>
              </div>
            </div>

            {/* Article content */}
            <div className="p-8 lg:p-12">
              <p className="font-serif text-2xl lg:text-3xl text-[#2d2a26] leading-relaxed mb-6">
                {["Die", "Sonne", "scheint", "heute", "besonders", "hell"].map((word, i) => (
                  <span
                    key={i}
                    className="hover:bg-[#c45c3e]/10 hover:text-[#a84832] px-1 py-0.5 rounded cursor-pointer transition-all duration-150 inline-block"
                  >
                    {word}
                  </span>
                ))}{". "}
                {["Es", "ist", "ein", "wunderschöner", "Tag", "zum", "Spazierengehen"].map((word, i) => (
                  <span
                    key={i}
                    className="hover:bg-[#c45c3e]/10 hover:text-[#a84832] px-1 py-0.5 rounded cursor-pointer transition-all duration-150 inline-block"
                  >
                    {word}
                  </span>
                ))}{"."}
              </p>

              <div className="flex items-start gap-3 text-[#6b6560]">
                <div className="w-1 h-full min-h-[3rem] bg-[#c45c3e]/30 rounded-full flex-shrink-0" />
                <p className="italic leading-relaxed">
                  &ldquo;The sun shines especially bright today. It is a beautiful day for a walk.&rdquo;
                </p>
              </div>
            </div>

            {/* Word tooltip preview */}
            <div className="mx-8 mb-8 p-5 rounded-xl bg-[#2d2a26] text-white">
              <div className="flex items-start gap-4">
                <Sparkles className="w-5 h-5 text-[#c45c3e] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-serif text-lg">wunderschön</span>
                    <span className="text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded">adjective</span>
                  </div>
                  <p className="text-white/70 text-sm mb-2">beautiful, wonderful, gorgeous</p>
                  <p className="text-white/50 text-xs italic">&ldquo;wunder&rdquo; (miracle) + &ldquo;schön&rdquo; (beautiful)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features - more personal, less checkbox */}
      <section className="py-24 px-6 bg-[#f8f5f0]">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-[#c45c3e] text-sm tracking-wide mb-4 block" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                built for learners
              </span>
              <h2 className="font-serif text-3xl lg:text-4xl text-[#2d2a26] mb-6 leading-tight">
                Every word you meet becomes a word you know
              </h2>
              <p className="text-[#6b6560] leading-relaxed mb-8">
                Vakya isn&apos;t about grinding flashcards. It&apos;s about reading things you actually
                care about, and learning naturally along the way. Like picking up words
                from a conversation, but at your own pace.
              </p>
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 text-[#c45c3e] font-medium hover:gap-3 transition-all"
              >
                Start your first article
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="space-y-4">
              {[
                { title: "Smart translations", desc: "Adapted to your CEFR level — A1 to C2" },
                { title: "One-click meanings", desc: "Instant word lookups with context" },
                { title: "Natural audio", desc: "AI voices that sound like native speakers" },
                { title: "Vocabulary builder", desc: "Save words and review with spaced repetition" },
              ].map((feature, i) => (
                <div
                  key={feature.title}
                  className="p-5 rounded-xl bg-white border border-[#e8e4dd] hover:border-[#c45c3e]/30 hover:shadow-md transition-all duration-300"
                >
                  <h3 className="font-medium text-[#2d2a26] mb-1">{feature.title}</h3>
                  <p className="text-sm text-[#9a9590]">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block mb-8">
            <div className="w-16 h-16 rounded-2xl bg-[#c45c3e]/10 flex items-center justify-center mx-auto">
              <BookOpen className="w-7 h-7 text-[#c45c3e]" />
            </div>
          </div>

          <h2 className="font-serif text-4xl lg:text-5xl text-[#2d2a26] mb-6 leading-tight">
            Your next article is waiting
          </h2>
          <p className="text-lg text-[#6b6560] mb-10 max-w-xl mx-auto">
            Start reading in German, Spanish, or French today.
            Paste your first article and see how natural language learning can be.
          </p>

          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#2d2a26] text-base font-medium text-white hover:bg-[#1a1816] transition-all shadow-md hover:shadow-lg group"
          >
            Get started free
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <p className="mt-6 text-sm text-[#9a9590]">
            Free forever for core features
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e8e4dd] py-10 px-6 bg-[#faf8f5]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#c45c3e] flex items-center justify-center">
              <span className="font-serif text-sm font-bold text-white">V</span>
            </div>
            <span className="font-medium text-[#2d2a26]">Vakya</span>
          </div>
          <p className="text-sm text-[#9a9590]">
            Made for language lovers, by language lovers
          </p>
        </div>
      </footer>
    </div>
  );
}
