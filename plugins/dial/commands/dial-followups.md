---
name: dial-followups
description: Conversations on Dial that are waiting on you, with suggested replies
argument-hint: "[how far back, e.g. 3 days | this week | a line's nickname]"
---

Find the Dial conversations waiting on me for: **$ARGUMENTS** (default to the
last 7 days if empty).

Use the `dial` skill. Keep it read-only: draft, but send nothing.

1. Resolve the range to an explicit start time and say which range you used.
   If I named a line, find it with `list_numbers` and pass its id as
   `numberId` below.
2. `list_contacts`, newest first. Stop paging once `lastAt` is older than the
   start of the range.
3. Keep the contacts whose `lastDirection` is `inbound`: they spoke last. Also
   keep inbound calls that went unanswered (check with `list_calls` and
   `contact` when the last interaction was a call).
4. For each one, read the recent conversation with `list_messages` and
   `contact`.

Report, oldest wait first:

- **Who**: the number (and any name they gave in the conversation), and which
  line.
- **Waiting since**: when they last reached out.
- **What they need**: one line.
- **Suggested reply**: a short draft in the tone of the conversation.

Skip conversations that don't need an answer (a "thanks", an automated
message, a delivery notice) and say how many you skipped. End by asking which
replies to send. Do not send anything until I confirm each one.
