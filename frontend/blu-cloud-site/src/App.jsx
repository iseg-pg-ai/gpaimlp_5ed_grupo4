import { useEffect, useMemo, useRef, useState } from "react";

const opening = { id: "opening", role: "assistant", text: "Tell me what you have in mind for Portugal. I can explore the possibilities with you, then pass the useful details to a curator." };
const prompts = [
  ["destination", /lisbon|sintra|porto|douro|alentejo|algarve|portugal/i, "Which part of Portugal would you like to explore?"],
  ["dates", /\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|week|day)\b/i, "When are you travelling, and how flexible are your dates?"],
  ["party", /\b(solo|alone|couple|family|families|friends|people|adults|children|kids|\d+\s*(people|adults|children|guests))\b/i, "Who will share the journey with you?"],
  ["interests", /food|wine|history|art|culture|architecture|nature|coast|river|walking|craft|garden|relax/i, "What would make the journey worth remembering for you?"],
  ["budget", /\b(budget|eur|euro|€|£|\$|\d{3,})\b/i, "What budget range should the curator work within?"],
];

function localReply(history) {
  const joined = history.filter(message => message.role === "user").map(message => message.text).join(" ");
  const missing = prompts.find(([, expression]) => !expression.test(joined));
  return missing ? missing[2] : "Please provide your email address or phone number so a curator can confirm availability and prepare a proposal shaped around what you are looking for.";
}

// One tap answers the next missing planning detail; "Skip" lets the visitor move on.
const starters = ["A week in Lisbon and Sintra", "Food and wine journey", "History and culture"];
const quickReplies = {
  destination: ["Lisbon and Sintra", "Porto and the Douro", "Alentejo", "Algarve", "Not sure yet"],
  timeframe: ["Flexible dates", "Spring 2027", "Summer 2027", "Autumn 2027"],
  party: ["Solo", "2 adults", "Family with children", "Group of friends"],
  budget: ["Under €3,000", "€3,000–6,000", "€6,000–10,000", "Over €10,000"],
};
const skipReply = "I'd rather skip that for now.";

