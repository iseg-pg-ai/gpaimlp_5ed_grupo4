"use client";

import * as React from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type PromptInputProps = React.FormHTMLAttributes<HTMLFormElement>;

export const PromptInput = React.forwardRef<HTMLFormElement, PromptInputProps>(
  ({ className, onSubmit, children, ...props }, ref) => {
    const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (onSubmit) (onSubmit as (e: React.FormEvent<HTMLFormElement>) => void)(e);
    };

    return (
      <form
        ref={ref}
        onSubmit={handleFormSubmit}
        className={cn(
          "relative flex flex-col rounded-xl border border-[#DFD9CE] bg-white shadow-2xs focus-within:border-[#E27151] focus-within:ring-1 focus-within:ring-[#E27151] transition-all",
          className,
        )}
        {...props}
      >
        {children}
      </form>
    );
  },
);
PromptInput.displayName = "PromptInput";

export const PromptInputBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn("relative flex items-center p-1.5", className)} {...props}>
      {children}
    </div>
  );
};
PromptInputBody.displayName = "PromptInputBody";

interface PromptInputTextareaProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onEnterSubmit?: () => void;
}

export const PromptInputTextarea = React.forwardRef<HTMLInputElement, PromptInputTextareaProps>(
  ({ className, onKeyDown, onEnterSubmit, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (onEnterSubmit) {
          onEnterSubmit();
        }
      }
      if (onKeyDown) onKeyDown(e);
    };

    return (
      <input
        ref={ref}
        type="text"
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full bg-transparent px-2.5 py-1.5 text-xs text-[#1A1917] placeholder:text-[#8F8B82] focus:outline-hidden",
          className,
        )}
        {...props}
      />
    );
  },
);
PromptInputTextarea.displayName = "PromptInputTextarea";

interface PromptInputSubmitProps extends React.ComponentProps<typeof Button> {
  status?: "ready" | "streaming";
}

export const PromptInputSubmit: React.FC<PromptInputSubmitProps> = ({
  status = "ready",
  disabled,
  className,
  ...props
}) => {
  const isStreaming = status === "streaming";
  return (
    <Button
      type="submit"
      size="iconSm"
      disabled={disabled || isStreaming}
      className={cn(
        "rounded-lg bg-[#E27151] text-white hover:bg-[#D15F3F] disabled:opacity-40 transition-all shrink-0",
        className,
      )}
      {...props}
    >
      {isStreaming ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <ArrowUp className="size-3.5 stroke-[2.5]" />
      )}
    </Button>
  );
};
PromptInputSubmit.displayName = "PromptInputSubmit";

export const PromptInputTools: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 p-2 pt-0", className)} {...props}>
      {children}
    </div>
  );
};
PromptInputTools.displayName = "PromptInputTools";

export const PromptInputFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-[10px] text-[#8F8B82] border-t border-[#F0ECE4] bg-[#FFFEF9]/60 rounded-b-xl",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
PromptInputFooter.displayName = "PromptInputFooter";
