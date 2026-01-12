"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "w-full max-w-[calc(100vw-32px)] sm:max-w-[360px] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border bg-white border-[#e8dfd3]",
          title: "text-sm font-medium text-[#1a1a1a]",
          description: "text-sm text-[#6b6b6b]",
          success:
            "bg-white border-emerald-200 [&>svg]:text-emerald-500",
          error:
            "bg-white border-red-200 [&>svg]:text-red-500",
          actionButton:
            "bg-[#c45c3e] text-white text-sm font-medium px-3 py-1.5 rounded-lg",
          cancelButton:
            "bg-[#f3ede4] text-[#1a1a1a] text-sm font-medium px-3 py-1.5 rounded-lg",
        },
      }}
      // Mobile-optimized settings
      expand={false}
      richColors
      closeButton={false}
      duration={3000}
      gap={8}
      offset={16}
      visibleToasts={1}
    />
  );
}