// The WhatsApp webhook joins messages carrying this reference to the same conversation.
function journeyReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `BLU-${[...bytes].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

// Campaign parameters travel with the journey so the CRM can attribute leads.
function acquisition() {
  const params = new URLSearchParams(window.location.search);
  const fields = { socialSource: "utm_source", campaign: "utm_campaign", medium: "utm_medium", content: "utm_content" };
  return Object.fromEntries(Object.entries(fields).map(([key, param]) => [key, (params.get(param) || "").slice(0, 120)]).filter(([, value]) => value));
}

// Demo mode (?demo=1) is for presentations: a reset button, and every event marked synthetic.
const demoMode = new URLSearchParams(window.location.search).get("demo") === "1";

const contactShared = /[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d\s().-]{7,}\d/;
const contactRequested = /\b(e-?mail|phone|contact detail|best way to reach)/i;

function whatsappLink(reference) {
  const base = window.BLU_WHATSAPP_URL || "https://wa.me/351915784212";
  const note = `Hello BLU, I would like to continue my journey ${reference}`;
  return `${base}${base.includes("?") ? "&" : "?"}text=${encodeURIComponent(note)}`;
}

export function App() {
  const [sessionId, setSessionId] = useState(journeyReference);
  const source = useMemo(acquisition, []);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([opening]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [journey, setJourney] = useState({ details: {}, stage: "exploring", missing: [] });
  const [journeyConsent, setJourneyConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  // "hidden" until contact details or a complete plan come up, then "asking" until answered once.
  const [consentPrompt, setConsentPrompt] = useState("hidden");
  const listRef = useRef(null);
  const publishedIds = useRef(new Set());
  const answeredIds = useRef(new Set());
  const inFlight = useRef(false);
  const messagesRef = useRef(messages);
  const journeyRef = useRef(journey);
  const consentRef = useRef(false);
  // Bumped on reset so a reply still in flight is not shown in the new conversation.
  const generation = useRef(0);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy, consentPrompt]);

  function append(message) {
    messagesRef.current = [...messagesRef.current, message];
    setMessages(messagesRef.current);
  }

  async function publish(message, consent = {}) {
    const endpoint = window.BLU_CONVERSATION_EVENTS_ENDPOINT;
    const retainJourney = consent.journeyConsent ?? consentRef.current;
    const allowAnalytics = consent.analyticsConsent ?? analyticsConsent;
    if (!endpoint || !retainJourney || message.local || publishedIds.current.has(message.id)) return;
    publishedIds.current.add(message.id);
    const actor = message.role === "user" ? "customer" : message.role === "system" ? "system" : "assistant";
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journeyConsent: true, analyticsConsent: allowAnalytics, conversationId: sessionId, synthetic: demoMode, source: "blu-cloud-site", ...(message.eventType ? { eventType: message.eventType, context: message.context } : {}), message: { actor, channel: "website", text: message.text } }) });
      if (!response.ok) publishedIds.current.delete(message.id);
    } catch (error) {
      publishedIds.current.delete(message.id);
      console.warn("Conversation tracking unavailable", error);
    }
  }

  // Journey metadata is stored only after consent, as one event per change.
  function publishJourney(current = journeyRef.current) {
    const details = current.details;
    if (!Object.keys(details).length && !Object.keys(source).length) return;
    const stage = consentRef.current ? "curator-follow-up" : current.stage;
    const context = { journeyReference: sessionId, ...source, ...details, stage };
    const summary = Object.entries(details).map(([key, value]) => `${key}: ${value}`).join("; ") || "no details yet";
    return publish({ id: `journey-${JSON.stringify(context)}`, role: "system", eventType: "journey.details.updated", context, text: `Journey details (${stage}): ${summary}` });
  }

  function askForConsentWhen(condition) {
    if (condition && !consentRef.current) setConsentPrompt(current => (current === "hidden" ? "asking" : current));
  }

  // Saves everything said so far, then records the consent and the journey for curators.
  async function grantConsent() {
    consentRef.current = true;
    setJourneyConsent(true);
    setConsentPrompt("answered");
    for (const message of messagesRef.current) await publish(message, { journeyConsent: true });
    await publish({ id: `consent-${sessionId}`, role: "system", eventType: "lead.consent.granted", context: { journeyReference: sessionId, stage: "curator-follow-up" }, text: "The visitor agreed that a BLU curator may contact them about this journey." }, { journeyConsent: true });
    await publishJourney();
  }

  function declineConsent() {
    setConsentPrompt("answered");
    append({ id: crypto.randomUUID(), role: "assistant", local: true, text: "No problem: nothing from this conversation is saved. You can still continue on WhatsApp below whenever you like." });
  }

  async function changeJourneyConsent(event) {
    if (event.target.checked) await grantConsent();
    else { consentRef.current = false; setJourneyConsent(false); }
  }

  // Sends every unanswered visitor message as one turn; messages typed meanwhile wait for the next turn.
  async function pump() {
    if (inFlight.current) return;
    const all = messagesRef.current;
    const queued = all.filter(message => message.role === "user" && !answeredIds.current.has(message.id));
    if (!queued.length) return;
    inFlight.current = true;
    setBusy(true);
    const turn = generation.current;
    const firstQueued = all.indexOf(queued[0]);
    try {
      let reply;
      let update;
      if (window.BLU_CHAT_API) {
        // Only the real exchange: the greeting and local notes are not model turns.
        const history = all.slice(0, firstQueued).filter(message => message.id !== opening.id && !message.local).slice(-10).map(({ role, text }) => ({ role, text }));
        const response = await fetch(window.BLU_CHAT_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: sessionId, message: queued.map(message => message.text).join("\n"), messages: history, journey: journeyRef.current.details, analyticsConsent }) });
        if (!response.ok) throw new Error(`Chat returned ${response.status}`);
        const result = await response.json();
        reply = result.reply;
        if (result.journey) update = { details: result.journey, stage: result.stage || "exploring", missing: result.missing || [] };
      } else {
        await new Promise(resolve => setTimeout(resolve, 420));
        reply = localReply(messagesRef.current);
      }
      if (turn !== generation.current) return;
      queued.forEach(message => answeredIds.current.add(message.id));
      const assistantMessage = { id: crypto.randomUUID(), role: "assistant", text: reply };
      append(assistantMessage);
      const changed = update && JSON.stringify(update.details) !== JSON.stringify(journeyRef.current.details);
      if (update) { journeyRef.current = update; setJourney(update); }
      askForConsentWhen(contactRequested.test(reply) || update?.stage === "ready-for-curator");
      await publish(assistantMessage);
      if (changed) await publishJourney(update);
    } catch {
      if (turn !== generation.current) return;
      queued.forEach(message => answeredIds.current.add(message.id));
      append({ id: crypto.randomUUID(), role: "assistant", local: true, text: "I cannot continue the conversation just now. You can continue on WhatsApp below or reach the BLU team at hello@blucostatravel.com." });
    } finally {
      if (turn === generation.current) { inFlight.current = false; setBusy(false); }
    }
    if (turn === generation.current) void pump();
  }

  function resetDemo() {
    generation.current += 1;
    inFlight.current = false;
    publishedIds.current = new Set();
    answeredIds.current = new Set();
    consentRef.current = false;
    messagesRef.current = [opening];
    journeyRef.current = { details: {}, stage: "exploring", missing: [] };
    setMessages(messagesRef.current);
    setJourney(journeyRef.current);
    setJourneyConsent(false);
    setAnalyticsConsent(false);
    setConsentPrompt("hidden");
    setBusy(false);
    setText("");
    setSessionId(journeyReference());
  }

  function send(value) {
    const clean = value.trim();
    if (!clean) return;
    const userMessage = { id: crypto.randomUUID(), role: "user", text: clean };
    append(userMessage);
    askForConsentWhen(contactShared.test(clean));
    void publish(userMessage);
    void pump();
  }

  function submit(event) {
    event.preventDefault();
    send(text);
    setText("");
  }

  const answered = messages.some(message => message.role === "user");
  const nextDetail = journey.missing.find(field => quickReplies[field]);
  const chips = !answered ? starters : nextDetail && !busy ? quickReplies[nextDetail] : [];

  return <>
    <button className="concierge-launcher" type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="blu-concierge">Talk to BLU</button>
    <section id="blu-concierge" className={`concierge-panel ${open ? "is-open" : ""}`} aria-hidden={!open} aria-label="BLU travel concierge">
      <header className="concierge-header"><div><span>BLU Costa{demoMode ? " · demo" : ""}</span><strong>Travel concierge</strong></div>{demoMode && <button type="button" className="demo-reset" onClick={resetDemo} aria-label="Start a new demo conversation">New conversation</button>}<button type="button" onClick={() => setOpen(false)} aria-label="Close concierge">Close</button></header>
      <div className="concierge-messages" ref={listRef} aria-live="polite">
        {messages.map(message => <p key={message.id} className={`concierge-message ${message.role}`}>{message.text}</p>)}
        {busy && <p className="concierge-message assistant pending">BLU is writing…</p>}
        {consentPrompt === "asking" && !journeyConsent && <div className="concierge-consent" role="group" aria-label="Curator follow-up consent">
          <span>May a BLU curator contact you about this journey?</span>
          <button type="button" onClick={grantConsent}>Yes</button><button type="button" onClick={declineConsent}>Not now</button>
        </div>}
      </div>
      {chips.length > 0 && <div className="concierge-chips" aria-label="Suggested answers">
        {chips.map(chip => <button key={chip} type="button" onClick={() => send(chip)}>{chip}</button>)}
        {answered && <button type="button" className="skip" onClick={() => send(skipReply)}>Skip</button>}
      </div>}
      <form className="concierge-form" onSubmit={submit}>
        <label htmlFor="concierge-input">Your message</label>
        <div><input id="concierge-input" value={text} onChange={event => setText(event.target.value)} maxLength="2000" placeholder="Tell us what matters…" /><button>Send</button></div>
        <label className="analytics-choice"><input type="checkbox" checked={journeyConsent} onChange={changeJourneyConsent} /> Keep this conversation so a curator can follow up.</label>
        <label className="analytics-choice"><input type="checkbox" checked={analyticsConsent} onChange={event => setAnalyticsConsent(event.target.checked)} /> Also allow it to be used for planning analytics.</label>
        <small className="concierge-privacy">Avoid sharing payment details. You may continue without saving the conversation.</small>
        <a className="concierge-whatsapp" href={whatsappLink(sessionId)} target="_blank" rel="noopener noreferrer">Continue on WhatsApp <span>{sessionId}</span></a>
      </form>
    </section>
  </>;
}
