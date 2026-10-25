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

// The WhatsApp webhook joins messages carrying this reference to the same conversation.
function journeyReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `BLU-${[...bytes].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

const contactShared = /[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d\s().-]{7,}\d/;
const contactRequested = /\b(e-?mail|phone|contact detail|best way to reach)/i;

function whatsappLink(reference) {
  const base = window.BLU_WHATSAPP_URL || "https://wa.me/351915784212";
  const note = `Hello BLU, I would like to continue my journey ${reference}`;
  return `${base}${base.includes("?") ? "&" : "?"}text=${encodeURIComponent(note)}`;
}

export function App() {
  const sessionId = useMemo(journeyReference, []);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([opening]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [journeyConsent, setJourneyConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  // "hidden" until contact details come up, then "asking" until the visitor answers once.
  const [consentPrompt, setConsentPrompt] = useState("hidden");
  const listRef = useRef(null);
  const publishedIds = useRef(new Set());
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, pending, consentPrompt]);

  async function publish(message, consent = {}) {
    const endpoint = window.BLU_CONVERSATION_EVENTS_ENDPOINT;
    const retainJourney = consent.journeyConsent ?? journeyConsent;
    const allowAnalytics = consent.analyticsConsent ?? analyticsConsent;
    if (!endpoint || !retainJourney || message.local || publishedIds.current.has(message.id)) return;
    const actor = message.role === "user" ? "customer" : message.role === "system" ? "system" : "assistant";
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journeyConsent: true, analyticsConsent: allowAnalytics, conversationId: sessionId, synthetic: false, source: "blu-cloud-site", ...(message.eventType ? { eventType: message.eventType, context: message.context } : {}), message: { actor, channel: "website", text: message.text } }) });
      if (response.ok) publishedIds.current.add(message.id);
    } catch (error) { console.warn("Conversation analytics unavailable", error); }
  }

  function askForConsentWhen(condition) {
    if (condition && !journeyConsent) setConsentPrompt(current => (current === "hidden" ? "asking" : current));
  }

  // Saves everything said so far, then records the consent itself so curators can find the lead.
  async function grantConsent() {
    setJourneyConsent(true);
    setConsentPrompt("answered");
    for (const message of messagesRef.current) await publish(message, { journeyConsent: true });
    await publish({ id: `consent-${sessionId}`, role: "system", eventType: "lead.consent.granted", context: { journeyReference: sessionId, stage: "curator-follow-up" }, text: "The visitor agreed that a BLU curator may contact them about this journey." }, { journeyConsent: true });
  }

  function declineConsent() {
    setConsentPrompt("answered");
    setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", local: true, text: "No problem: nothing from this conversation is saved. You can still continue on WhatsApp below whenever you like." }]);
  }

  async function changeJourneyConsent(event) {
    if (event.target.checked) await grantConsent();
    else setJourneyConsent(false);
  }

  async function submit(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value || pending) return;
    const userMessage = { id: crypto.randomUUID(), role: "user", text: value };
    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory); setText(""); setPending(true);
    askForConsentWhen(contactShared.test(value));
    await publish(userMessage);
    try {
      let reply;
      if (window.BLU_CHAT_API) {
        // Only the real exchange: the greeting and local error notes are not model turns.
        const history = messages.filter(message => message.id !== opening.id && !message.local).slice(-10).map(({ role, text }) => ({ role, text }));
        const response = await fetch(window.BLU_CHAT_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: sessionId, message: value, messages: history, analyticsConsent }) });
        if (!response.ok) throw new Error(`Chat returned ${response.status}`);
        reply = (await response.json()).reply;
      } else {
        await new Promise(resolve => setTimeout(resolve, 420));
        reply = localReply(nextHistory);
      }
      const assistantMessage = { id: crypto.randomUUID(), role: "assistant", text: reply };
      setMessages(current => [...current, assistantMessage]);
      askForConsentWhen(contactRequested.test(reply));
      await publish(assistantMessage);
    } catch {
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", local: true, text: "I cannot continue the conversation just now. You can continue on WhatsApp below or reach the BLU team at hello@blucostatravel.com." }]);
    } finally { setPending(false); }
  }

  return <>
    <button className="concierge-launcher" type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="blu-concierge">Talk to BLU</button>
    <section id="blu-concierge" className={`concierge-panel ${open ? "is-open" : ""}`} aria-hidden={!open} aria-label="BLU travel concierge">
      <header className="concierge-header"><div><span>BLU Costa</span><strong>Travel concierge</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="Close concierge">Close</button></header>
      <div className="concierge-messages" ref={listRef} aria-live="polite">
        {messages.map(message => <p key={message.id} className={`concierge-message ${message.role}`}>{message.text}</p>)}
        {pending && <p className="concierge-message assistant pending">Considering your answer…</p>}
        {consentPrompt === "asking" && !journeyConsent && <div className="concierge-consent" role="group" aria-label="Curator follow-up consent">
          <p>May a BLU curator contact you about this journey? We will keep this conversation so they can follow up.</p>
          <div><button type="button" onClick={grantConsent}>Yes, save and follow up</button><button type="button" onClick={declineConsent}>Not now</button></div>
        </div>}
        {journeyConsent && consentPrompt === "answered" && <p className="concierge-message assistant consent-confirmed">Thank you. A curator can now follow up on reference {sessionId}.</p>}
      </div>
      <form className="concierge-form" onSubmit={submit}>
        <label htmlFor="concierge-input">Your message</label>
        <div><input id="concierge-input" value={text} onChange={event => setText(event.target.value)} maxLength="2000" placeholder="Tell us what matters…" /><button disabled={pending}>Send</button></div>
        <label className="analytics-choice"><input type="checkbox" checked={journeyConsent} onChange={changeJourneyConsent} /> Retain this conversation so a curator can follow up on my journey.</label>
        <label className="analytics-choice"><input type="checkbox" checked={analyticsConsent} onChange={event => setAnalyticsConsent(event.target.checked)} /> Also allow this conversation to be used for planning analytics.</label>
        <small className="concierge-privacy">Avoid sharing payment details. You may continue without saving the conversation.</small>
        <a className="concierge-whatsapp" href={whatsappLink(sessionId)} target="_blank" rel="noopener noreferrer">Continue on WhatsApp <span>{sessionId}</span></a>
      </form>
    </section>
  </>;
}
