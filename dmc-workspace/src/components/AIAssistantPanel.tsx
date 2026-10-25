"use client";
import { T, useTranslated } from "@/components/LocaleProvider";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Check, RotateCcw, Loader2, Copy, PanelRightClose } from "lucide-react";
import { ChatMessage } from "@/types";
import type { AgentProposal } from "@/lib/assistant-actions";
import { canonicalSnapshot } from "@/lib/snapshot-validation";
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
  language: "pt" | "en";
  onLanguageChange: (language: "pt" | "en") => void;
  proposal?: AgentProposal | null;
  onDecideProposal: (decision: "accept" | "reject") => void;
  onSelectAlternative: (dayNumber: number, itemId: string, catalogId: string) => void;
  onDismissProposal: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  onResetItinerary: () => void;
  onCollapse?: () => void;
}

const suggestionChips = {
  pt: [
    "Ajuda",
    "Adiciona uma atividade ao dia 1",
    "Recomenda alternativas para chuva",
    "Regenera apenas o dia 1 preservando as atividades confirmadas",
    "Otimizar rota do dia 1",
  ],
  en: [
    "Help",
    "Add an activity to day 1",
    "Suggest alternatives for rain",
    "Regenerate only day 1 preserving confirmed activities",
    "Optimize the route for day 1",
  ],
};

