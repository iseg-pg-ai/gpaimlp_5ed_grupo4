// When to ask for a way to follow up. Without an email, phone or WhatsApp number a visitor who
// leaves is a lost lead, so the concierge asks early, once, and keeps planning either way.
// The decision is made here from the conversation, not left to the model.
export const CONTACT_SHARED = /[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d\s().-]{7,}\d/;
export const CONTACT_REQUESTED = /\b(e-?mail|phone|whats ?app|contact details?|best way to reach|reach you)\b/i;
const ASK_FROM_TURN = 2;

/** "given", "asked", "due" (ask in this reply) or "later", from the history plus the new message. */
export function contactState(previous, message) {
  const turns = Array.isArray(previous) ? previous.filter(item => item && typeof item.text === 'string') : [];
  const said = [...turns.filter(item => item.role === 'user').map(item => item.text), message];
  if (said.some(text => CONTACT_SHARED.test(text))) return 'given';
  if (turns.some(item => item.role === 'assistant' && CONTACT_REQUESTED.test(item.text))) return 'asked';
  return said.length >= ASK_FROM_TURN ? 'due' : 'later';
}

export const CONTACT_GUIDANCE = {
  given: 'The visitor has already shared a way to reach them. If they just did, thank them in a few words; never ask for contact details again, and carry on planning with your next question.',
  asked: 'You already asked for an email or phone number: do not ask again, and keep planning.',
  due: 'In this reply, after answering, ask once and lightly for an email address or a phone or WhatsApp number so a curator can follow up even if this chat ends; say it is optional, and still ask your next planning question in the same reply.',
  later: 'Do not ask for contact details yet.',
};
