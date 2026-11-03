---
name: dial-calls
description: >-
  Place AI voice calls with Dial and read what happened on them. Use when the
  user asks to call someone, have an AI make a phone call, book or confirm
  something by phone, check how a call went, read or summarize a call
  transcript, cancel a call, or change how their number answers calls or
  forwards them. Triggers on "call", "phone them", "ring", "transcript",
  "what did they say on the call", "forward my calls".
metadata:
  author: Dial
  short-description: Place AI calls, read transcripts, set up how a number answers.
---

# Dial calls

Dial calls are made by an AI voice agent that follows a prompt you write. The
call runs on its own while you wait. Load the `dial` skill first if it isn't
loaded yet: it covers account checks and choosing a number.

## Before placing a call

**Never place a call without the user's explicit go-ahead** for who is being
called and what the agent will say. Show the plan in a few lines first:
who, from which number, the goal, and anything the agent must or must not say.

Then call `place_call` with:

- `to` in E.164, and `fromNumber` when the account has more than one number.
  Make sure that number can call: `capabilities` includes `"call"`,
  `setupStatus` is `"ready"`, and `callingEnabled` is true.
- `outboundInstruction`: the prompt the voice agent follows (see below).
- `transferTo` when a human should take over: the agent waits through hold
  music and phone menus, then hands the call to that number.
- `idempotencyKey` (a fresh UUID). If you have to retry after an error, reuse
  the same key so the person isn't called twice.
- `maxCallDurationSeconds` only when the user wants a cap. On a free account,
  anything above 300 seconds is rejected.

## Writing the instruction

The agent will follow the instruction literally, in a live conversation.

- Say who it is calling on behalf of and the single goal of the call.
- Write it as a conversation, not a script to read out. Give it the opening
  line, then what to do depending on what the other person says.
- Give it the facts it needs (names, dates, the booking reference) and what to
  do when it doesn't know something: say it will follow up, never make
  anything up.
- Tell it to keep turns short, let the other person talk, and not to end the
  call until the goal is reached or the other person wants to hang up.
- Tell it to be honest that it's an AI assistant if asked.

## While the call runs and after

1. `wait_for_event` with `eventType: "call.ended"` and `field: ["callId=<call id>"]`.
   Repeat it if it times out. Calls can last several minutes.
2. `get_call` for the result: `status`, `duration`, and the `transcript`.
   `transcriptTurns` has timings if the user asks about pauses or pacing.
3. Report the outcome first (booked, no answer, voicemail, needs a follow-up),
   then the key details, then anything that needs the user's attention.

`stop_call` cancels a call that hasn't connected yet, or hangs up one in
progress. Only do this when the user asks.

## Reading past calls

`list_calls` returns up to 100 calls, newest first. Narrow it with `contact`
for one person, `direction`, or `since`. Use `get_call` on a specific call for
its transcript. Quote the transcript where it matters, but don't paste it all
unless asked.

## How a number answers calls

`set_number_properties` controls inbound calls on a number:

- `inboundInstruction`: the prompt the agent uses when it answers.
- `forwardTo`: send inbound calls to a person's phone instead of the agent.
  `null` turns forwarding off.
- `callingEnabled: false`: stop answering calls entirely. Texting still works.
- `inboundVoiceGender` and `inboundLanguage`.

Show the user the new setting and get a yes before changing it. It affects
every caller from the next call on.
