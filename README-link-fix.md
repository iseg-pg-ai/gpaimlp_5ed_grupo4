# BLU proposal link → WhatsApp fix

Source reference: iseg-pg-ai/gpaimlp_5ed_grupo4 PR #87, commit a5c40e03caf883ef002fae0b7ba24ef226f22c26. Prepared locally on inge/frontend; no remote branch or AWS resource changed.

## Result
1. Lead composer: choose a saved proposal in the portal (lead ID carried through).
2. Export history: each saved version now exposes the existing share dialog.
3. Confirm the version and share permission; prepare WhatsApp.
4. Return to Mission Control with the exact lead selected and the real proposal URL in the message.
5. Review and send. Existing WhatsApp test/live mode is preserved.

Pasted share links also update manually edited messages. Generic catalogue links and foreign URLs are rejected. Long payloads fail with an explanation instead of silently truncating the link. Returning from the asynchronous share request uses same-tab navigation to avoid a blocked popup.

## Apply and deploy
Apply proposal-whatsapp-link.patch to a checkout containing the above source (or port the changes to the current inge/frontend branch before normal integration). Run `git apply --check proposal-whatsapp-link.patch` first; do not overwrite a newer app.js blindly.

The zip includes the changed files as well as the patch. Ensure the new frontend/intranet/proposal-links.mjs file is deployed with app.js.

Build the portal with NEXT_PUBLIC_INTRANET_URL=https://d38hyeyikiy9bw.cloudfront.net and its existing BLU_PUBLIC_URL=https://d3804amye1jw31.cloudfront.net configuration. Deploy both the portal and the intranet assets and invalidate stale CloudFront assets through the existing workflow. No new IAM permissions or share API routes are needed.

## Validation
Passed: 3 Node regression tests for accepted share URLs, edited-message insertion/replacement and preservation of full URLs at the message limit. app.js syntax and git diff whitespace checks passed.

Not run: complete portal TypeScript build or deployed end-to-end browser test (full repository/deployment runtime not present). No customer messages sent and no customer share created.

Post-deploy acceptance: open a lead → choose proposal → select and confirm the intended saved version → prepare WhatsApp → verify exact lead ID, complete URL and proposal content before sending in test mode. Verify a manually edited message keeps its text when a valid link is inserted; a >1000-character payload must fail without sending.

WhatsApp uses a visible clickable HTTPS URL. Arbitrary Markdown labelled links do not become embedded links in ordinary WhatsApp message text.
