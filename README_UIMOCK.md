# Estado atual: geração local com catálogo real

O DMC Workspace consulta `warehouse/*.jsonl` através de `POST /api/itineraries`. O catálogo inclui o enriquecimento de `data/reference/structured_dataset.xlsx` após executar o ETL. A página `/references` apresenta propostas e preços históricos separadamente, com proveniência e divergências para revisão.
Arranque na pasta `dmc-workspace` com `npm run dev -- -p 3001` (Node.js 24 LTS).
O warehouse e `config/curation_rule_overrides.json` devem estar disponíveis na pasta pai.
Não é necessário iniciar um serviço Python manualmente nem fornecer credenciais externas.
A exportação traduzida inicia Python no servidor e requer o ambiente e os modelos descritos abaixo,
incluindo para normalizar preferências internas no PDF português. `npm ci` não os instala.

- Cada proposta usa destino, datas, ritmo, interesses, exclusões, esforço e tier.
- Cobertura geográfica inicial: Lisboa, Porto, Sintra, Cascais e Douro. Para `Portugal`, os pontos de chegada/partida determinam as regiões reconhecidas; não há seleção nacional automática.
- A seleção é determinística: pontuação por palavras-chave, preferência por atrações no Soft e experiências no Classic/Signature; Signature prioriza aprofundamento quando descrito no catálogo. Não representa inclusões comerciais aprovadas.
- Os dias incluem chegada e partida. As atividades ficam **por agendar**, com horários, deslocações, acessibilidade e disponibilidade por confirmar. Não há validação completa das 51 regras nem cálculo de rotas.
- Restrições alimentares retiram refeições e experiências alimentares identificadas por texto até validação do fornecedor. A correspondência textual é conservadora, não certifica segurança.
- Notas livres, ocasião, crianças, alojamento, refeições e orçamento requerem revisão do curador; não existe cotação total automática.
- Viagens, bloqueios e conversa persistem no `localStorage` deste navegador. Não existe sincronização entre utilizadores, autenticação ou partilha. Limpar o armazenamento apaga as propostas.
- Edit Brief recupera o briefing da viagem. Regenerar uma viagem com bloqueios é recusado até serem removidos. O assistente executa apenas `remover última atividade do dia N`; outros pedidos não alteram a proposta.
- O botão Export PDF gera um PDF real da versão guardada. A partilha pública continua desativada.
- `config/curation_rule_overrides.json` é a alteração de negócio versionada para Soft/Classic/Signature. Aplica-se na API e na extração do Excel, preservando o ficheiro original. Os artefactos ETL antigos só são atualizados ao reexecutar a pipeline.

Verificação: `npm test` e `npx tsc --noEmit --incremental false`.

## Exportação PDF e histórico de versões

- Gerar ou alterar o conteúdo de uma viagem guarda uma versão imutável no servidor local. Alterações apenas à conversa não criam versões; bloqueios de atividades fazem parte do roteiro.
- A sequência é por ID de viagem: `v001`, `v002`, etc. Regenerar a mesma viagem mantém a cadeia. Uma nova viagem inicia outra cadeia.
- Exportar sem alterações reutiliza a mesma versão e os mesmos bytes do PDF. O documento contém datas, participantes, tier, dias, atividades, preços indicativos, pendências, fontes e identificação da versão.
- Nome: `BLU_<cliente>_<destino>_<início>_a_<fim>_vNNN.pdf`. Cliente e destino são normalizados sem acentos para facilitar pesquisa e compatibilidade; o conteúdo mantém os acentos.
- O painel de versões da viagem permite descarregar documentos anteriores e reabrir a última versão guardada. `/exports` lista o histórico de todas as viagens, mesmo depois de limpar o armazenamento do navegador.
- `exports/itineraries/history.sqlite` guarda os snapshots JSON, sequência, ligação à versão anterior, hashes SHA-256 e PDFs. Cada PDF exportado é também materializado em `exports/itineraries/<id>/`, com JSON de suporte de igual nome. A base SQLite é a fonte autoritativa para descarregar novamente.
- Estes dados ficam fora do ETL e do Git. Faça backup de toda a pasta `exports/`; não a coloque dentro de `data/` ou `warehouse/`. `BLU_EXPORT_DIR` permite definir outra pasta de armazenamento persistente.
- Viagens antigas guardadas só no navegador entram no histórico ao serem exportadas ou alteradas; não é possível reconstruir revisões anteriores que nunca foram guardadas.
- Alterações concorrentes sobre uma versão desatualizada são recusadas; use “Reabrir última versão guardada” antes de continuar.
- Node.js 24 é necessário para o armazenamento SQLite nativo. PDFs usam Arial no Windows ou DejaVu Sans no Linux, se disponíveis; `BLU_PDF_FONT` pode indicar outro TTF. Existe fallback Helvetica.

