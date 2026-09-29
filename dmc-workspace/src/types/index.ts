export type ActivityCategory = 
  | "hotel" 
  | "activity" 
  | "restaurant" 
  | "transport" 
  | "free_time";

export type TransitMode = 
  | "chauffeur"     // Chauffeured Mercedes Sedan / V-Class
  | "walk"          // Level / curated walking route
  | "boat"          // Private Rabelo wooden boat / river yacht
  | "train"         // Scenic rail (Linha do Douro / Alfa Pendular)
  | "funicular";     // Historic elevator/funicular (e.g. Bica, Guindais)

export interface TransitLeg {
  id: string;
  fromLocation: string;
  toLocation: string;
  mode: TransitMode;
  duration: string;         // e.g. "18 min"
  distance?: string;        // e.g. "8.2 km" or "450 m"
  routeNote?: string;       // e.g. "Scenic riverfront drive via Av. 24 de Julho"
  bufferMinutes?: number;   // e.g. 15 (traffic & parking buffer)
  isAlgorithmOptimized?: boolean;
  algorithmNote?: string;   // e.g. "Algorithm verified: door-to-door, 0 steep stairs (Rule R15)"
}

export interface ActivityItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  category: ActivityCategory;
  location?: string;
  duration?: string;
  priceNote?: string;
  effortLevel?: "Baixo" | "Moderado" | "Alto";
  dietaryNotes?: string;
  accessibilityNotes?: string;
  isRecentlyModified?: boolean;
  isLocked?: boolean;
  transitToNext?: TransitLeg;
  source?: string;
  appliedRules?: string[];
  pendingChecks?: string[];
}

export interface DailyRouteSummary {
  totalTransitTime: string;  // e.g. "48 min"
  totalDistance: string;     // e.g. "19.5 km"
  legsCount: number;
  walkingDistance: string;   // e.g. "650 m (< 1km constraint met)"
  routePath: string[];       // e.g. ["LIS Airport", "Príncipe Real", "Campo de Ourique"]
  algorithmStatus: "Feasible & Optimized" | "Buffer Added" | "Manual Adjusted";
}

export interface ItineraryDay {
  dayNumber: number;
  date: string;
  title: string;
  location: string;
  summary?: string;
  tier?: ProposalTier;
  items: ActivityItem[];
  routeSummary?: DailyRouteSummary;
  isRecentlyModified?: boolean;
}

export type PhysicalEffortLevel = "Baixo (Low)" | "Moderado (Moderate)" | "Alto (High)";
export type ProposalTier = "Soft" | "Classic" | "Signature";
export type DiningPace = "Quick Lunch (~40m)" | "Relaxed Dining (~90m)" | "Tasting Experience (120m+)";
export type MorningPreference = "Early (08:30)" | "Standard (09:30)" | "Late Start (10:30+)";

export interface CustomerBrief {
  customerName: string;
  adults: number;
  children: number;
  childrenAges: string;
  destination: string;
  startDate: string;
  endDate: string;
  arrivalLocation: string;
  departureLocation: string;
  budget: number;
  currency: string;
  interests: string[];
  pace: "Relaxed" | "Balanced" | "Active";
  accommodation: "3 star" | "4 star" | "5 star" | "Boutique" | "Luxury";
  // Criteria derived from BLU DMC pipeline & curation rules (R01-R51)
  proposalTier: ProposalTier;
  physicalEffort: PhysicalEffortLevel;
  mobilityRestrictions: string[];
  dietaryRestrictions: string[];
  diningPace: DiningPace;
  morningPreference: MorningPreference;
  exclusions: string[];
  specialOccasion: string;
  notes: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  statusTag?: string; // e.g. "✓ Itinerary updated"
  affectedDay?: number;
  details?: string;
}

export interface RecentTrip {
  id: string;
  name: string;
  destination: string;
  dates: string;
  budget: string;
  tier?: ProposalTier;
  status: "Draft" | "Proposal Ready" | "Confirmed";
}
