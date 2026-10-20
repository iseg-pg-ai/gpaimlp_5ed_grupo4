"use client";

import * as React from "react";
import { ArrowDown, Download, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ConversationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Conversation = React.forwardRef<HTMLDivElement, ConversationProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="log"
        aria-live="polite"
        className={cn(
          "relative flex-1 overflow-y-auto size-full flex flex-col scroll-smooth",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Conversation.displayName = "Conversation";

interface ConversationContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const ConversationContent = React.forwardRef<HTMLDivElement, ConversationContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("flex flex-col gap-4 p-4 min-h-full", className)} {...props}>
        {children}
      </div>
    );
  },
);
ConversationContent.displayName = "ConversationContent";

interface ConversationEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const ConversationEmptyState: React.FC<ConversationEmptyStateProps> = ({
  title = "Start a conversation",
  description = "Ask questions or request itinerary refinements",
  icon,
  children,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-3 p-8 text-center my-auto",
        className,
      )}
      {...props}
    >
      <div className="text-[var(--portal-text-8f8b82)]">
        {icon || <MessageSquare className="size-8" />}
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-sm text-[var(--portal-text-1a1917)]">{title}</h3>
        <p className="text-xs text-[var(--portal-text-6b6861)] max-w-xs">{description}</p>
      </div>
      {children}
    </div>
  );
};
ConversationEmptyState.displayName = "ConversationEmptyState";

interface ConversationScrollButtonProps extends React.ComponentProps<typeof Button> {
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const ConversationScrollButton: React.FC<ConversationScrollButtonProps> = ({
  className,
  onClick,
  ...props
}) => {
  return (
    <Button
      variant="outline"
      size="iconSm"
      className={cn(
        "absolute bottom-3 right-3 rounded-full shadow-md bg-[var(--portal-white)] border-[var(--portal-line-dfd9ce)] hover:bg-[var(--portal-bg-f8f6f1)] z-10",
        className,
      )}
      onClick={onClick}
      {...props}
    >
      <ArrowDown className="size-3.5 text-[var(--portal-text-1a1917)]" />
    </Button>
  );
};
ConversationScrollButton.displayName = "ConversationScrollButton";

interface ConversationDownloadProps extends React.ComponentProps<typeof Button> {
  messages: Array<{ sender: string; text: string }>;
  fileName?: string;
}

export const ConversationDownload: React.FC<ConversationDownloadProps> = ({
  messages,
  fileName = "itinerary-conversation.md",
  className,
  ...props
}) => {
  const handleDownload = () => {
    const content = messages
      .map((m) => `### ${m.sender.toUpperCase()}\n\n${m.text}\n`)
      .join("\n---\n\n");
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="ghost"
      size="iconSm"
      onClick={handleDownload}
      title="Download chat history"
      className={cn(
        "text-[var(--portal-text-8f8b82)] hover:text-[var(--portal-text-1a1917)]",
        className,
      )}
      {...props}
    >
      <Download className="size-3.5" />
    </Button>
  );
};
ConversationDownload.displayName = "ConversationDownload";