## Referência histórica do protótipo

O texto abaixo descreve a demonstração anterior, incluindo simulações que foram substituídas. Não representa as capacidades atuais.

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
- **Soft**: Essential, cohesive, and authentic Portuguese cultural highlights.
- **Classic**: Additional curatorial depth, regional artisan workshops, and private tastings.
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
The workspace is pre-rendered; API routes, export history and references use the server at runtime. TypeScript validation is included in the build.


## Idiomas do portal e PDFs

O seletor no topo apresenta bandeiras e seis idiomas: Português, English,
中文（普通话, chinês simplificado), Español, Français e Deutsch. A escolha do
portal fica guardada neste navegador. Os campos mantêm os valores internos de
curadoria; mudar de idioma não altera as regras nem cria uma nova versão.

No roteiro, escolha **Idioma do cliente (PDF)** e clique **Exportar PDF**.
O download é um ZIP com dois PDFs da mesma versão e estrutura: português para a
empresa e o idioma escolhido para o cliente. Se escolher português, inclui
apenas um PDF, sem duplicados. O histórico também permite escolher o idioma.

Exemplos:
- `BLU_Pedro_Lisboa_2026-09-23_a_2026-09-26_v003_PT.pdf`
- `BLU_Pedro_Lisboa_2026-09-23_a_2026-09-26_v003_EN.pdf`

As variantes ficam em `exports/itineraries/<tripId>/` e na tabela
`localized_pdfs` da base de dados de versões, com hash próprio. Cada variante
é arquivada na primeira exportação; exportações seguintes recuperam os mesmos
bytes. A língua não incrementa a versão do roteiro. PDFs antigos são preservados.
A tradução é automática e local, incluindo descrições livres do catálogo.

### Preparar tradução local noutro computador

A partir da raiz do projeto, com o ambiente Python criado:

```powershell
.\.venv\Scripts\python.exe -m pip install -r translations/requirements.txt
.\.venv\Scripts\python.exe -B translations/setup_models.py
```

A instalação inicial precisa de internet e descarrega os modelos para
`.tools/translation-models`. Depois, a tradução funciona sem serviços externos;
os textos não são enviados para uma API de tradução. A cache local fica em
`exports/translations/cache.sqlite`. O primeiro pedido pode demorar enquanto
os modelos carregam. Inglês serve de língua intermédia quando necessário.

No Windows, os PDFs chineses usam Microsoft YaHei do sistema. Noutros sistemas,
configure `BLU_PDF_CJK_FONT` com uma fonte TTF/OTF que inclua chinês. Para uma
coleção TTC, configure também `BLU_PDF_CJK_FACE` com o nome PostScript da fonte.
`BLU_TRANSLATION_PYTHON` permite escolher outro executável Python.

Para atualizar o catálogo estático do portal depois de alterar textos:
`python translations/build_ui_catalogue.py`. As traduções geradas ficam
versionadas em `dmc-workspace/src/i18n/messages.json`. Correções editoriais ficam em
`translations/ui_overrides.json` e são preservadas ao regenerar o catálogo.


## Verificação de responsividade

