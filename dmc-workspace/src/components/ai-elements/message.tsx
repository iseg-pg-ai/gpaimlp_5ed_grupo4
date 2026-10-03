"use client";

import * as React from "react";
import { Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: "user" | "assistant" | "system";
  children: React.ReactNode;
}

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ from, className, children, ...props }, ref) => {
    const isUser = from === "user";
    return (
      <div
        ref={ref}
        className={cn("flex flex-col group", isUser ? "items-end" : "items-start", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Message.displayName = "Message";

interface MessageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  from?: "user" | "assistant" | "system";
}

export const MessageContent = React.forwardRef<HTMLDivElement, MessageContentProps>(
  ({ className, from = "assistant", children, ...props }, ref) => {
    const isUser = from === "user";
    return (
      <div
        ref={ref}
        className={cn(
          "max-w-[90%] rounded-xl p-3 text-xs leading-relaxed transition-all shadow-2xs",
          isUser
            ? "bg-[#1A1917] text-white rounded-br-xs"
            : "bg-white border border-[#EAE6DF] text-[#1A1917] rounded-bl-xs",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
MessageContent.displayName = "MessageContent";

export const MessageResponse: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn("whitespace-pre-wrap leading-relaxed", className)} {...props}>
      {children}
    </div>
  );
};
MessageResponse.displayName = "MessageResponse";

export const MessageAvatar: React.FC<{
  from: "user" | "assistant";
  className?: string;
}> = ({ from, className }) => {
  if (from === "assistant") {
    return (
      <div
        className={cn(
          "w-5 h-5 rounded-full bg-[#E27151]/15 text-[#E27151] flex items-center justify-center shrink-0 mb-1",
          className,
        )}
      >
        <Sparkles className="w-2.5 h-2.5" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "w-5 h-5 rounded-full bg-[#1A1917]/10 text-[#1A1917] flex items-center justify-center shrink-0 mb-1",
        className,
      )}
    >
      <User className="w-2.5 h-2.5" />
    </div>
  );
};
MessageAvatar.displayName = "MessageAvatar";

export const MessageActions: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
MessageActions.displayName = "MessageActions";

interface MessageActionProps extends React.ComponentProps<typeof Button> {
  label: string;
}

export const MessageAction: React.FC<MessageActionProps> = ({
  label,
  children,
  className,
  ...props
}) => {
  return (
    <Button
      variant="ghost"
      size="iconSm"
      title={label}
      className={cn("h-6 w-6 text-[#8F8B82] hover:text-[#1A1917]", className)}
      {...props}
    >
      {children}
    </Button>
  );
};
MessageAction.displayName = "MessageAction";
