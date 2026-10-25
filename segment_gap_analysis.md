# Segments — Gap Analysis

Written 2026-10-19. "Today" is what the code did before this work (checked in the code, not assumed).
Priorities (P0 breaks trust, P1 expected, P2 nice) and effort sizes are my judgement.

## 1. What segments were

A segment is a saved list of rules over the contact list, matched with **all** (AND) or **any** (OR).
Used as the audience for email campaigns, SMS / WhatsApp campaigns and push.

- 5 fields only: email, first name, last name, phone, tag.
- 4 operators: contains, equals, is set, is not set. The UI offered the same list for every field.
- Create / edit / preview (count + 50 sample) / list with live count / "show contacts" (max 500).

## 2. Gaps

### A. Correctness (found in the code)
| # | Gap | Evidence | Pri |
|---|---|---|---|
| A1 | **SMS / WhatsApp and push ignore the segment's all/any setting.** An "any" segment is sent as "all", so the audience is smaller than the screen promised. | `sms_service` and `push_service` call `build_segment_query(org, rules)` without `match_type`; email passes it. | P0 |
| A2 | **No way to delete a segment.** Mistakes and old lists pile up forever. | No delete route or button. | P0 |
| A3 | Two segments can have the same name; nothing stops an empty rule list being saved as "everyone". | No checks. | P1 |
| A4 | Rules are only checked for shape, not for sense (e.g. 200 rules). | Schema only. | P2 |

### B. What you can filter on (the big gap)
The contact record now holds far more than the 5 filterable fields. Missing:
- **Where**: division, district, area, has a map pin.
- **Business**: shop / company, retail vs wholesale, source (Facebook, referral…), owner, CRM stage, deal value, expected close date.
- **Consent**: SMS agreed, WhatsApp agreed (the audience BTRC rules actually allow you to message).
- **Time**: added in the last N days, last contacted N days ago / never.
- **Engagement**: opened or clicked an email in the last N days, or has not.
- **Money (BD-specific)**: customers who still owe you (baki / dues).
- **Your own extra fields** (shop size, product interest…).
- **Better tag logic**: "does not have tag", "has any of", "has all of".
- **Sensible operators per field**: numbers (>, <, between), dates (in the last N days, before, after), yes/no, pick-from-list. Also "is not", "doesn't contain", "starts with".

### C. Understanding the audience before sending
- **Reach**: "420 contacts" says nothing about how many you can actually message. Need: with email / with phone / SMS-agreed / WhatsApp-agreed. (P0 for SMS: sending to people who did not agree is skipped silently.)
- Sample of matching people in the builder; empty-result hint (which rule removed everyone).
- Where it is used: how many campaigns use this segment (needed before deleting).

### D. Managing segments
- Duplicate a segment (start from an existing one) — P1.
- Description / note so a team knows what "Segment 7" is — P1.
- Starter templates for common cases ("New this week", "Wholesale customers", "Owes money", "Agreed to SMS", "Quiet for 30 days") — P1.
- Search and sort the list; last-updated date — P1.
- Export a segment's contacts to CSV — P1.

### E. Design and usability
- Builder was a card on the list page; rule rows had identical inputs for every field, no grouping, cramped on phones.
- No dedicated, shareable page for a segment's contacts.

### F. Not built (needs a product decision or more infrastructure)
- Nested groups ("(A and B) or C") — "all / any" plus the "is not / has none" operators cover most real cases.
- Static (frozen) lists and "add every contact in this segment to a tag" as a bulk action.
- Scheduled / automatic enter-exit triggers for workflows when someone joins a segment.
- Segment size history (trend over time).
- Cached counts: the list page counts each segment live on every load, which is fine for thousands of contacts but should move to a cached count for very large lists.

## 3. Implementation status

See section 4 after the build.

## 4. Built (2026-10-19)

- **A1** SMS / WhatsApp and push now honour the segment's all / any setting (email already did).
- **A2** Segments can be deleted — blocked, with a clear message, while campaigns still use the segment.
- **A3/A4** Names are unique per company; at most 20 rules; every rule is validated for its field (e.g. “contains” is refused on a number).
- **B** 25 filterable fields in 7 groups (Person, Place, Business, Consent, Activity + your own extra fields) with operators that fit each field type: text, pick-lists, tags (has / doesn't have / any of / all of), numbers (more / less / between), dates (in the last N days, before, after, between), yes/no, email opened / clicked, owes money. Old saved segments keep working unchanged.
- **C** Reach is shown for every segment and live in the builder: with email, agreed to SMS, agreed to WhatsApp, map-pinned; plus 8 sample people and a hint when nobody matches.
- **D** Duplicate, note/description, 8 ready-made templates, search, sort, last-updated, “used in N campaigns”, CSV export.
- **E** New pages: list (compact cards), builder (rules on the left, live preview on the right, phone-friendly), and a segment page with its people.

Not built: nested groups, static lists, “add tag to everyone in the segment”, enter/exit triggers for workflows, size history, cached counts (see section 2F).
