# NLPearl Orchestrator — Support & Operations Guide

This guide is for support/operations agents using the dashboard. It
explains what the system does, what everything on screen means, and
what to do (or not do) in common situations. No technical background
needed.

---

## 1. What this system actually does

Some process (usually N8N) decides a client needs to be contacted —
for example, "this client needs to complete an identity check to
remove a payment limit." It hands us the client's basic info: name,
phone, an internal case ID ("mpl"), and which **flow** this is (the
type of outreach — e.g. "KYC over 100k" or "wedding gifts above 50").

From there, we run the whole outreach automatically:

1. Send the client a text message letting them know they'll get a call.
2. Wait a bit (a few minutes, or until a scheduled time of day).
3. Have our AI calling system (NLPearl) call the client.
4. If the client agrees on the call to receive a link by SMS, send it.
5. When the call ends, record what happened (how long it lasted, the
   outcome, a summary, a recording if available).
6. If the call didn't go well, automatically try again later (for
   flows configured to do so).
7. Separately, once N8N confirms (through its own process) that the
   client actually completed what was asked, we mark that record done
   and stop contacting them.

Every one of these steps is visible on the **Records** page, and every
status change is logged on that record's timeline.

---

## 2. The Records page

This is the main list — every client contacted, across every flow.

| Column | What it means |
|---|---|
| Created | When this record first came in |
| Flow | Which outreach type this is |
| Name | Click through to the full record |
| Phone | The client's phone number |
| MPL | The internal case ID this record is tied to |
| Status | Where this record currently is — see the glossary below |
| CTA | ✓ if N8N has confirmed the client completed the required action, otherwise — |

You can filter by flow, by status, or search by name/phone/mpl using
the boxes above the table.

### Status glossary

| Status | What's actually happening |
|---|---|
| **Received** | The record came in. For flows sent immediately, this is instant. For flows sent on a schedule (e.g. "every day at 2pm"), it sits here until that time arrives. |
| **PreSmsSent** | The heads-up text message went out successfully. |
| **Scheduled** | The text was sent and the call is queued to go out after the configured wait time. |
| **CallTriggered** | The AI call has been placed and is in progress or just finished. |
| **ConsentGiven** | The client agreed during the call to receive the link by SMS, and it was sent. |
| **Completed** | The whole flow finished — either the call ended and no retry was needed, or N8N confirmed the client completed the action separately. |
| **Failed** | Something went wrong — see the "Failed records" section below. |

### The CTA column

CTA = "the thing we actually wanted the client to do" (e.g. finish an
identity check, claim a gift). The ✓ here has **nothing to do with
whether the call went well** — it only appears once N8N tells us,
separately, that it verified the client actually completed that
action. A record can be "Completed" (call-wise) without ever getting a
CTA ✓, and it can get the CTA ✓ at any time — even before a call ever
happens, if the client acted on the very first text message.

**Once a record has the CTA ✓, we stop contacting that client
automatically** — no more reminder texts, no more calls, even if a
retry would otherwise have happened. The only way to reach them again
after that is someone manually clicking **Resend** on that record.

---

## 3. A record's detail page

Click any name in the list to see the full picture for that client:

- **Status badges** at the top — current status and CTA status.
- **Details card** — flow, phone, mpl, how many attempts have been
  made so far, when the CTA was confirmed (if it was), and — if
  something failed — the exact error message.
- **Call history** — every AI call actually placed for this record
  (there can be more than one, across retries), with duration,
  outcome, a summary, and a link to the recording if one exists.
- **Timeline** — a full chronological log of everything that happened
  to this record, in plain terms, with a timestamp for each step.

### The two action buttons

- **Resend** — immediately re-sends the heads-up text and re-queues
  the call, right now, regardless of the flow's retry limits or
  whether the CTA is already marked complete. Use this when you
  specifically want to force another attempt (e.g. a client asked to
  be contacted again, or a technical issue was just fixed). It will
  ask you to confirm first.
- **Delete** — permanently removes the record, including its full
  history and call recordings list. **This cannot be undone.** Use it
  for genuine mistakes or test records, not as a way to "close" a
  record you're just done looking at — deleting doesn't need to happen
  for a normal completed record; it can just stay in the list.

---

## 4. One important rule: what counts as "the same client"?

