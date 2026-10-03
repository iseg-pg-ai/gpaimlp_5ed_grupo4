import * as React from "react";
import { cn } from "@/lib/utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-[#DFD9CE] bg-[#FFFEF9] px-3 py-2 text-xs text-[#1A1917] placeholder:text-[#8F8B82] shadow-2xs transition-colors focus-visible:outline-hidden focus-visible:border-[#E27151] focus-visible:ring-1 focus-visible:ring-[#E27151] disabled:cursor-not-allowed disabled:opacity-50",
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
