import { toast as sonnerToast } from "sonner";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "success" | "error";
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function toast({
  title,
  description,
  variant = "default",
  duration,
  action,
}: ToastOptions) {
  const options = {
    description,
    duration,
    action: action
      ? {
          label: action.label,
          onClick: action.onClick,
        }
      : undefined,
  };

  switch (variant) {
    case "success":
      return sonnerToast.success(title || "Success", options);
    case "error":
      return sonnerToast.error(title || "Error", options);
    default:
      return sonnerToast(title || "", options);
  }
}

// For components that use the hook pattern
export function useToast() {
  return {
    toast,
    dismiss: sonnerToast.dismiss,
  };
}