A record is treated as the *same* record only when **phone number +
flow + mpl** all match exactly:

- Same phone, same flow, same mpl → treated as the same record. If
  it's submitted again, we either recognize it as an exact repeat (no
  new message/call goes out) or treat it as "another attempt" on that
  same record (which does re-send things — see below).
- Same phone, same flow, but a **different mpl** → this is treated as
  a **separate, brand-new record**. This is intentional — it covers
  cases like a client having two different cases open in the same
  flow at once.
- Same phone, but a **different flow** → also always a separate
  record.

**What this means for you:** if you submit something and don't see a
new row appear, check whether an existing record already has the
exact same phone + flow + mpl — if so, the system treated it as a
repeat of that existing record rather than a new one, and the response
message will say so explicitly (e.g. "already exists" or "updated that
existing record instead of creating a new one").

---

## 5. Failed records — and when they retry automatically

A record can fail in two different ways:

1. **The text message itself failed to send** (e.g. the messaging
   service was down). This does **not** currently retry automatically
   — it needs a manual Resend once the underlying issue is resolved.
2. **The AI call failed to go out or didn't go well** — for example,
   the call system's line was inactive, the client didn't answer, or
   the call ended in a way the flow considers unsuccessful. **This
   type can retry automatically**, but only if the flow it belongs to
   has retries turned on (see "Max retry attempts" in the Flow Config
   section below). If retries are on and attempts remain, the record
   moves back to "Scheduled" and tries again after a short delay — you
   can watch this happen step-by-step in that record's timeline
   (look for an "Auto-retry scheduled" entry). Once the flow's retry
   limit is reached, it settles at "Failed" for good, and Resend is
   the only way to try again.

If you see a record stuck at "Failed" and you're not sure whether it
will retry on its own, open the record and check the timeline — if
there's no "Auto-retry scheduled" entry and the flow's retry setting
is 0 (off), it won't retry by itself.

---

## 6. Flow Config page

This page controls the *rules* for each flow — think of it as the
settings that decide how a whole category of outreach behaves. You
generally won't need to touch this unless asked to, but here's what
each setting means:

| Setting | What it controls |
|---|---|
| Preliminary SMS template | The heads-up text sent right away (or at the scheduled time) |
| Consent SMS template | The text sent if the client agrees on the call to get a link |
| Delay before call | How long to wait after the text before calling |
| Send schedule | If set, records for this flow only go out at specific times/days (e.g. "10am & 3pm, Sun–Thu") instead of immediately |
| Max retry attempts | How many extra tries a failed call gets automatically. **0 = no automatic retries at all** for this flow |
| Retry delay | How long to wait before an automatic retry (defaults to the same delay as the first call if left blank) |
| Enabled | The master on/off switch for this flow |

**The "Enabled" toggle is the fastest way to pause an entire flow** —
turning it off stops new records for that flow from being processed
and pauses its scheduled sending, without touching any records already
in progress or deleting anything.

---

## 7. Quick reference: common questions

**"I submitted a record and it says 'duplicate' — is that a
problem?"**
No — it means a record with the exact same phone + flow + mpl already
existed and nothing new was sent out, to avoid double-contacting the
same client for the same case. Check the message returned — it
explains exactly which existing record it matched.

**"The client says they never got a text/call."**
Open the record and check the timeline for errors, and the Details
card for an error message. If the text failed to send, that needs a
manual Resend. If it looks like it went out fine on our end, the issue
may be on the client's phone/carrier side — outside what this system
controls.

**"Can I make a record get contacted again right now?"**
Yes — open the record and click **Resend**. It ignores retry limits
and the CTA-completed guard, so use it deliberately.

**"The CTA checkmark hasn't appeared even though the client says they
finished."**
That confirmation comes from N8N's own separate verification process,
not from anything on the call itself — so there may be a delay on
N8N's side, or its check hasn't run yet. This isn't something to fix
from this dashboard.

**"Should I delete old completed records to keep things tidy?"**
No need — completed records don't need cleanup. Reserve Delete for
actual mistakes or test data, since it permanently removes the
record's full history.

---

If something on this list doesn't match what you're actually seeing,
or you run into a situation not covered here, flag it to the technical
team rather than guessing — this guide reflects how the system is
*supposed* to behave.
