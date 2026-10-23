# BLU social conversation bridge

`index/index.html` is a lightweight social landing page that lets a visitor move from a
campaign link to the website concierge and then to WhatsApp without losing the
pseudonymous journey reference.

The browser generates a `BLU-` reference for the current tab. It never treats that
reference as authentication. With journey retention enabled, website messages and the
social campaign context are sent to the existing conversation-event endpoint. WhatsApp
opens with only the reference; the cloud webhook uses it to join the inbound message to
the same backoffice timeline.

Public defaults live in `data/channels.json`. AWS deployment writes `config.js` beside
the `data` and `index` directories with the actual chat and ingestion endpoints. No Meta
access token, app secret, verification token, customer phone number, or CRM credential
belongs in this directory.

Campaign example:

```text
https://FRONTEND_DOMAIN/?utm_source=instagram&utm_medium=social&utm_campaign=sintra-autumn
```

The page supports Instagram, Facebook, Pinterest, LinkedIn, WhatsApp, and direct source
labels. These labels are attribution hints, not verified identities.
