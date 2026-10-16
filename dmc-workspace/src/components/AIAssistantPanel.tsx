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
  proposal?: AgentProposal | null;
  onDecideProposal?: (decision: "accept" | "reject", reason?: string) => void;
  onSelectAlternative?: (dayNumber: number, itemId: string, catalogId: string) => void;
  onDismissProposal?: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string, context?: string) => void;
  isProcessing: boolean;
  onResetItinerary: () => void;
  onCollapse?: () => void;
}

const suggestionChips = [
  "Ajuda",
  "Ordena os candidatos elegíveis para o dia 1",
  "Regenera apenas o dia 1 preservando as reservas confirmadas",
  "Otimizar rota do dia 1",
];

export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  messages,
  onSendMessage,
  isProcessing,
  onResetItinerary,
  onCollapse,
  proposal,
  onDecideProposal,
  onSelectAlternative,
  onDismissProposal,
}) => {
  const collapseLabel = useTranslated("Recolher assistente", "pt");
  const promptPlaceholder = useTranslated("Ask me to adapt anything…");
  const [inputText, setInputText] = useState("");
  const [context, setContext] = useState("itinerary");
  const [rejectionReason, setRejectionReason] = useState("");
  const conversationContainerRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto scroll conversation to bottom
  useEffect(() => {
    if (conversationContainerRef.current) {
      conversationContainerRef.current.scrollTop = conversationContainerRef.current.scrollHeight;
    }
  }, [messages, isProcessing, proposal]);

  const handleSubmit = () => {
    if (!inputText.trim() || isProcessing) return;
    onSendMessage(inputText.trim(), context);
    setInputText("");
  };

  const handleChipClick = (chipText: string) => {
    if (isProcessing) return;
    onSendMessage(chipText, context);
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
    <aside className="w-full min-w-0 shrink-0 border-l border-[#D5D1C7] bg-[#FAF8F3] flex flex-col h-[70dvh] xl:h-full xl:min-h-0 select-none">
      {/* 1. Header with BLU Costa Primitives */}
      <div className="shrink-0 p-4 border-b border-[#D5D1C7] bg-[#F4F0E7] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="gold" className="px-1.5 py-0.5 text-xs font-semibold">
              <Sparkles className="w-2.5 h-2.5 text-[#D8A65C]" />
              <span>BLU</span>
            </Badge>
            <h3 className="font-serif-blu font-bold text-sm text-[#143F4B]">
              <T text="Curation Assistant" source="en" />{" "}
            </h3>
          </div>
          <p className="text-xs text-[#4A636B] mt-0.5">
            <T text="Propostas de curadoria · Amazon Bedrock" source="pt" />{" "}
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
              className="hidden xl:flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#143F4B] hover:bg-[#E7EEEF]"
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
      <Conversation ref={conversationContainerRef} className="bg-[#FAF8F3]">
        <ConversationContent className="flex flex-col">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<Sparkles className="size-8 text-[#D8A65C]" />}
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
                    <span className="text-xs font-medium text-[#4A636B]">
                      {isAssistant ? "BLU Costa Curator" : "Travel Designer"}
                    </span>
                    <span className="text-xs text-[#4A636B] ml-auto">{message.timestamp}</span>
                  </div>

                  <MessageContent
                    from={message.sender}
                    className={
                      isAssistant
                        ? "bg-white border border-[#D5D1C7] text-[#143F4B]"
                        : "bg-[#143F4B] text-[#F4F0E7]"
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
                    <div className="flex items-center gap-1 text-xs font-medium text-[#2D5B67] mt-1 px-1 animate-in fade-in">
                      <Check className="w-3 h-3 text-[#2D5B67] stroke-[2.5]" />
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
              className="rounded-lg border border-[#D5D1C7] bg-white p-3 text-sm text-[#143F4B]"
              data-testid="agent-preview"
            >
              <h4 className="font-semibold">
                <T
                  text={
                    proposal.plan.actions.length
                      ? "Rever alterações antes de aceitar"
                      : proposal.rankedCandidates?.length
                        ? "Escolher atividade para adicionar"
                        : "Escolher alternativa de substituição"
                  }
                  source="pt"
                />
              </h4>
              <p>{proposal.plan.summary}</p>
              {proposal.plan.warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
              <p>
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
                  <p>
                    <T
                      text="Subtotais conhecidos (confirmados e estimados), sem conversão de moeda:"
                      source="pt"
                    />
                  </p>
                  {proposal.impact.costs.map((cost) => (
                    <p key={cost.currency}>
                      {cost.currency}: {(cost.beforeCents / 100).toFixed(2)} →{" "}
                      {(cost.afterCents / 100).toFixed(2)}
                      {" · "}
                      <T text="Confirmados" source="pt" />:{" "}
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
                  (day, index) =>
                    canonicalSnapshot(day) !== canonicalSnapshot(proposal.before[index]),
                )
                .map((day) => (
                  <div key={day.dayNumber} className="mt-3 border-t pt-2">
                    <h5 className="font-semibold">Dia {day.dayNumber}</h5>
                    <p>
                      <T text="Antes" source="pt" />
                    </p>
                    <ul>
                      {proposal.before
                        .find((d) => d.dayNumber === day.dayNumber)
                        ?.items.map((item) => (
                          <li key={item.id}>
                            {item.time} · {item.title}
                          </li>
                        ))}
                    </ul>
                    <p>
                      <T text="Depois" source="pt" /> · Capacidade:{" "}
                      {day.dailyCapacity ?? "briefing"}
                    </p>
                    <ul>
                      {day.items.map((item) => (
                        <li key={item.id}>
                          {item.time} · {item.title} · {item.priceNote ?? "Preço por confirmar"}
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
                    Alternativas · Dia {group.dayNumber} · {group.itemTitle}
                  </h5>
                  {group.options.map((option) => (
                    <div
                      key={option.catalogId}
                      className="mt-2 rounded border border-[#D5D1C7] p-2"
                    >
                      <p className="font-semibold">{option.title}</p>
                      <p>
                        {option.time} · {option.price}
                      </p>
                      {option.pendingChecks.map((check, index) => (
                        <p key={index}>{check}</p>
                      ))}
                      <Button
                        disabled={isProcessing}
                        onClick={() =>
                          onSelectAlternative?.(group.dayNumber, group.itemId, option.catalogId)
                        }
                      >
                        <T text="Pré-visualizar esta substituição" source="pt" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              {proposal.rankedCandidates?.map((group) => (
                <div key={group.dayNumber} className="mt-3 border-t pt-2">
                  <h5>Candidatos ordenados · Dia {group.dayNumber}</h5>
                  {group.options.map((option) => (
                    <div className="mt-2 rounded border p-2" key={option.id}>
                      <p>
                        {option.title} · {option.time}
                      </p>
                      <p>{option.price ?? "Preço por confirmar"}</p>
                      <p>Revisão do catálogo: {option.catalogRevision ?? "desconhecida"}</p>
                      <p>Posição na base determinística: {option.baselinePosition}</p>
                      <ul>
                        {option.reasons.map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                      </ul>
                      <Button
                        disabled={isProcessing}
                        onClick={() => onSelectAlternative?.(group.dayNumber, "", option.id)}
                      >
                        Pré-visualizar adição
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              {proposal.plan.actions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="w-full">
                    Motivo de rejeição (opcional)
                    <input
                      className="w-full rounded border p-2"
                      maxLength={1000}
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                    />
                  </label>
                  <Button disabled={isProcessing} onClick={() => onDecideProposal?.("accept")}>
                    <T text="Aceitar e guardar versão" source="pt" />
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={isProcessing}
                    onClick={() => {
                      onDecideProposal?.("reject", rejectionReason);
                      setRejectionReason("");
                    }}
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
                <span className="text-xs font-medium text-[#4A636B]">
                  <T text="BLU Costa Curator" source="en" />{" "}
                </span>
              </div>
              <MessageContent
                from="assistant"
                className="text-[#4A636B] flex items-center gap-2 bg-white border border-[#D5D1C7]"
              >
                <Loader2 className="size-3.5 animate-spin text-[#2D5B67]" />
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
      <div className="p-3 border-t border-[#D5D1C7] bg-white">
        <label className="mb-2 block text-xs">
          Contexto do pedido
          <select
            className="ml-2 rounded border p-1"
            value={context}
            onChange={(event) => setContext(event.target.value)}
          >
            <option value="itinerary">Roteiro</option>
            <option value="brief">Briefing</option>
            <option value="confirmations">Confirmações</option>
            <option value="catalog">Catálogo e recomendações</option>
            <option value="export">Revisão da entrega</option>
          </select>
        </label>
        <PromptInput
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {/* Suggestion Chips */}
          <div className="px-2 pt-2 pb-1">
            <span className="text-xs font-semibold text-[#698288] tracking-wider block mb-1.5">
              <T text="Curator Suggestions" source="en" />{" "}
            </span>
            <PromptInputTools>
              {suggestionChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleChipClick(chip)}
                  className="text-xs px-2 py-0.5 rounded-md bg-[#FAF8F3] text-[#143F4B] border border-[#D5D1C7] hover:border-[#2D5B67] hover:bg-[#E7EEF0] transition-all cursor-pointer disabled:opacity-50 text-left"
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
              className="bg-[#2D5B67] hover:bg-[#1E4651]"
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
