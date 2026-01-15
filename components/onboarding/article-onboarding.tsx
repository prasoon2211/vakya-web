"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ArticleOnboardingProps {
  open: boolean;
  onComplete: () => void;
  targetLanguage: string;
}

export function ArticleOnboarding({ open, onComplete, targetLanguage }: ArticleOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 3;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  // Example text based on target language
  const examples: Record<string, { target: string; english: string; source: string }> = {
    German: {
      target: "Der Hund läuft im Park.",
      english: "The dog runs in the park.",
      source: "The canine was observed traversing the recreational area.",
    },
    Spanish: {
      target: "El perro corre en el parque.",
      english: "The dog runs in the park.",
      source: "The canine was observed traversing the recreational area.",
    },
    French: {
      target: "Le chien court dans le parc.",
      english: "The dog runs in the park.",
      source: "The canine was observed traversing the recreational area.",
    },
  };

  const example = examples[targetLanguage] || examples.German;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogTitle className="sr-only">Reading Guide</DialogTitle>

        {/* Progress bar */}
        <div className="h-1 bg-[#f3ede4] sticky top-0">
          <div
            className="h-full bg-[#c45c3e] transition-all duration-300"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="p-5 sm:p-8">
          {currentStep === 0 && (
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#1a1a1a] mb-3">
                How we transform articles
              </h2>

              <p className="text-[#6b6b6b] text-sm mb-3">
                Say the original article says:
              </p>

              <div className="space-y-2">
                <div className="rounded-lg border-2 border-[#d4c5b5] bg-[#faf8f5] p-2.5 sm:p-3">
                  <p className="font-semibold text-[#6b6b6b] text-xs mb-1">Original</p>
                  <p className="text-[#1a1a1a] text-sm italic">&ldquo;{example.source}&rdquo;</p>
                </div>

                <p className="text-[#6b6b6b] text-sm">
                  We simplify and translate it:
                </p>

                <div className="rounded-lg border-2 border-[#c45c3e] bg-[#c45c3e]/5 p-2.5 sm:p-3">
                  <p className="font-semibold text-[#c45c3e] text-xs mb-1">{targetLanguage}</p>
                  <p className="text-[#1a1a1a] text-sm italic">&ldquo;{example.target}&rdquo;</p>
                </div>

                <p className="text-[#6b6b6b] text-sm">
                  Stuck on a word? Check the English:
                </p>

                <div className="rounded-lg border-2 border-blue-400 bg-blue-50 p-2.5 sm:p-3">
                  <p className="font-semibold text-blue-600 text-xs mb-1">English</p>
                  <p className="text-[#1a1a1a] text-sm italic">&ldquo;{example.english}&rdquo;</p>
                </div>

                <p className="text-xs text-[#9a9a9a] mt-2">
                  Switch between these views using the tabs.
                </p>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#1a1a1a] mb-3">
                Click words to save them
              </h2>
              <p className="text-[#6b6b6b] text-sm mb-3">
                Don&apos;t know a word? Click it.
              </p>

              <div className="bg-[#faf8f5] rounded-lg p-3 sm:p-4 mb-3">
                <p className="text-base sm:text-lg text-[#1a1a1a] leading-relaxed">
                  Der{" "}
                  <span className="bg-[#c45c3e]/20 px-1.5 py-0.5 rounded border-b-2 border-[#c45c3e] cursor-pointer">
                    Hund
                  </span>{" "}
                  läuft im Park.
                </p>
              </div>

              <div className="bg-white border-2 border-[#e8dfd3] rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-bold text-[#1a1a1a]">Hund</span>
                  <span className="text-xs bg-[#f3ede4] px-2 py-0.5 rounded text-[#6b6b6b]">noun, der</span>
                </div>
                <p className="text-[#3d3d3d]">dog</p>
              </div>

              <p className="text-xs sm:text-sm text-[#6b6b6b] mt-3">
                Saved words appear in your Vocabulary tab.
              </p>
            </div>
          )}

          {currentStep === 2 && (
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#1a1a1a] mb-3">
                Audio & Reading Mode
              </h2>
              <p className="text-[#6b6b6b] text-sm mb-3">
                At the bottom of each article:
              </p>

              <div className="space-y-2 sm:space-y-3">
                <div className="flex gap-3 p-2.5 sm:p-3 bg-[#faf8f5] rounded-lg">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#c45c3e] text-white flex items-center justify-center text-sm sm:text-lg flex-shrink-0">▶</div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#1a1a1a] text-sm">Generate Audio</p>
                    <p className="text-xs sm:text-sm text-[#6b6b6b]">Click to create audio. Play/pause with Space.</p>
                  </div>
                </div>

                <div className="flex gap-3 p-2.5 sm:p-3 bg-[#faf8f5] rounded-lg">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#2d5a47] text-white flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">Aa</div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#1a1a1a] text-sm">Reading Mode</p>
                    <p className="text-xs sm:text-sm text-[#6b6b6b]">Words highlight as they&apos;re spoken.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 sm:mt-8">
            <button
              onClick={handleSkip}
              className="text-sm text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors px-1 focus:outline-none"
            >
              Skip
            </button>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                {Array.from({ length: totalSteps }).map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      index === currentStep ? "bg-[#c45c3e]" : "bg-[#e8dfd3]"
                    )}
                  />
                ))}
              </div>
              <Button onClick={handleNext} size="sm" className="sm:size-default">
                {currentStep === totalSteps - 1 ? (
                  "Start reading"
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
