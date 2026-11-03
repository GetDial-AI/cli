---
name: dial-inbox
description: Dial briefing — who texted and called, and what still needs a reply
argument-hint: "[range, e.g. today | yesterday | this week]"
---

Give me a Dial inbox briefing for: **$ARGUMENTS** (default to today if empty).

Use the `dial` skill. Keep it read-only: send nothing, reply to nothing.

1. Resolve the range to explicit start and end times in my timezone, and say
   which range you used.
2. `get_account_status`, then `list_numbers` so you can name each line by its
   nickname.
3. `list_messages` with `since` set to the start of the range, and
   `list_calls` with the same `since`. Drop anything after the end of the
   range. If either returns 100 items, say the list is partial.
4. Group everything by contact (or group conversation).
5. For the few conversations that look most important, read a little more
   context with `list_messages` and `contact`.

Report as:

- **Headline**: one or two sentences on the period.
- **Needs a reply**: conversations where they spoke last, each with who, which
  line, when, and a one-line gist.
- **Calls**: inbound and outbound, with outcome (answered, missed, voicemail,
  failed) and duration.
- **Everything else**: a short list of the remaining conversations.

Don't invent numbers Dial didn't return. End by offering to draft replies.
Do not send anything.
