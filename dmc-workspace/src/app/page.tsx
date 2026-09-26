"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { NewTripScreen } from "@/components/NewTripScreen";
import { GenerationModal } from "@/components/GenerationModal";
import { ItineraryWorkspace } from "@/components/ItineraryWorkspace";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import { 
  CustomerBrief, 
  ItineraryDay, 
  RecentTrip, 
  ChatMessage 
} from "@/types";
import { 
  initialBrief, 
  initialRecentTrips, 
  initialItinerary, 
  initialChatMessages 
} from "@/data/mockData";
import { MessageSquare, X } from "lucide-react";

export default function WorkspacePage() {
  // Navigation & View State
  const [currentView, setCurrentView] = useState<"intake" | "workspace">("intake");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeTripId, setActiveTripId] = useState<string>("trip-1");
  
  // Data State
  const [brief, setBrief] = useState<CustomerBrief>(initialBrief);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>(initialRecentTrips);
  const [itinerary, setItinerary] = useState<ItineraryDay[]>(initialItinerary);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [displayBudget, setDisplayBudget] = useState<string>("€6,000 budget");

  // Interaction & Highlight State
  const [highlightedDay, setHighlightedDay] = useState<number | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState<boolean>(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState<boolean>(false);

  // Helper to trigger transient highlight on a day
  const triggerDayHighlight = (dayNumber: number) => {
    setHighlightedDay(dayNumber);
    // Mark specific day as recently modified
    setItinerary((prev) =>
      prev.map((day) => ({
        ...day,
        isRecentlyModified: day.dayNumber === dayNumber,
        items: day.items.map((item) => ({
          ...item,
          isRecentlyModified: day.dayNumber === dayNumber ? item.isRecentlyModified : false,
        })),
      }))
    );

    // Fade highlight after 4 seconds
    setTimeout(() => {
      setHighlightedDay((current) => (current === dayNumber ? null : current));
      setItinerary((prev) =>
        prev.map((day) =>
          day.dayNumber === dayNumber
            ? { ...day, isRecentlyModified: false }
            : day
        )
      );
    }, 4500);
  };

  // Screen 1: User submits brief -> start generation simulation
  const handleGenerateItinerary = (updatedBrief: CustomerBrief) => {
    setBrief(updatedBrief);
    setDisplayBudget(`€${updatedBrief.budget.toLocaleString()} budget`);
    setIsGenerating(true);
  };

  // Generation completes -> transition to Screen 2 (Workspace)
  const handleGenerationComplete = () => {
    setIsGenerating(false);
    setCurrentView("workspace");
    setActiveTripId("trip-1");
  };

  // Toggle Lock/Unlock on a specific activity
  const handleToggleLockActivity = (dayNumber: number, activityId: string) => {
    setItinerary((prev) =>
      prev.map((day) => {
        if (day.dayNumber === dayNumber) {
          return {
            ...day,
            items: day.items.map((item) => {
              if (item.id === activityId) {
                return { ...item, isLocked: !item.isLocked };
              }
              return item;
            }),
          };
        }
        return day;
      })
    );
  };

  // Handle Assistant Chat interactions & Itinerary mutations
  const handleSendMessage = (userText: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setIsAiProcessing(true);

    // Simulate AI reasoning delay
    setTimeout(() => {
      const lower = userText.toLowerCase();

      // SCENARIO 1: "Make Day 3 more relaxed"
      if (lower.includes("day 3") || lower.includes("relaxed") || lower.includes("busy")) {
        const day3 = itinerary.find((d) => d.dayNumber === 3);
        const lockedItems = day3?.items.filter((i) => i.isLocked) || [];

        setItinerary((prev) =>
          prev.map((day) => {
            if (day.dayNumber === 3) {
              return {
                ...day,
                summary: "Balanced pace in Sintra with a relaxing afternoon in coastal Cascais.",
                isRecentlyModified: true,
                items: day.items.map((item) => {
                  // Never overwrite locked items
                  if (item.isLocked) return item;

                  if (item.id === "act-3-4") {
                    return {
                      id: "act-3-4",
                      time: "15:00",
                      title: "Leisurely Stroll along Cascais Promenade",
                      description: "Replaced the rushed second palace walkthrough with open time to browse Cascais old town boutiques, unwind by the bay, and enjoy artisanal gelato.",
                      category: "free_time",
                      location: "Cascais Bay",
                      isRecentlyModified: true,
                    };
                  }
                  return item;
                }),
              };
            }
            return day;
          })
        );

        const lockNotice = lockedItems.length > 0 
          ? ` (Preserved ${lockedItems.length} locked item${lockedItems.length > 1 ? 's' : ''}: ${lockedItems.map(i => i.title).join(', ')})`
          : "";

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          text: `Of course. I've re-optimized Day 3 for a more relaxed pace${lockNotice}, allocating two hours of leisurely free time along the Cascais seaside promenade and historic bay before dinner.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          statusTag: "✓ Itinerary updated",
          affectedDay: 3,
        };

        setChatMessages((prev) => [...prev, aiMsg]);
        triggerDayHighlight(3);
      }
      // SCENARIO 2: "Change the hotel"
      else if (lower.includes("hotel") || lower.includes("accommodation") || lower.includes("stay")) {
        const day6 = itinerary.find((d) => d.dayNumber === 6);
        const hotelItem = day6?.items.find((i) => i.id === "act-6-2");

        if (hotelItem?.isLocked) {
          const aiMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            sender: "assistant",
            text: `🔒 Protected Event: "${hotelItem.title}" on Day 6 is currently locked by you. Respecting your locked preference, I preserved this stay and re-optimized surrounding experiences instead!`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            statusTag: "🔒 Locked Reservation Respected",
            affectedDay: 6,
          };
          setChatMessages((prev) => [...prev, aiMsg]);
          triggerDayHighlight(6);
          setIsAiProcessing(false);
          return;
        }

        setItinerary((prev) =>
          prev.map((day) => {
            if (day.dayNumber === 6) {
              return {
                ...day,
                isRecentlyModified: true,
                items: day.items.map((item) => {
                  if (item.id === "act-6-2") {
                    return {
                      id: "act-6-2",
                      time: "11:30",
                      title: "Check-in at Torel Avantgarde",
                      description: "Replaced with award-winning boutique 5-star art hotel. Executive Room with private balcony overlooking the Douro river and tailored sommelier welcome.",
                      category: "hotel",
                      location: "Rua de Restauração, Porto",
                      isRecentlyModified: true,
                    };
                  }
                  return item;
                }),
              };
            }
            return day;
          })
        );

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          text: "I've replaced the Porto hotel with Torel Avantgarde (Executive River View Room) to provide a boutique, art-inspired ambiance with breathtaking Douro views.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          statusTag: "✓ Itinerary updated",
          affectedDay: 6,
        };

        setChatMessages((prev) => [...prev, aiMsg]);
        triggerDayHighlight(6);
      }
      // SCENARIO 3: "Add a food experience"
      else if (lower.includes("food") || lower.includes("culinary") || lower.includes("cooking") || lower.includes("tasting")) {
        setItinerary((prev) =>
          prev.map((day) => {
            if (day.dayNumber === 2) {
              const updatedItems = [...day.items];
              // Insert culinary experience
              updatedItems.splice(2, 0, {
                id: `act-culinary-${Date.now()}`,
                time: "14:15",
                title: "Private Pastel de Nata & Market Masterclass",
                description: "Hands-on pastry workshop with a master baker inside a historic Lisbon bakery, learning the century-old puff pastry layering technique.",
                category: "activity",
                location: "Baixa Chiado",
                isRecentlyModified: true,
              });

              return {
                ...day,
                isRecentlyModified: true,
                items: updatedItems,
              };
            }
            return day;
          })
        );

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          text: "I've added an exclusive Pastel de Nata baking masterclass on Day 2 in Lisbon, adjusting the afternoon schedule seamlessly so they enjoy warm custard tarts fresh out of the oven.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          statusTag: "✓ Itinerary updated",
          affectedDay: 2,
        };

        setChatMessages((prev) => [...prev, aiMsg]);
        triggerDayHighlight(2);
      }
      // SCENARIO 4: "Reduce the budget"
      else if (lower.includes("budget") || lower.includes("reduce") || lower.includes("cheaper") || lower.includes("cost")) {
        setDisplayBudget("€4,850 budget (-19%)");
        setItinerary((prev) =>
          prev.map((day) => {
            if (day.dayNumber === 4) {
              return {
                ...day,
                isRecentlyModified: true,
                items: day.items.map((item) => {
                  if (item.id === "act-4-4") {
                    return {
                      id: "act-4-4",
                      time: "17:00",
                      title: "Boutique Rabelo Small-Group Cruise",
                      description: "Optimized from private yacht to a boutique traditional rabelo sailing (max 8 guests) with Quinta vintage tasting.",
                      category: "activity",
                      location: "Pinhão Pier",
                      isRecentlyModified: true,
                    };
                  }
                  return item;
                }),
              };
            }
            if (day.dayNumber === 6) {
              return {
                ...day,
                isRecentlyModified: true,
                items: day.items.map((item) => {
                  if (item.id === "act-6-2") {
                    return {
                      id: "act-6-2",
                      time: "11:30",
                      title: "Check-in at Pestana Vintage Porto",
                      description: "Adjusted to 4-star superior riverside hotel on the Praça da Ribeira, retaining historic charm while saving €420 across 2 nights.",
                      category: "hotel",
                      location: "Praça da Ribeira, Porto",
                      isRecentlyModified: true,
                    };
                  }
                  return item;
                }),
              };
            }
            return day;
          })
        );

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          text: "I've optimized the total cost down from €6,000 to ~€4,850 by switching the Douro boat to a boutique small-group rabelo cruise and adjusting the Porto hotel to Pestana Vintage Porto.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          statusTag: "✓ Itinerary updated",
          affectedDay: 4,
        };

        setChatMessages((prev) => [...prev, aiMsg]);
        triggerDayHighlight(4);
      }
      // SCENARIO: "Optimize transfers & route buffers (Algorithm)"
      else if (lower.includes("transfer") || lower.includes("dislocation") || lower.includes("route") || lower.includes("buffer") || lower.includes("transit") || lower.includes("algorithm")) {
        setItinerary((prev) =>
          prev.map((day) => {
            if (day.dayNumber === 4) {
              return {
                ...day,
                isRecentlyModified: true,
                routeSummary: {
                  totalTransitTime: "3h 30m (Optimized)",
                  totalDistance: "352 km",
                  legsCount: 3,
                  walkingDistance: "200 m (Private chauffeur curb-to-door)",
                  routePath: ["Lisbon", "Scenic N222 Douro", "DOC Restaurant", "Six Senses"],
                  algorithmStatus: "Feasible & Optimized",
                },
              };
            }
            return day;
          })
        );

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          text: "Running BLU's routing algorithm: I've verified all transfer legs across the 7 days. On Day 4, the transit from Lisbon to Douro has been recalculated with a +20m traffic buffer on N222, locking in arrival at DOC restaurant 15 minutes before their 13:15 table reservation. Walking legs in Lisbon & Sintra have been validated under 800m with zero steep stairs (Rule R15).",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          statusTag: "✓ Routing Algorithm Verified",
          affectedDay: 4,
        };

        setChatMessages((prev) => [...prev, aiMsg]);
        triggerDayHighlight(4);
      }
      // SCENARIO 5: "Add another night in Porto"
      else if (lower.includes("night") || lower.includes("porto") || lower.includes("extend")) {
        if (itinerary.length === 7) {
          const newDay: ItineraryDay = {
            dayNumber: 8,
            date: "Saturday, 17 Oct",
            title: "Porto Coastal Tram, Serralves & Seaside Lunch",
            location: "Porto & Matosinhos",
            summary: "An additional relaxed day dedicated to Porto's Atlantic coastline and contemporary art.",
            isRecentlyModified: true,
            items: [
              {
                id: "act-8-1",
                time: "10:00",
                title: "Vintage Line 1 Riverside Tram to Foz",
                description: "Historic tram journey skirting the Douro river out to the Atlantic lighthouse promenade.",
                category: "transport",
                location: "Infante to Passeio Alegre",
                isRecentlyModified: true,
              },
              {
                id: "act-8-2",
                time: "11:30",
                title: "Serralves Museum & Art Deco Gardens",
                description: "Pritzker-winner Álvaro Siza Vieira museum wing and treetop walkway through pristine botanical gardens.",
                category: "activity",
                location: "Rua Dom João de Castro",
                isRecentlyModified: true,
              },
              {
                id: "act-8-3",
                time: "14:00",
                title: "Matosinhos Grilled Turbot Lunch at O Gaveto",
                description: "Legendary seafood institution with charcoal-grilled Atlantic fish and Vinho Verde.",
                category: "restaurant",
                location: "Matosinhos",
                isRecentlyModified: true,
              },
            ],
          };

          setItinerary((prev) => [...prev, newDay]);

          const aiMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            sender: "assistant",
            text: "I've extended the journey to 8 nights. Added a dedicated day in Porto highlighting Serralves Museum, the vintage tram to Foz, and fresh charcoal-grilled seafood in Matosinhos.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            statusTag: "✓ Itinerary updated",
            affectedDay: 8,
          };

          setChatMessages((prev) => [...prev, aiMsg]);
          triggerDayHighlight(8);
        } else {
          const aiMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            sender: "assistant",
            text: "Day 8 is already added in Porto! Would you like me to adjust any of its activities or dining choices?",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            statusTag: "✓ Itinerary ready",
          };
          setChatMessages((prev) => [...prev, aiMsg]);
        }
      }
      // GENERIC SMART FALLBACK
      else {
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          text: `I've updated the proposal to reflect "${userText}". Timings and transfer buffers have been aligned to maintain a relaxed travel flow.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          statusTag: "✓ Itinerary updated",
          affectedDay: 3,
        };

        setChatMessages((prev) => [...prev, aiMsg]);
        triggerDayHighlight(3);
      }

      setIsAiProcessing(false);
    }, 700);
  };

  // Reset to default proposal
  const handleResetItinerary = () => {
    setItinerary(initialItinerary);
    setDisplayBudget("€6,000 budget");
    setChatMessages(initialChatMessages);
    setHighlightedDay(null);
  };

  // Sidebar selection
  const handleSelectRecentTrip = (tripId: string) => {
    setActiveTripId(tripId);
    if (tripId === "trip-1") {
      setBrief(initialBrief);
      setItinerary(initialItinerary);
      setCurrentView("workspace");
    } else if (tripId === "trip-2") {
      setBrief({
        ...initialBrief,
        customerName: "Miller Family",
        destination: "Italy",
        budget: 9500,
        adults: 2,
        children: 2,
        childrenAges: "7 and 11",
      });
      setCurrentView("workspace");
    } else {
      setBrief({
        ...initialBrief,
        customerName: "Company Retreat",
        destination: "Lisbon & Cascais",
        budget: 18000,
        adults: 14,
      });
      setCurrentView("workspace");
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#FFFEF9]">
      {/* 1. Left Minimal Sidebar */}
      <Sidebar
        currentTripId={activeTripId}
        onSelectTrip={handleSelectRecentTrip}
        onNewTrip={() => setCurrentView("intake")}
        recentTrips={recentTrips}
        isNewTripActive={currentView === "intake"}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {currentView === "intake" ? (
          <NewTripScreen
            onGenerate={handleGenerateItinerary}
            onCancel={
              itinerary.length > 0 ? () => setCurrentView("workspace") : undefined
            }
          />
        ) : (
          <>
            {/* Screen 2: Left 70% Itinerary Workspace */}
            <ItineraryWorkspace
              brief={brief}
              itinerary={itinerary}
              highlightedDay={highlightedDay}
              onEditBrief={() => setCurrentView("intake")}
              displayBudget={displayBudget}
              onToggleLockActivity={handleToggleLockActivity}
            />

            {/* Screen 2: Right 30% AI Assistant (Desktop) */}
            <div className="hidden md:flex">
              <AIAssistantPanel
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                isProcessing={isAiProcessing}
                onResetItinerary={handleResetItinerary}
              />
            </div>

            {/* Mobile/Tablet Assistant Floating Toggle */}
            <div className="md:hidden fixed bottom-6 right-6 z-40">
              <button
                onClick={() => setIsMobileChatOpen(true)}
                className="flex items-center gap-2 px-4 py-3 rounded-full bg-[#E27151] text-white font-medium text-xs shadow-lg cursor-pointer hover:bg-[#D15F3F] transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Trip Assistant</span>
              </button>
            </div>

            {/* Mobile Drawer/Modal for Assistant */}
            {isMobileChatOpen && (
              <div className="md:hidden fixed inset-0 z-50 bg-black/40 flex justify-end">
                <div className="w-full max-w-sm h-full bg-white flex flex-col relative animate-in slide-in-from-right duration-250">
                  <button
                    onClick={() => setIsMobileChatOpen(false)}
                    className="absolute top-4 right-4 z-50 p-1.5 rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <AIAssistantPanel
                    messages={chatMessages}
                    onSendMessage={handleSendMessage}
                    isProcessing={isAiProcessing}
                    onResetItinerary={handleResetItinerary}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 3. Simulated AI Generation Modal */}
      {isGenerating && (
        <GenerationModal
          destination={brief.destination}
          customerName={brief.customerName}
          onComplete={handleGenerationComplete}
        />
      )}
    </div>
  );
}
