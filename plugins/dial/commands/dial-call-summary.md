---
name: dial-call-summary
description: Summarize a Dial call — outcome, key points, and next steps
argument-hint: "[a phone number, a name from the call, or empty for the latest call]"
---

Summarize a Dial call for: **$ARGUMENTS** (default to the most recent call if
empty).

Use the `dial-calls` skill. Keep it read-only.

1. Find the call. If I gave a phone number, use `list_calls` with `contact`
   and take the newest. If I gave something else, use `list_calls` and pick
   the call that matches. If more than one could match, list them briefly and
   ask which one.
2. `get_call` for its status, duration and transcript.

Report as:

- **Call**: who, which line, direction, when, and how long.
- **Outcome**: one sentence (booked, resolved, no answer, voicemail, needs a
  follow-up, failed and why).
- **Key points**: what was said that matters, with short quotes where the
  exact wording matters.
- **Next steps**: anything promised or left open, by either side.

If there's no transcript (no answer, voicemail, or still in progress), say so
and give what the call record shows. End by offering to draft a follow-up
text. Do not send anything.
