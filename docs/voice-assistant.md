# Voice assistant: research and status

Goal: talk to Glactivity from a bedside speaker instead of the phone. Nothing built yet. Any build needs an agreed plan first.

## Decision (Nov 2026)

Wait for Alexa+ add-ons to open up. Don't buy a HomePod or an Echo for this yet.

## Amazon access request

- Support case **71461161**: "Access Request: Alexa+ for Builders Private Preview (MCP Toolkit)". Filed Nov 2026 for a private, development-stage add-on for the owner's own account.
- No reply or access is guaranteed. The [Alexa+ for Builders](https://developer.amazon.com/alexaplus) page says it is "currently available to select partners", and new accounts see "Coming Soon". There is no public date.
- Check that page every month or so.

## Options

| Option | What it gives | Status |
|---|---|---|
| **Alexa+ add-on (MCP Toolkit)**, preferred | Free conversation with no fixed phrases ("what's my day like?", "add eggs"). Alexa+ calls Glactivity's MCP tools. Free with Prime in the UK. A development-stage add-on stays private to the owner's account. | Private Preview, partners only. Waiting on the case above. |
| Classic Alexa custom skill | "Alexa, ask Glactivity…" with fixed phrases and an 8-second limit. No approval needed in development mode. | Works for anyone, but it's uncertain whether it runs on Alexa+ Echos. |
| HomePod mini + Siri Shortcuts | Fixed commands that call a Glactivity web endpoint. Siri can't use MCP. | Works today, but the device is expensive and the experience is limited. Not chosen. |

## What an Alexa+ add-on needs (when access comes)

1. **Proper sign-in:** OAuth 2.1 with PKCE, plus a client-credentials login. Alexa+ doesn't support automatic client sign-up (DCR or CIMD), so the current secret link won't work.
2. **Fast voice tools:** each round trip must take under 500 ms. The current tools are built for thorough planning runs, so voice needs lighter versions.
3. **Listing details,** needed even to test: a privacy policy page, a terms page, icons and a carousel image.
4. **Then a private development-stage add-on,** linked to the owner's Echo. Only buy an Echo that Amazon lists as Alexa+ compatible.

Claude keeps doing the scheduled planning runs. Alexa+ would be the voice front end on the same Glactivity data.

Sources: Amazon's Alexa+ docs: [development stages](https://developer.amazon.com/docs/alexaplus/add-ons/alexa-plus-add-on-development-stages.html), [MCP Toolkit overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html), [authentication](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html), [quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html).
