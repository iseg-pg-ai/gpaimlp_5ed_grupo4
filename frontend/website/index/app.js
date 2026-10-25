const fallbackConfig = {
  whatsappUrl: "https://wa.me/351915784212",
  chatEndpoint: "",
  conversationEventsEndpoint: "",
  defaultSource: "direct",
  supportedSources: ["instagram", "facebook", "pinterest", "linkedin", "whatsapp", "direct"],
};

const runtimeConfig = {
  whatsappUrl: window.BLU_WHATSAPP_URL || "",
  chatEndpoint: window.BLU_CHAT_API || "",
  conversationEventsEndpoint: window.BLU_CONVERSATION_EVENTS_ENDPOINT || "",
};

const safeValue = (value, maximum = 120) => String(value || "").trim().slice(0, maximum);
const bytes = crypto.getRandomValues(new Uint8Array(8));
const generatedReference = `BLU-${[...bytes].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const journeyReference = sessionStorage.getItem("bluJourneyReference") || generatedReference;
sessionStorage.setItem("bluJourneyReference", journeyReference);

const params = new URLSearchParams(location.search);
const rawSource = safeValue(params.get("utm_source") || params.get("source") || "", 40).toLowerCase();
const campaign = safeValue(params.get("utm_campaign"), 80);
const medium = safeValue(params.get("utm_medium"), 40);
const content = safeValue(params.get("utm_content"), 80);

const elements = {
  source: document.querySelector("#source-name"),
  reference: document.querySelector("#journey-ref"),
  messages: document.querySelector("#messages"),
  form: document.querySelector("#context-form"),
  submit: document.querySelector("#chat-submit"),
  input: document.querySelector("#chat-input"),
  destination: document.querySelector("#destination"),
  timeframe: document.querySelector("#timeframe"),
  party: document.querySelector("#party"),
  pace: document.querySelector("#pace"),
  journeyConsent: document.querySelector("#journey-consent"),
  analyticsConsent: document.querySelector("#analytics-consent"),
  whatsapp: document.querySelector("#whatsapp-link"),
  status: document.querySelector("#system-status"),
};

elements.reference.textContent = journeyReference;

let config = fallbackConfig;
let source = fallbackConfig.defaultSource;
let history = [];

function context() {
  return {
    journeyReference,
    socialSource: source,
    campaign,
    medium,
    content,
    destination: safeValue(elements.destination.value, 80),
    timeframe: safeValue(elements.timeframe.value, 80),
    party: safeValue(elements.party.value, 80),
    pace: safeValue(elements.pace.value, 40),
  };
}

function appendMessage(role, text) {
  const item = document.createElement("article");
  item.className = `message ${role}`;
  const avatar = document.createElement("span");
  avatar.textContent = role === "user" ? "YOU" : "BLU";
  const copy = document.createElement("p");
  copy.textContent = text;
  item.append(avatar, copy);
  elements.messages.append(item);
  elements.messages.scrollTo({ top: elements.messages.scrollHeight, behavior: "smooth" });
}

async function publish({ role, text, eventType = "conversation.message.recorded" }) {
  if (!elements.journeyConsent.checked || !config.conversationEventsEndpoint) return false;
  const response = await fetch(config.conversationEventsEndpoint, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventType,
      journeyConsent: true,
      analyticsConsent: elements.analyticsConsent.checked,
      conversationId: journeyReference,
      synthetic: false,
      source: `social-passport:${source}`,
      context: context(),
      message: { actor: role === "user" ? "customer" : role, channel: "website", text },
    }),
  });
  return response.ok;
}

function localReply() {
  const details = context();
  if (!details.destination) return "Which part of Portugal feels closest to the idea?";
  if (!details.timeframe) return "When might you travel, and how flexible can the dates be?";
  if (!details.party) return "Who will share this journey with you?";
  return "That is enough shape for a curator to begin. Continue on WhatsApp with the journey reference, or tell me one detail that would make the experience feel genuinely yours.";
}

async function sendToConcierge(text) {
  if (!config.chatEndpoint) return localReply();
  const response = await fetch(config.chatEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId: journeyReference, message: text, messages: history.slice(-10) }),
  });
  if (!response.ok) throw new Error(`Concierge returned ${response.status}`);
  const result = await response.json();
  return safeValue(result.reply, 4000) || localReply();
}

function updateWhatsAppLink() {
  const note = `Hello BLU — I would like to continue a journey conversation with a curator. Reference: ${journeyReference}`;
  const separator = config.whatsappUrl.includes("?") ? "&" : "?";
  elements.whatsapp.href = `${config.whatsappUrl}${separator}text=${encodeURIComponent(note)}`;
}

elements.form.addEventListener("submit", async event => {
  event.preventDefault();
  const text = safeValue(elements.input.value, 2000);
  if (!text) return;
  elements.submit.disabled = true;
  elements.status.textContent = "";
  appendMessage("user", text);
  history.push({ role: "user", text });
  elements.input.value = "";
  try {
    await publish({ role: "user", text, eventType: "journey.context.captured" });
    const reply = await sendToConcierge(text);
    appendMessage("assistant", reply);
    history.push({ role: "assistant", text: reply });
    await publish({ role: "assistant", text: reply });
  } catch (error) {
    console.warn("Concierge handoff unavailable", error);
    elements.status.textContent = "The cloud concierge is unavailable; WhatsApp can still continue the journey reference.";
  } finally {
    elements.submit.disabled = false;
  }
});

elements.whatsapp.addEventListener("click", () => {
  publish({ role: "system", text: "Visitor requested a WhatsApp curator handoff.", eventType: "channel.handoff.requested" })
    .catch(error => console.warn("Handoff event unavailable", error));
});

try {
  const response = await fetch("../data/channels.json", { cache: "no-store" });
  if (response.ok) config = { ...fallbackConfig, ...(await response.json()), ...Object.fromEntries(Object.entries(runtimeConfig).filter(([, value]) => value)) };
} catch (error) {
  console.warn("Using embedded channel configuration", error);
}

source = config.supportedSources.includes(rawSource) ? rawSource : config.defaultSource;
elements.source.textContent = source === "direct" ? "BLU" : source;
updateWhatsAppLink();
