---
name: dial
description: >-
  Use Dial to give the agent a real phone number. Use whenever the user asks to
  text, message, SMS, iMessage or WhatsApp someone, read or search their texts,
  check who called or texted, reply to or react to a message, look up whether a
  number can get iMessage or WhatsApp, wait for a reply or a verification code,
  or manage their Dial numbers. Triggers on "Dial", "text", "SMS", "iMessage",
  "WhatsApp", "my messages", "who texted me", "reply to", "send a text",
  "verification code", "OTP", "my phone number".
metadata:
  author: Dial
  short-description: Send and read texts, check calls, manage your Dial numbers.
---

# Dial

Dial gives the agent real phone numbers that can text (SMS, iMessage, WhatsApp)
and place and answer AI voice calls. This plugin connects to the hosted Dial MCP
server at `https://getdial.ai/mcp`. The first time a tool runs, the user signs
in to Dial in the browser. There is no API key to copy.

Read each tool's schema before calling it. Never invent tool names, parameters
or ids.

## Talk in plain language

The user says "did anyone text me?", not "call list_messages". Answer in the
same terms. Never tell the user to run a tool by name, and never show raw ids
unless they ask for them.

## Start here

Call `get_account_status` once, before the first real Dial action in a session.

- If `ready` is false, the account has no number yet. Tell the user what
  `nextStep` says and stop. Don't buy a number on your own (see *Numbers* below).
- If it's ready, call `list_numbers` so you know which lines exist, what each
  can do (`capabilities`), and their nicknames. Use those nicknames when you
  talk to the user ("your Support line").

For calls (placing one, reading a transcript, call settings on a number), also
load the `dial-calls` skill.

## Reading messages

- `list_messages` returns up to 100 messages, newest first.
  - `contact` (E.164) reads one person's whole conversation, both directions,
    across every line.
  - `groupId` reads one group conversation. Get group ids from `list_groups`.
  - `search` finds messages by their text across all history.
  - `since` (ISO-8601) limits it to recent messages. Resolve "today" or
    "this week" to an explicit timestamp in the user's timezone first.
- `list_contacts` lists everyone the lines have talked to, newest activity
  first, with message and call counts and a preview of the latest interaction.
  `lastDirection: "inbound"` means they spoke last.
- A message with an empty `body` may still carry media, or may have been
  cleared by data retention. Say so rather than calling it blank.
- If a list comes back with exactly 100 items, there is more. Say "100+" and
  narrow with `since` or `contact` rather than presenting it as complete.

## Sending

**Never send a message, reply or reaction to anyone without the user's
explicit go-ahead for that exact text and recipient.** Draft it, show it, wait
for a yes. A standing instruction from the user ("text Sam when the build
passes") counts as the go-ahead for that one send.

- New message: `send_message` with `to` (E.164) or `groupId`, and `body`.
  Pass `fromNumber` (an E.164 number, number id or nickname) whenever the
  account has more than one number, so the message goes out from the line the
  user expects.
- Reply in a thread or react: `reply_to_message` with the `messageId` and
  either `body` or `reaction`. It goes out from the line the original message
  arrived on, so it needs no from or to.
- Picking a channel: if the user doesn't name one, let the number's default
  decide. If it matters (say, iMessage versus SMS), call `lookup_number` on the
  recipient first. A `true` is a strong signal, not a promise.
- Phone numbers must be E.164 (`+14155550123`). If the user gives a local
  number and the country is unclear, ask.
- `start_typing` before a long reply makes the conversation feel natural on
  iMessage and WhatsApp. It is free and safe to call on any line.

## Waiting for a reply or a code

`wait_for_event` blocks until a matching event arrives, for up to 60 seconds
per call.

- A reply from someone: `eventType: "message.received"` with
  `field: ["from=+14155550123"]`.
- A verification code: `eventType: "message.received"` with a `regex` filter on
  the body, e.g. `["body=\\b\\d{4,8}\\b"]`, then read the code out of the body.
- A call finishing: `eventType: "call.ended"` with `field: ["callId=<call id>"]`.

If it times out, call it again rather than switching to repeated
`list_messages` calls. Tell the user you're still waiting if it runs past a
couple of tries.

## Numbers

- Don't buy a number unless the user clearly asks for one. `purchase_number`
  costs money and needs `explicitProgrammaticConsent`: a short note saying
  where and how the user agreed. Confirm the channels they need first
  (SMS and calls by default, or iMessage, or WhatsApp).
- `set_number_properties` changes a number's nickname, display name and photo,
  call settings, and call forwarding. Confirm before changing anything a
  customer would see, such as the display name or photo.

## Errors

Read the error, explain it in a sentence, and suggest the fix. Don't retry a
send blindly: a send that failed may already have partly gone out. If the error
mentions billing, limits or setup, point the user to their Dial dashboard at
https://getdial.ai.
