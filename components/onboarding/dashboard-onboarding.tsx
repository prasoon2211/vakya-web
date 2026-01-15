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

interface DashboardOnboardingProps {
  open: boolean;
  onComplete: () => void;
  targetLanguage: string;
}

export function DashboardOnboarding({ open, onComplete, targetLanguage }: DashboardOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 2;

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

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogTitle className="sr-only">Getting Started</DialogTitle>

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
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#1a1a1a] mb-4">
                What you can do here
              </h2>

              <div className="space-y-3 sm:space-y-4">
                <div className="flex gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#c45c3e]/10 flex items-center justify-center flex-shrink-0 text-sm sm:text-base">
                    📖
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#1a1a1a] text-sm sm:text-base">Read articles in {targetLanguage}</p>
                    <p className="text-xs sm:text-sm text-[#6b6b6b]">
                      Paste any URL. Works with English articles or {targetLanguage} articles you want simplified.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#2d5a47]/10 flex items-center justify-center flex-shrink-0 text-sm sm:text-base">
                    💾
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#1a1a1a] text-sm sm:text-base">Build your vocabulary</p>
                    <p className="text-xs sm:text-sm text-[#6b6b6b]">Click any word to save it. Practice with flashcards later.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0 text-sm sm:text-base">
                    🎧
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#1a1a1a] text-sm sm:text-base">Listen with audio</p>
                    <p className="text-xs sm:text-sm text-[#6b6b6b]">Generate audio and follow along in Reading Mode.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#1a1a1a] mb-4">
                How it works
              </h2>

              <p className="text-[#6b6b6b] text-sm mb-3">
                Say you paste an article with this sentence:
              </p>

              <div className="space-y-2 sm:space-y-3">
                <div className="p-2.5 sm:p-3 rounded-lg border-2 border-[#d4c5b5] bg-[#faf8f5]">
                  <p className="font-semibold text-[#6b6b6b] text-xs mb-1">Original</p>
                  <p className="text-sm text-[#3d3d3d] italic">&ldquo;The canine was observed traversing the recreational area.&rdquo;</p>
                </div>

                <p className="text-[#6b6b6b] text-sm">
                  We simplify and translate it for you:
                </p>

                <div className="p-2.5 sm:p-3 rounded-lg border-2 border-[#c45c3e] bg-[#c45c3e]/5">
                  <p className="font-semibold text-[#c45c3e] text-xs mb-1">{targetLanguage}</p>
                  <p className="text-sm text-[#1a1a1a] italic">&ldquo;{targetLanguage === "Spanish" ? "El perro corre en el parque." : targetLanguage === "French" ? "Le chien court dans le parc." : "Der Hund läuft im Park."}&rdquo;</p>
                </div>

                <p className="text-[#6b6b6b] text-sm">
                  Stuck on a word? Check the English translation:
                </p>

                <div className="p-2.5 sm:p-3 rounded-lg border-2 border-blue-400 bg-blue-50">
                  <p className="font-semibold text-blue-600 text-xs mb-1">English</p>
                  <p className="text-sm text-[#1a1a1a] italic">&ldquo;The dog runs in the park.&rdquo;</p>
                </div>

                <p className="text-xs text-[#9a9a9a] mt-2">
                  Switch between these views using the tabs.
                </p>
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
                  "Got it"
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