export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  language,
  onLanguageChange,
  proposal,
  onDecideProposal,
  onSelectAlternative,
  onDismissProposal,
  messages,
  onSendMessage,
  isProcessing,
  onResetItinerary,
  onCollapse,
}) => {
  const collapseLabel = useTranslated("Recolher assistente", "pt");
  const conversationLanguageLabel = useTranslated("Idioma da conversa", "pt");
  const promptPlaceholder =
    language === "en"
      ? "Describe a change to the itinerary…"
      : "Descreva uma alteração ao roteiro…";
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
            <T text="Propostas com revisão humana · Bedrock" source="pt" />{" "}
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
              description={
                language === "en"
                  ? "Describe the change. Review the proposal before accepting it."
                  : "Descreva a alteração. Reveja a proposta antes de a aceitar."
              }
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
                      <span lang={message.language ?? "pt"}>{message.text}</span>
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

          {proposal && (
            <section
              aria-label="Pré-visualização da proposta"
              data-testid="agent-preview"
              className="rounded-lg border border-[var(--portal-line-d5d1c7)] bg-[var(--portal-white)] p-3 text-sm text-[var(--portal-text-143f4b)] break-words"
            >
              <h4 className="font-semibold">
                <T
                  text={
                    proposal.plan.actions.length
                      ? "Rever alterações antes de aceitar"
                      : "Escolher alternativa de substituição"
                  }
                  source="pt"
                />
              </h4>
              <p className="mt-2 whitespace-pre-wrap">{proposal.plan.summary}</p>
              {proposal.plan.warnings.map((warning, index) => (
                <p className="mt-1" key={index}>
                  {warning}
                </p>
              ))}
              <p className="mt-2">
                <T
                  text="Preços, disponibilidade e reservas continuam sujeitos a confirmação humana."
                  source="pt"
                />
              </p>
              {proposal.impact && proposal.plan.actions.length > 0 && (
                <details className="mt-3 border-t pt-2" data-testid="agent-impact">
                  <summary className="cursor-pointer font-semibold">
                    <T text="Resumo do impacto e custos conhecidos" source="pt" />
                  </summary>
                  <ul className="list-disc pl-4">
                    {proposal.impact.changes.map((change, index) => (
                      <li key={index}>
                        <T text={change} source="pt" />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    <T
                      text="Subtotais conhecidos (confirmados e estimados), sem conversão de moeda:"
                      source="pt"
                    />
                  </p>
                  {proposal.impact.costs.map((cost) => (
                    <p key={cost.currency}>
                      {cost.currency}: {(cost.beforeCents / 100).toFixed(2)} →{" "}
                      {(cost.afterCents / 100).toFixed(2)} · <T text="Confirmados" source="pt" />:{" "}
                      {(cost.beforeConfirmedCents / 100).toFixed(2)} →{" "}
                      {(cost.afterConfirmedCents / 100).toFixed(2)}
                    </p>
                  ))}
                  <p>
                    <T text="Linhas com custo por confirmar" source="pt" />:{" "}
                    {proposal.impact.pendingBefore} → {proposal.impact.pendingAfter}
                  </p>
                  {proposal.impact.incomplete && (
                    <p>
                      <T
                        text="Custos incompletos: valores desconhecidos não são gratuitos. Os subtotais não representam o custo final da viagem."
                        source="pt"
                      />
                    </p>
                  )}
                </details>
              )}
              {proposal.after
                .filter(
                  (day) =>
                    canonicalSnapshot(day) !==
                    canonicalSnapshot(
                      proposal.before.find((before) => before.dayNumber === day.dayNumber),
                    ),
                )
                .map((day) => (
                  <div
                    key={day.dayNumber}
                    className="mt-3 border-t pt-2"
                    data-testid="agent-day-change"
                  >
                    <h5 className="font-semibold">
                      <T text="Dia" source="pt" /> {day.dayNumber}
                    </h5>
                    <p>
                      <T text="Antes" source="pt" /> · <T text="Capacidade" source="pt" />:{" "}
                      {proposal.before.find((before) => before.dayNumber === day.dayNumber)
                        ?.dailyCapacity ?? "briefing"}
                    </p>
                    <ul className="list-disc pl-4">
                      {proposal.before
                        .find((before) => before.dayNumber === day.dayNumber)
                        ?.items.map((item) => (
                          <li key={item.id}>
                            {item.time} · {item.title}
                          </li>
                        ))}
                    </ul>
                    <p className="mt-2">
                      <T text="Depois" source="pt" /> · <T text="Capacidade" source="pt" />:{" "}
                      {day.dailyCapacity ?? "briefing"}
                    </p>
                    <ul className="list-disc pl-4">
                      {day.items.map((item) => (
                        <li key={item.id}>
                          {item.time} · {item.title} ·{" "}
                          {item.priceNote ??
                            (language === "en"
                              ? "Price pending confirmation"
                              : "Preço por confirmar")}
                          {item.pendingChecks?.map((pending, index) => (
                            <p key={index} className="text-xs">
                              {pending}
                            </p>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              {proposal.alternatives?.map((group) => (
                <div
                  key={`${group.dayNumber}:${group.itemId}`}
                  className="mt-3 border-t pt-2"
                  data-testid="agent-alternatives"
                >
                  <h5 className="font-semibold">
                    <T text="Alternativas" source="pt" /> · {group.itemTitle}
                  </h5>
                  {group.options.map((option) => (
                    <div key={option.catalogId} className="mt-2 rounded border p-2">
                      <p className="font-semibold">{option.title}</p>
                      <p>
                        {option.time} · {option.price}
                      </p>
                      {option.pendingChecks.map((pending, index) => (
                        <p key={index}>{pending}</p>
                      ))}
                      <Button
                        disabled={isProcessing}
                        onClick={() =>
                          onSelectAlternative(group.dayNumber, group.itemId, option.catalogId)
                        }
                      >
                        <T text="Pré-visualizar esta substituição" source="pt" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              {proposal.rankedCandidates?.map((group) => (
                <div
                  key={group.dayNumber}
                  className="mt-3 border-t pt-2"
                  data-testid="agent-ranking"
                >
                  <h5 className="font-semibold">
                    <T text="Candidatos recomendados" source="pt" /> · <T text="Dia" source="pt" />{" "}
                    {group.dayNumber}
                  </h5>
                  {group.options.map((option) => (
                    <div key={option.id} className="mt-2 rounded border p-2">
                      <p className="font-semibold">{option.title}</p>
                      <p>
                        {option.time} ·{" "}
                        {option.price ??
                          (language === "en" ? "Price pending" : "Preço por confirmar")}
                      </p>
                      <p className="text-xs">
                        <T text="Posição na seleção determinística" source="pt" />:{" "}
                        {option.baselinePosition}
                      </p>
                      {option.reasons.map((reason, index) => (
                        <p className="text-xs" key={index}>
                          {reason}
                        </p>
                      ))}
                      <Button
                        disabled={isProcessing}
                        onClick={() => onSelectAlternative(group.dayNumber, "", option.id)}
                      >
                        <T text="Pré-visualizar adição" source="pt" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              {proposal.plan.actions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    data-testid="agent-accept"
                    disabled={isProcessing}
                    onClick={() => onDecideProposal("accept")}
                  >
                    <T text="Aceitar e guardar versão" source="pt" />
                  </Button>
                  <Button
                    data-testid="agent-reject"
                    variant="ghost"
                    disabled={isProcessing}
                    onClick={() => onDecideProposal("reject")}
                  >
                    <T text="Rejeitar" source="pt" />
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" disabled={isProcessing} onClick={onDismissProposal}>
                  <T text="Fechar opções" source="pt" />
                </Button>
              )}
            </section>
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
                  <T text="A preparar e validar a proposta…" source="pt" />
                </span>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>

        <ConversationScrollButton onClick={handleScrollToBottom} />
      </Conversation>

      {/* 3. AI Elements PromptInput with Suggestion Tools */}
      <div className="p-3 border-t border-[var(--portal-line-d5d1c7)] bg-[var(--portal-white)]">
        <label className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <T text="Idioma da conversa" source="pt" />
          <select
            data-testid="assistant-language"
            aria-label={conversationLanguageLabel}
            className="min-h-11 rounded border p-2"
            value={language}
            disabled={isProcessing}
            onChange={(event) => onLanguageChange(event.target.value as "pt" | "en")}
          >
            <option value="pt">Português</option>
            <option value="en">English</option>
          </select>
        </label>
        <PromptInput
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {/* Suggestion Chips */}
          <details className="px-2 pt-2 pb-1">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--portal-text-698288)] tracking-wider mb-1.5">
              <T text="Curator Suggestions" source="en" />{" "}
            </summary>
            <PromptInputTools>
              {suggestionChips[language].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleChipClick(chip)}
                  className="text-xs px-2 py-0.5 rounded-md bg-[var(--portal-bg-faf8f3)] text-[var(--portal-text-143f4b)] border border-[var(--portal-line-d5d1c7)] hover:border-[var(--portal-line-2d5b67)] hover:bg-[var(--portal-bg-e7eef0)] transition-all cursor-pointer disabled:opacity-50 text-left"
                >
                  <span lang={language}>{chip}</span>
                </button>
              ))}
            </PromptInputTools>
          </details>

          {/* Input text body */}
          <PromptInputBody>
            <PromptInputTextarea
              name="assistantMessage"
              maxLength={4000}
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
              <T text="Alterações só após confirmação" source="pt" />
            </span>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </aside>
  );
};
