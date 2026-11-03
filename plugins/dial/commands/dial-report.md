---
name: dial-report
description: Dial activity report — messages and calls, compared with the period before
argument-hint: "[period, e.g. this week | last week | this month]"
---

Build a Dial activity report for: **$ARGUMENTS** (default to the last 7 days
if empty).

Use the `dial` skill. Keep it read-only.

1. Resolve the period to explicit start and end times, and the previous period
   of the same length right before it. Say which dates you used.
2. `list_numbers` so you can break the numbers down by line.
3. `list_messages` and `list_calls` with `since` set to the start of the
   previous period. Split the results into the two periods yourself.
4. Both lists return at most 100 items. If either hits 100, run it once per
   line (`numberId`) to get more. If a line still hits 100, report its numbers
   as "100+" and say the comparison for that line is incomplete.

Report as:

- **Headline**: one or two sentences.
- **Messages**: sent and received, by channel and by line, with the change
  from the previous period.
- **Calls**: inbound and outbound, answered versus missed or failed, and total
  and average duration, with the change from the previous period.
- **Busiest conversations**: the top few contacts by activity.
- **Worth a look**: anything unusual, like a spike in failed sends or missed
  calls.

Flag small samples. Don't invent metrics Dial didn't return.
