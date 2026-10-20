"use client";
import { T, useTranslated } from "@/components/LocaleProvider";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Check, RotateCcw, Loader2, Copy, PanelRightClose } from "lucide-react";
import { ChatMessage } from "@/types";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  ConversationDownload,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageAvatar,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AIAssistantPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  onResetItinerary: () => void;
  onCollapse?: () => void;
}

const suggestionChips = [
  "Ajuda",
  "Recomenda alternativas para chuva",
  "Sugerir restaurante sem glúten",
  "Reagendar atividade 1 do dia 1 para 14:00",
  "Otimizar rota do dia 1",
];

export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  messages,
  onSendMessage,
  isProcessing,
  onResetItinerary,
  onCollapse,
}) => {
  const collapseLabel = useTranslated("Recolher assistente", "pt");
  const promptPlaceholder = useTranslated("Ask me to adapt anything…");
  const [inputText, setInputText] = useState("");
  const conversationContainerRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto scroll conversation to bottom
  useEffect(() => {
    if (conversationContainerRef.current) {
      conversationContainerRef.current.scrollTop = conversationContainerRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  const handleSubmit = () => {
    if (!inputText.trim() || isProcessing) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  const handleChipClick = (chipText: string) => {
    if (isProcessing) return;
    onSendMessage(chipText);
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleScrollToBottom = () => {
    if (conversationContainerRef.current) {
      conversationContainerRef.current.scrollTo({
        top: conversationContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  return (
    <aside className="w-full min-w-0 shrink-0 border-l border-[var(--portal-line-d5d1c7)] bg-[var(--portal-bg-faf8f3)] flex flex-col h-[70dvh] xl:h-full xl:min-h-0 select-none">
      {/* 1. Header with BLU Costa Primitives */}
      <div className="shrink-0 p-4 border-b border-[var(--portal-line-d5d1c7)] bg-[var(--portal-bg-f4f0e7)] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="gold" className="px-1.5 py-0.5 text-xs font-semibold">
              <Sparkles className="w-2.5 h-2.5 text-[var(--portal-text-d8a65c)]" />
              <span>BLU</span>
            </Badge>
            <h3 className="font-serif-blu font-bold text-sm text-[var(--portal-text-143f4b)]">
              <T text="Curation Assistant" source="en" />{" "}
            </h3>
          </div>
          <p className="text-xs text-[var(--portal-text-4a636b)] mt-0.5">
            <T text="Agente de IA · LangChain & Bedrock" source="pt" />{" "}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {onCollapse && (
            <button
              type="button"
              data-testid="collapse-assistant"
              aria-label={collapseLabel}
              title={collapseLabel}
              onClick={onCollapse}
              className="hidden xl:flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--portal-text-143f4b)] hover:bg-[var(--portal-bg-e7eeef)]"
            >
              <PanelRightClose aria-hidden="true" className="size-5" />
            </button>
          )}
          <ConversationDownload messages={messages} fileName="blu-costa-curation.md" />
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onResetItinerary}
            title="Editar briefing para regenerar"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* 2. Standardized AI Elements Conversation & Message Components */}
      <Conversation ref={conversationContainerRef} className="bg-[var(--portal-bg-faf8f3)]">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<Sparkles className="size-8 text-[var(--portal-text-d8a65c)]" />}
              title="Curator Ready"
              description="Use Edit Brief para alterar preferências; remova atividades através dos comandos sugeridos."
            />
          ) : (
            messages.map((message) => {
              const isAssistant = message.sender === "assistant";
              return (
                <Message key={message.id} from={message.sender}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <MessageAvatar from={message.sender} />
                    <span className="text-xs font-medium text-[var(--portal-text-4a636b)]">
                      {isAssistant ? "BLU Costa Curator" : "Travel Designer"}
                    </span>
                    <span className="text-xs text-[var(--portal-text-4a636b)] ml-auto">
                      {message.timestamp}
                    </span>
                  </div>

                  <MessageContent
                    from={message.sender}
                    className={
                      isAssistant
                        ? "bg-[var(--portal-white)] border border-[var(--portal-line-d5d1c7)] text-[var(--portal-text-143f4b)]"
                        : "bg-[var(--portal-bg-143f4b)] text-[#F4F0E7]"
                    }
                  >
                    <MessageResponse>
                      {message.sender === "assistant" ? (
                        <T text={message.text} source="pt" />
                      ) : (
                        message.text
                      )}
                    </MessageResponse>
                  </MessageContent>

                  {/* Status update indicator */}
                  {isAssistant && message.statusTag && (
                    <div className="flex items-center gap-1 text-xs font-medium text-[var(--portal-text-2d5b67)] mt-1 px-1 animate-in fade-in">
                      <Check className="w-3 h-3 text-[var(--portal-text-2d5b67)] stroke-[2.5]" />
                      <span>{message.statusTag}</span>
                    </div>
                  )}

                  {/* Hover Actions */}
                  {isAssistant && (
                    <MessageActions>
                      <MessageAction
                        label="Copy response"
                        onClick={() => handleCopyMessage(message.id, message.text)}
                      >
                        {copiedId === message.id ? (
                          <Check className="size-3 text-emerald-600" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </MessageAction>
                    </MessageActions>
                  )}
                </Message>
              );
            })
          )}

          {/* Assistant Thinking State */}
          {isProcessing && (
            <Message from="assistant">
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <MessageAvatar from="assistant" />
                <span className="text-xs font-medium text-[var(--portal-text-4a636b)]">
                  <T text="BLU Costa Curator" source="en" />{" "}
                </span>
              </div>
              <MessageContent
                from="assistant"
                className="text-[var(--portal-text-4a636b)] flex items-center gap-2 bg-[var(--portal-white)] border border-[var(--portal-line-d5d1c7)]"
              >
                <Loader2 className="size-3.5 animate-spin text-[var(--portal-text-2d5b67)]" />
                <span>
                  <T text="Validating rules & updating proposal…" source="en" />
                </span>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>

        <ConversationScrollButton onClick={handleScrollToBottom} />
      </Conversation>

      {/* 3. AI Elements PromptInput with Suggestion Tools */}
      <div className="p-3 border-t border-[var(--portal-line-d5d1c7)] bg-[var(--portal-white)]">
        <PromptInput
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {/* Suggestion Chips */}
          <div className="px-2 pt-2 pb-1">
            <span className="text-xs font-semibold text-[var(--portal-text-698288)] tracking-wider block mb-1.5">
              <T text="Curator Suggestions" source="en" />{" "}
            </span>
            <PromptInputTools>
              {suggestionChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleChipClick(chip)}
                  className="text-xs px-2 py-0.5 rounded-md bg-[var(--portal-bg-faf8f3)] text-[var(--portal-text-143f4b)] border border-[var(--portal-line-d5d1c7)] hover:border-[var(--portal-line-2d5b67)] hover:bg-[var(--portal-bg-e7eef0)] transition-all cursor-pointer disabled:opacity-50 text-left"
                >
                  <T text={chip} source="pt" />
                </button>
              ))}
            </PromptInputTools>
          </div>

          {/* Input text body */}
          <PromptInputBody>
            <PromptInputTextarea
              name="assistantMessage"
              aria-label="Mensagem para o assistente"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onEnterSubmit={handleSubmit}
              placeholder={promptPlaceholder}
              disabled={isProcessing}
            />
            <PromptInputSubmit
              status={isProcessing ? "streaming" : "ready"}
              disabled={!inputText.trim()}
              className="bg-[var(--portal-bg-2d5b67)] hover:bg-[var(--portal-bg-1e4651)]"
            />
          </PromptInputBody>

          {/* Footer note */}
          <PromptInputFooter>
            <span>
              <T text="Press Enter to curate" source="en" />
            </span>
            <span>
              <T text="Real-time itinerary sync" source="en" />
            </span>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </aside>
  );
};
