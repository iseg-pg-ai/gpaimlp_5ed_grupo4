# BLU Costa Travel · AI Travel Designer Workspace (UI Prototype)

> **Live Local URL**: [http://localhost:3001](http://localhost:3001)  
> **Brand**: [BLU Costa Travel](https://www.blucostatravel.com/) · RNAAT Registo nº 26/2026  
> **Location**: `dmc-workspace/`

---

## 1. Executive Summary & Vision

This workspace is a high-fidelity frontend prototype designed specifically for **travel designers and curators at BLU Costa Travel**, a luxury Destination Management Company (DMC) based in Portugal. 

Instead of treating AI as an autonomous black-box that spits out generic tourism itineraries, this workspace acts as an **expert curatorial copilot**. It aligns strictly with BLU Costa's philosophy:

> *"Travel is not accumulation. It is interpretation."*

The prototype demonstrates a seamless, human-in-the-loop workflow:
1. **Intake & Briefing**: Capture client DNA, travel occasion, logistics, budget, and operational constraints.
2. **Deterministic Curation**: Simulate multi-step itinerary synthesis incorporating BLU's 51 curation rules (Tiers, pacing, mobility safety, allergen validation).
3. **Interactive Workspace**: Scannable day-by-day timeline with logistics tags, effort levels, and accessibility flags.
4. **AI Curation Copilot**: Chat interface powered by **AI Elements** allowing instant itinerary adjustments with live visual highlighting.

---

## 2. Core Architecture & Tech Stack

The prototype is built with a modern, lightweight, maintainable stack with zero external API dependencies:

- **Framework**: [Next.js 16+](https://nextjs.org/) (App Router, Turbopack)
- **UI Runtime**: React 19 + TypeScript (strict mode)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with custom design tokens for BLU Costa Travel
- **Primitive Components**: [shadcn/ui](https://ui.shadcn.com/) (`Button`, `Badge`, `Card`, `Input`, `Textarea`, `Separator`)
- **Chat & Copilot UX**: [AI Elements](https://elements.ai-sdk.dev/components/conversation) modular architecture (`Conversation`, `Message`, `PromptInput`)
- **Typography & Brand Identity**:
  - *Serif*: Libre Baskerville (editorial headings, quotes, and narrative sections)
  - *Sans*: Inter (interface labels, forms, badges, and metadata)
  - *Palette*: Deep Maritime Ink (`#143F4B`), Ocean Teal (`#2D5B67`), Warm Portuguese Ivory (`#F4F0E7`), Subtle Gold (`#D8A65C`), and Natural Linen (`#D5D1C7`)

---

## 3. Data Pipeline Alignment (`warehouse/blu_etl.sqlite`)

The intake form and data models are mapped directly to the internal data pipeline and SQLite database:

### 3.1 Curation Tiers (Rules R33–R44)
- **Classic**: Essential, cohesive, and authentic Portuguese cultural highlights.
- **Extended**: Additional curatorial depth, regional artisan workshops, and private tastings.
- **Signature**: Sommelier-guided private estates, VIP access, and senior historians.

### 3.2 Physical Effort & Mobility Safety (Rules R15–R17)
- **Effort Levels**: `Baixo (Low)` (level access, chauffeur to viewpoints), `Moderado (Moderate)`, `Alto (High)`.
- **Mobility Options**:
  - `Avoid Steep Stairs (Lisbon/Porto Calçada)` *(Crucial for historical center navigation)*
  - `Wheelchair Accessible Routes`
  - `Limited Walking Distance (< 1km)`
  - `Chauffeured Door-to-door Drop-offs`
  - `Elevator Required at Hotels`

### 3.3 Dietary Allergies & Dining Requirements (Rules R02, R04)
- **Dietary Options**:
  - `Shellfish Allergy` *(Cross-checked against marisqueiras and traditional seafood stocks)*
  - `Gluten-Free (Celiac)`
  - `Vegetarian` / `Vegan`
  - `Nut Allergy`
  - `Dairy-Free (Lactose)`
  - `Halal` / `Kosher`
- **Dining Duration**: `Quick (~40m)`, `Relaxed Dining (~90m)`, `Gastronomic Experience (120m+)`.

### 3.4 Daily Rhythm & Explicit Exclusions (Rules R03, R05)
- **Morning Start**: `Early Start (08:30)`, `Standard (09:30)`, `Late Start (10:30+)`.
- **Exclusions**: `No Crowded Tour Buses`, `No Commercial Souvenir Shops`, `No Standard Large Museums`, `No Open Boats (Sea Sickness)`.

---

## 4. Key Screens & Component Hierarchy

```
dmc-workspace/src/
├── app/
│   ├── layout.tsx              # Root HTML, Libre Baskerville + Inter fonts
│   ├── page.tsx                # Main controller: screen routing & state management
│   └── globals.css             # Tailwind v4 theme variables, animations
├── components/
│   ├── Sidebar.tsx             # DMC brand header, "+ New Trip", recent journeys
│   ├── NewTripScreen.tsx       # Intake form with ordered curatorial sections
│   ├── GenerationModal.tsx     # 5-step simulated AI curation modal
│   ├── ItineraryWorkspace.tsx  # Left 70%: Trip summary, day tabs, schedule cards
│   ├── ActivityCard.tsx        # Activity item with effort, duration & allergen chips
│   ├── TransitConnector.tsx    # Stippl-inspired transit rail connector between activities
│   ├── TransitInspectorModal.tsx # Algorithm routing modal (buffers, modality & rules)
│   ├── AIAssistantPanel.tsx    # Right 30%: AI Elements conversation & suggestion chips
│   ├── ai-elements/            # Composable conversation primitives
│   │   ├── conversation.tsx    # Scroll container, auto-scroll, empty state
│   │   ├── message.tsx         # User & Assistant bubbles, avatars, action buttons
│   │   └── prompt-input.tsx    # Textarea, auto-resize, submit button, tools slot
│   └── ui/                     # Shadcn base primitives (button, badge, card, etc.)
├── data/
│   └── mockData.ts             # Initial demo brief, 7-day realistic Portugal itinerary
└── types/
    └── index.ts                # TypeScript domain models (CustomerBrief, TransitLeg, etc.)
```

### Screen Flow Details:
1. **Intake Screen (`NewTripScreen.tsx`)**:
   - Organized in the exact requested logical order:
     1. *Proposal Curation Tier* (`Signature` selected by default)
     2. *Customer Details & Occasion* (Sarah & James, 10th Anniversary)
     3. *Trip Routing & Logistics* (Arrival LIS, Departure OPO, Dates)
     4. *Budget & Curatorial Focus* (€6,000, Wine & Gastronomy, Boutique)
     5. *Restrictions & Operational Constraints* (Mobility calçada safety, Shellfish allergen check, Late 10:30+ starts)
     6. *Curator Perspective & Internal Notes*
   - Includes a quick **"Fill Sarah & James Demo"** button to instantly populate the form.
2. **Generation Modal (`GenerationModal.tsx`)**:
   - Multi-step animation reflecting the actual backend pipeline stages:
     - `01 Ingesting Brief & Checking Constraints`
     - `02 Evaluating Physical Effort & Allergen Safety`
     - `03 Applying Signature Curation Rules (Douro & Lisbon)`
     - `04 Optimizing Routing & Vendor Logistics`
     - `05 Itinerary Ready for Curator Review`
3. **Workspace (`ItineraryWorkspace.tsx` + `AIAssistantPanel.tsx`)**:
   - **70% Left Pane**: Filter by day or view full 7-day journey. Displays hotel check-ins, transfer notes, lunch/dinner reservations with allergen safety badges, and morning/afternoon activities.
   - **30% Right Pane**: Chat copilot with one-click suggestions:
     - *"Make Day 3 more relaxed (R01)"* → Swaps full-day hike for a private Douro river rabelo cruise.
     - *"Optimize transfers & route buffers (Algorithm)"* → Recalculates transit legs and verifies traffic buffers.
     - *"Add a culinary masterclass (R04)"* → Adds a private chef workshop in Chiado respecting client dietary constraints.
     - *"Optimize budget to €4,850"* → Rebalances transfers and boutique stays.
   - **Event Locking / Pinning**: Travel designers can click the padlock icon on any activity card (e.g. hotel stay or private tasting). Locked events are protected from AI revisions (`[🔒 Pinned / Protected]`), and the assistant optimizes unlocked items around them.
   - **Live Visual Diff**: When an itinerary change is triggered, the modified day displays an amber alert banner and a pulsating border to immediately draw the curator's attention.

---

## 5. Dislocation & Routing Algorithm (Inspired by Stippl)

In modern travel curation, **dislocation between places (transits, transfers, walking routes)** is not a footnote — it determines the viability and luxury feel of the entire journey. 

Drawing inspiration from **[Stippl](https://www.stippl.io/)**, our UI mock implements a 3-tier dislocation model:

### 5.1 Timeline Dislocation & Transit Cards (`TransitConnector.tsx`)
In line with Stippl's clean UX, **all transfers are rendered as lightweight dislocation cards instead of oversized activity cards**:
- **Seamless Timeline Flow**: Airport meet-and-greets, city-to-city transfers, and movements between monuments are rendered along the vertical connecting track with their scheduled departure time, transit mode, duration, distance, and safety buffers.
- **Modality Badges**: 
  - `Private Chauffeur` (Mercedes Sedan / V-Class)
  - `Curated Flat Walk` (Level sidewalks bypassing calçada stairs)
  - `Scenic Boat / Rabelo` (Vintage Douro wooden boat river crossing)
  - `Scenic Rail` (Linha do Douro / Alfa Pendular)
- **Time & Distance Calculations**: e.g., `18 min · 7.8 km` or `4 min · 280 m`.
- **Traffic Safety Buffer**: Explicit buffers (e.g. `+15m buffer`) to guarantee travelers never arrive stressed for table reservations.
- **Algorithm Verification Badge**: Indicates that the route was verified against client constraints (e.g., Rule R15: Zero steep stairs, door-to-door drop-offs).

### 5.2 Routing Algorithm Inspector Modal (`TransitInspectorModal.tsx`)
Clicking any dislocation card opens an in-depth inspector modal:
- Shows precise **Origin** and **Destination** waypoints.
- Details the **Algorithm Rationale** (why this route and modality were chosen over alternatives).
- Explains the **Traffic Buffer & Pacing** calculation (preserving the client's 90-minute dining pace - Rule R02).

### 5.3 AI Copilot Routing Adjustments
Travel designers can prompt the assistant:
> *"Optimize transfers & route buffers (Algorithm)"*  
The copilot recalculates driving legs on Day 4 (Lisbon to Douro Valley), adds scenic N222 photo stops, updates the traffic buffer, and visually highlights Day 4 in real-time.

---

## 6. How to Run the Dashboard

### Prerequisites
- Node.js 18.18+ or 20+
- npm (or pnpm / yarn / bun)

### Running Locally

1. **Navigate to the workspace directory**:
   ```bash
   cd dmc-workspace
   ```

2. **Install dependencies** (if not already installed):
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev -- -p 3001
   ```
   *(Port `3001` is used to avoid conflicts with other local services on `3000`)*.

4. **Open in your browser**:
   Navigate to: **[http://localhost:3001](http://localhost:3001)**

---

## 7. Recommended Demo Walkthrough

To review the full experience in under 2 minutes:

1. **Start on the Intake Screen**:
   - Notice the BLU Costa Travel branding, editorial quote, and curated sections.
   - Click **"Fill Sarah & James Demo"** in the top right to verify that the pipeline fields (interests, mobility, allergies) are populated.
2. **Generate the Itinerary**:
   - Click **"Generate Curation Itinerary"** at the bottom.
   - Watch the 5-step curation modal execute and transition automatically into the workspace.
3. **Explore the Curated Journey & Stippl-Style Dislocation Cards**:
   - Review Day 1 to Day 7.
   - Notice that airport meet-and-greets and inter-city transfers are rendered seamlessly as **dislocation cards** rather than oversized activity cards.
   - Look between activities at the **Transit Connectors** (dashed timeline rails with private chauffeur, walking, and scenic boat legs).
   - **Click any Dislocation / Transit Card** (e.g. Airport transfer or SUD Lisboa to Jerónimos) to open the **Routing Algorithm Inspector Modal**, showing traffic buffer safety and Rule R15 compliance.
4. **Interact with the AI Copilot for Routing**:
   - In the right-hand panel, click the suggestion chip: **"Optimize transfers & route buffers (Algorithm)"**.
   - Watch the assistant recalculate the Lisbon to Douro driving leg with a +20m traffic buffer and automatically highlight **Day 4**.
   - Click other suggestion chips like **"Make Day 3 more relaxed (R01)"** or **"Optimize budget to €4,850"**.
5. **Export or Reset**:
   - Click the download icon in the chat header to export the copilot conversation history as Markdown.
   - Click **"Edit Brief"** or **"+ New Trip Brief"** in the sidebar to start another curation cycle.

---

## 8. Production Build Validation

To verify static generation and TypeScript types:

```bash
npm run build
```

Expected output:
```
▲ Next.js 16.3.6 (Turbopack)
✓ Compiled successfully
✓ Finished TypeScript in <1s
✓ Generating static pages (4/4)
Route (app)
┌ ○ /
└ ○ /_not-found
```
All routes are pre-rendered statically with 0 lint or TypeScript errors.