Com o portal em execução, na pasta `dmc-workspace`:

```powershell
npm ci
npx playwright install chromium
npm run test:responsive
```

`PORTAL_URL` permite mudar o endereço (predefinição: http://127.0.0.1:3001).
Para usar Edge instalado no Windows: `$env:BROWSER_CHANNEL="msedge"`.
`$env:STRESS="1"` ativa um cenário adicional com 12 dias e títulos longos.
Os testes usam dados locais de teste e simulam as APIs de tradução e histórico;
não gravam viagens no servidor e não validam a tradução nem a exportação PDF.
Cobrem seis idiomas, larguras de 320 a 1440 px, orientação horizontal,
menu sobreposto, foco por teclado, fecho por Escape, altura e overflow.
Em 640 px verificam também texto base ampliado a 200%, distinto do zoom real.
A emulação de toque não substitui a validação em dispositivos físicos,
nomeadamente Safari/iOS e comportamento do teclado virtual.


## Navegação principal

A top bar contém o logótipo BLU, Workspace, Catálogo, Histórico, Referências,
Lixo e o seletor de idioma. Mantém-se fora da área de scroll e destaca a página
ativa. Abaixo de 1024 px os destinos ficam no menu compacto; a seleção fecha-o.
A barra lateral do workspace continua dedicada às viagens recentes e novas viagens.

`/catalog` permite gerir a oferta (ver abaixo). `/trash` continua a ser uma página
de entrada; a remoção/restauro de viagens ainda não está implementada.
Histórico (`/exports`) e Referências (`/references`) mantêm as funcionalidades existentes.

Com o portal em execução, `npm run test:navigation` verifica os cinco destinos,
o destaque da página ativa, o menu móvel e a posição da top bar durante o scroll,
nos seis idiomas. Usa as mesmas variáveis `PORTAL_URL` e `BROWSER_CHANNEL` dos testes
 de responsividade.

## Leitura do roteiro

O topo destaca cliente, destino e datas. Preferências, restrições e ferramentas
de exportação ficam em secções expansíveis. A navegação por dias mantém o dia
selecionado destacado; os cartões seguem a ordem horário, nome, localização,
descrição e estado, com os detalhes de curadoria recolhidos.

No computador, o assistente abre à direita com a altura do workspace. Pode ser
recolhido para alargar o roteiro e reaberto pelo botão redondo.

Os estados não representam reservas: Rascunho identifica a proposta preliminar,
Por confirmar identifica atividades propostas, Protegida indica bloqueio de edição
e Exportada indica exportação da versão apresentada.

Com o portal em execução, `node tests/browser/itinerary-visual.mjs` (na pasta
`dmc-workspace`) verifica os estados, detalhes sem fonte, seleção dos dias e o
assistente recolhível no computador. Aceita `PORTAL_URL` e `BROWSER_CHANNEL`;
simula tradução e histórico, sem efetuar exportações reais.

## Gestão do catálogo

Em **Catálogo**, escolha Atividades, Restaurantes ou Experiências. Pode pesquisar
por nome, descrição, localização, fornecedor ou ID; filtrar por estado e localização;
criar, editar e inativar registos. Cada categoria apresenta os seus campos próprios.
Os textos introduzidos no catálogo são a fonte em português; o idioma do portal
traduz os controlos, sem reescrever os dados editados.

1. Os registos existentes são importados como **Em revisão**, sem aprovação automática.
2. **Novo registo** começa em **Rascunho**. Para aprovar, preencha nome, localização,
   descrição, duração, preço, fonte, acessibilidade e esforço. Preços são referências,
   com moeda/unidade; a aprovação de catálogo não confirma reservas.
3. Guarde com o estado **Aprovado**, indicando o motivo da alteração.
4. Carregue em **Atualizar catálogo para os roteiros**. Esta ação executa o ETL
   Python instalado na `.venv` (ou `BLU_PYTHON`, quando definido). Aguarde a conclusão.
   A indicação **Disponível para novos roteiros** confirma que a revisão foi processada.
5. **Inativar** retira imediatamente o registo de novas gerações, mesmo antes do
   próximo ETL. Uma alteração a um aprovado também exige reprocessar a nova revisão.
   As propostas já guardadas não são alteradas. Para reativar, edite o estado e atualize.

Sem registos aprovados/processados, a geração explica que é necessário rever o catálogo.
O ETL também pode ser executado pela CLI habitual: `python -m etl.pipeline --data-dir data --output-dir warehouse`.

A fonte editável e o histórico ficam em **`data/portal/catalog.sqlite`**, fora do Git.
Cada gravação gera uma revisão transacional com ID estável, data, motivo e cópia
completa dos campos. O histórico é consultável no portal; edições concorrentes
baseadas numa revisão antiga são recusadas. Não há eliminação definitiva.
O ETL lê esta fonte e produz o warehouse; o formulário nunca escreve diretamente nele.
O manifesto regista o hash do snapshot do catálogo consumido.

Para transportar os registos e o histórico para outro computador, pare o portal
e o ETL e copie `data/portal/catalog.sqlite`, além das restantes fontes em `data/`.
Depois execute o ETL no computador de destino. Um clone Git, por si só, não inclui
os registos locais. A gestão usa o mesmo contexto local do portal: ainda não existe
autenticação nem identificação individual do autor das revisões.

Se o servidor for interrompido durante uma atualização, confirme que o processo ETL
terminou antes de remover o bloqueio residual `data/portal/etl.lock` e tentar novamente.
Não execute atualizações pela CLI e pelo portal simultaneamente.

Validação: `npm test` cobre persistência, conflitos, estados e geração;
`npm run test:catalog-etl` faz o percurso real Node → ETL Python → geração em pastas
temporárias, requerendo as dependências Python. Com o portal aberto,
`npm run test:catalog` verifica formulários por categoria, pesquisa, edição, conflitos,
inativação, histórico e responsividade nos seis idiomas, usando APIs simuladas.

### Compatibilidade com o questionário

O formulário do catálogo inclui um perfil estruturado que usa as mesmas opções
do briefing: interesses, níveis Soft/Classic/Signature, ritmos, preferências de
início, ritmos de refeição, mobilidade, alimentação e exclusões. As opções são
partilhadas em `src/lib/brief-options.ts` para evitar divergências entre os formulários.

- Os interesses associados aumentam a prioridade na seleção. Listas vazias de
  níveis, ritmos e início não impõem limites; opções marcadas limitam a elegibilidade.
- As exclusões identificam respostas do cliente que impedem selecionar o registo.
  Mantêm-se também os filtros conservadores de exclusão por texto.
- Necessidades de mobilidade e restrições alimentares exigem correspondência para
  todas as opções do cliente e notas com fonte/data/condições verificadas. Alimentação
  desconhecida impede sugestões a clientes com restrições. Restaurantes incluem
  sempre alimentação; atividades declaradas sem comida não exigem opções alimentares.
- Para famílias, indicar que aceita crianças e, se aplicável, uma idade mínima.
  Neste caso o briefing precisa de uma idade por criança, separada por vírgulas.
  Adequação desconhecida não é tratada como compatibilidade. Idades mínimas superiores
  a 18 anos exigem revisão manual, pois o briefing não recolhe as idades dos adultos.
- O máximo de participantes inclui adultos e crianças. O período de datas limita
  os dias em que o registo pode ser sugerido, sem constituir disponibilidade confirmada.
- O preço numérico de referência por pessoa é multiplicado por todos os participantes.
  A soma dos preços conhecidos selecionados não ultrapassa o orçamento da viagem;
  preços desconhecidos, alojamento e transportes não estão incluídos nessa estimativa.
  Não se trata de uma cotação completa nem de um cálculo de tarifas infantis.
- O esforço físico deve estar definido. Perfis estruturados com esforço por confirmar
  ficam fora da seleção automática. Registos antigos sem perfil mantêm as regras
  anteriores até serem revistos no formulário; não recebem compatibilidades automáticas.

Este perfil segue a mesma cadeia **fonte local → ETL → warehouse → geração**, com
revisões no histórico. Após guardar, atualizar o catálogo para os roteiros.
Os interesses correspondentes e condições utilizadas surgem nos detalhes de curadoria
das atividades. O motor atual é baseado em regras: não interpreta automaticamente
notas livres/ocasiões especiais. A preferência de alojamento não classifica atividades,
restaurantes ou experiências; hotéis não fazem parte destas três categorias.

## Confirmações por atividade

No cartão do roteiro, abra **Dados e confirmações** para preencher horário, local,
preço acordado/unidade, fornecedor, referência, contacto e evidência da confirmação
(ou motivo de dispensa de reserva). Cada pendência tem um campo de detalhes e uma
marca de resolução. **Guardar progresso** conserva os dados parciais numa versão.

**Confirmar atividade** exige horário, local, preço, evidência e todas as pendências
resolvidas com detalhes. O estado passa a **Confirmada** apenas após guardar com
sucesso. Trata-se de confirmação manual pelo curador, sem chamadas a fornecedores.
Pode editar e **Guardar e voltar a pendente**; as versões anteriores são preservadas.
Atividades protegidas devem ser desprotegidas antes de editar. Atividades confirmadas
não são removidas pelo assistente e impedem regeneração até reabrir a confirmação.

As confirmações seguem no snapshot do roteiro, no armazenamento local e nos PDFs.
As pendências resolvidas deixam de aparecer como pendentes no respetivo cartão/PDF;
os avisos gerais da proposta permanecem. A exportação não confirma atividades.
Referências de reserva, contactos e nomes dos fornecedores são preservados nas
traduções do PDF. Os dados preenchidos são mantidos no formulário se a gravação falhar.

### Manutenção e validação do código

A lógica de viagens e catálogo está em `src/hooks/useWorkspace.ts` e
`src/hooks/useCatalog.ts`. As páginas compõem a interface; o editor e o histórico
do catálogo estão em `src/components/catalog/`. A validação dos snapshots e dos
dados transportados do catálogo está centralizada em `src/lib/snapshot-validation.ts`
e `src/lib/catalog-details.ts`.

Dentro de `dmc-workspace`, executar `npm run check` para verificar lint sem avisos,
tipos, formatação e testes. `npm run format` aplica a formatação definida no projeto;
`npm run build` verifica a compilação de produção.

Com o portal iniciado na porta 3001, executar `npm run test:responsive`,
`npm run test:navigation`, `npm run test:catalog`, `npm run test:confirmations`
e `npm run test:itinerary`. No Windows, pode definir `BROWSER_CHANNEL=msedge`
para usar o Edge instalado. Estes testes usam APIs simuladas; complementar com
`npm run test:catalog-etl`, que verifica a integração real em dados temporários.
Na raiz, executar `python -B -m unittest discover -s tests -v` para o ETL e
o extrator de textos traduzíveis.

A extração de traduções aceita componentes `T` em várias linhas. Textos dinâmicos
continuam a precisar de entradas em `translations/ui_sources.json` ou de
substituições explícitas em `translations/ui_overrides.json`.

`node tests/browser/confirmations.mjs` verifica o fluxo em computador e telemóvel,
incluindo erro de gravação, recuperação, recarregamento e reabertura, com APIs simuladas.
Os testes de confirmação/versões verificam a persistência real e o conteúdo do PDF.

Os cartões gerados transportam também morada, preço de referência, fornecedor,
contacto, horário de funcionamento e condições de acessibilidade/alimentação do
catálogo. Estes dados preenchem automaticamente os campos e os detalhes das
pendências; uma confirmação já guardada prevalece sobre os valores do catálogo.
Roteiros antigos sem estes dados tentam consultar o registo atual pelo identificador,
sem modificar as versões existentes; os dados importados ficam na próxima gravação.
Horário de funcionamento não é convertido automaticamente na hora da visita.
Preços conhecidos continuam a exigir validação para a viagem, sem os voltar a escrever.
Necessidades de acessibilidade/alimentação já verificadas pelo perfil do catálogo
não geram pendências genéricas repetidas nos novos roteiros. A evidência pode ser
registada nas próprias pendências, dispensando a repetição no campo de notas.


### Preenchimento do catálogo e preços estruturados

O editor agrupa identificação, logística, condições, preços e fonte. As barras
medem requisitos de aprovação, excluindo campos opcionais e não aplicáveis à
categoria. Nome e motivo continuam necessários para guardar um rascunho.
Ao introduzir um preço estruturado, indique moeda, unidade e estado; o valor
pode ficar vazio quando está por confirmar. Zero representa explicitamente
um serviço gratuito. Confirmar o preço não confirma uma reserva.

Os registos antigos mantêm o texto original. Preços estruturados são guardados
no histórico, apresentados no catálogo e transportados no ETL em `_pricing`.
A comparação automática por pessoa em EUR utiliza apenas preços com essa
moeda e unidade e estado confirmado ou estimado. Outros preços não são
convertidos automaticamente. Com preço estruturado, o campo duplicado de
preço por pessoa no perfil de compatibilidade deixa de ser apresentado.


### Briefing por etapas e personalização

O briefing organiza-se em Cliente, Viagem, Preferências, Restrições e Rever.
As respostas mantêm-se ao mudar de etapa; a geração exige a validação final.
O resumo permite voltar a cada etapa para editar. Briefings antigos sem
`personalization` continuam válidos e mantêm o comportamento anterior.

As subcategorias imperdíveis têm prioridade entre ofertas elegíveis; as opções
a evitar excluem essas subcategorias e registos sem classificação verificável.
Pedidos imperdíveis não satisfeitos aparecem nas pendências. A margem de 0%,
10% ou 20% aplica-se ao limite dos custos conhecidos, sem transformar os preços
em cotação. Pausas adicionais limitam a duas sugestões por dia.

O acompanhamento filtra a modalidade explícita do catálogo (com guia, sem guia
ou privado), sem inferir condições a partir de descrições. Restaurantes não são
filtrados por acompanhamento. Idioma do guia e necessidades livres do grupo
ficam para confirmação pelo fornecedor/curador; não são garantias automáticas.
Teste de interface: `node tests/browser/briefing.mjs`, com portal na porta 3001.


### Geração diversificada e horários propostos

A seleção distribui as vagas entre atividades, restaurantes e experiências
compatíveis. Mantém os limites de duas, três ou quatro sugestões e alterna a
categoria inicial entre dias; duas vagas não garantem as três categorias no
mesmo dia. Restrições, aprovações, validade e orçamento continuam a filtrar a oferta.

Horários simples (por exemplo, `Todos os dias 09:00–18:00` ou
`09:00–12:00; 14:00–18:00`) e durações explícitas permitem propor intervalos.
São respeitados os encerramentos semanais reconhecidos. Refeições começam entre
12:00 e 14:00 e respeitam o ritmo de refeição; a agenda proposta termina até às
18:00. Entre intervalos são reservados 30 minutos, ou 45 com pausas adicionais.
Estas margens são estimativas, não tempos calculados de percurso.

Intervalos aparecem como **propostos**, sem confirmar reservas. Horários sazonais,
encerramentos por data, durações ou condições ambíguas ficam **Por agendar**,
com indicação de revisão manual; não se garante viabilidade desses itens até
serem agendados. Os intervalos propostos não se sobrepõem.

Preços estruturados em EUR por pessoa, grupo ou serviço alimentam o controlo de
custos conhecidos. Valores por hora, noutras moedas ou por confirmar não são
convertidos nem tratados como gratuitos. Os cartões indicam que o custo total
está por confirmar; zero só representa um preço explicitamente gratuito.
