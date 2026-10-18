import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-[#DFD9CE] bg-[#FFFEF9] px-3 py-1.5 text-sm text-[#1A1917] placeholder:text-[#8F8B82] shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium focus-visible:outline-hidden focus-visible:border-[#2D5B67] focus-visible:ring-1 focus-visible:ring-[#2D5B67] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-[#DFD9CE] bg-[#FFFEF9] px-3 py-2 text-sm text-[#1A1917] placeholder:text-[#8F8B82] shadow-2xs transition-colors focus-visible:outline-hidden focus-visible:border-[#2D5B67] focus-visible:ring-1 focus-visible:ring-[#2D5B67] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };

export const selectStyle = {
  appearance: "none" as const,
  paddingRight: "2.5rem",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23143F4B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundPosition: "right 0.75rem center",
  backgroundRepeat: "no-repeat",
};
