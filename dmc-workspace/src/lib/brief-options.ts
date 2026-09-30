import type {
  CustomerBrief,
  PhysicalEffortLevel,
  ProposalTier,
  DiningPace,
  MorningPreference,
} from "../types/index";

export const interestOptions = [
  "Culture & Heritage",
  "Gastronomy & Petiscos",
  "Douro & Alentejo Wines",
  "Atlantic Coast & Nature",
  "Tile Craft & Architecture",
  "Fado & Traditional Music",
  "Local Markets & Artisans",
  "Contemporary Art (Serralves)",
  "Bespoke Wellness & Spas",
];

export const mobilityOptions = [
  "Avoid Steep Stairs (Lisbon/Porto Calçada)",
  "Wheelchair Accessible Routes",
  "Limited Walking Distance (< 1km)",
  "Chauffeured Door-to-door Drop-offs",
  "Elevator Required at Hotels",
];

export const dietaryOptions = [
  "Shellfish Allergy",
  "Gluten-Free (Celiac)",
  "Vegetarian",
  "Vegan",
  "Nut Allergy",
  "Dairy-Free (Lactose)",
  "Halal",
  "Kosher",
];

export const exclusionOptions = [
  "No Crowded Tour Buses",
  "No Commercial Souvenir Shops",
  "No Standard Large Museums",
  "No Religious / Churches",
  "No Open Boats (Sea Sickness)",
  "No Alcohol / Wine Tastings",
];

export const effortLevels: PhysicalEffortLevel[] = [
  "Baixo (Low)",
  "Moderado (Moderate)",
  "Alto (High)",
];

export const curationTiers: Array<{ tier: ProposalTier; desc: string }> = [
  { tier: "Soft", desc: "Essential, cohesive & authentic Portuguese highlights" },
  { tier: "Classic", desc: "Curated additional layers, regional craft & depth" },
  { tier: "Signature", desc: "Immersive experiences; special access subject to confirmation" },
];

export const diningPaces: DiningPace[] = [
  "Quick Lunch (~40m)",
  "Relaxed Dining (~90m)",
  "Tasting Experience (120m+)",
];

export const morningPaces: MorningPreference[] = [
  "Early (08:30)",
  "Standard (09:30)",
  "Late Start (10:30+)",
];

export const paceOptions: Array<CustomerBrief["pace"]> = ["Relaxed", "Balanced", "Active"];

export const accommodationOptions: Array<CustomerBrief["accommodation"]> = [
  "3 star",
  "4 star",
  "5 star",
  "Boutique",
  "Luxury",
];
