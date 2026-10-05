import { CustomerBrief } from "@/types";

export const initialBrief: CustomerBrief = {
  customerName: "Sarah & James",
  customerEmail: "sarah.james@example.com",
  adults: 2,
  children: 0,
  childrenAges: "",
  destination: "Portugal",
  startDate: "2026-10-10",
  endDate: "2026-10-17",
  arrivalLocation: "Lisbon Humberto Delgado Airport (LIS)",
  departureLocation: "Porto Francisco Sá Carneiro Airport (OPO)",
  budget: 6000,
  currency: "EUR",
  interests: [
    "Culture & Heritage",
    "Gastronomy & Petiscos",
    "Douro & Alentejo Wines",
    "Local Markets & Artisans",
  ],
  pace: "Relaxed",
  accommodation: "Boutique",
  // BLU Curation Criteria
  proposalTier: "Signature",
  physicalEffort: "Baixo (Low)",
  mobilityRestrictions: ["Avoid Steep Stairs (Lisbon/Porto Calçada)"],
  dietaryRestrictions: ["Shellfish Allergy", "Gluten-Free (Celiac)"],
  diningPace: "Relaxed Dining (~90m)",
  morningPreference: "Late Start (10:30+)",
  exclusions: ["No Crowded Tour Buses", "No Commercial Souvenir Shops"],
  specialOccasion: "10th Wedding Anniversary",
  notes:
    "Celebrating 10th anniversary. James has a diagnosed shellfish allergy (requires kitchen cross-contamination check, especially in marisqueiras). Sarah prefers step-free or elevator routes to avoid steep Lisbon calçada hills. They value deep wine immersion in Douro and relaxed morning starts.",
};
