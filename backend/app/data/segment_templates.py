"""Starter segment templates, copied into each company the first time it opens Quick start. After that they are the company's own."""
R = lambda field, operator, value=None, **kw: {"field": field, "operator": operator, "value": value, "value2": kw.get("value2"), "values": kw.get("values")}  # noqa: E731

DEFAULT_TEMPLATES: list[dict] = [
    {"name": "New this week", "description": "Contacts added in the last 7 days", "match_type": "all", "rules": [R("created_at", "in_last_days", "7")]},
    {"name": "Wholesale customers", "description": "Everyone marked as wholesale", "match_type": "all", "rules": [R("customer_type", "equals", "wholesale")]},
    {"name": "Owes me money", "description": "Customers with unpaid dues", "match_type": "all", "rules": [R("owes_money", "is_true")]},
    {"name": "Agreed to SMS", "description": "Has a number and agreed to SMS — safe to message", "match_type": "all", "rules": [R("sms_opt_in", "is_true"), R("phone", "is_set")]},
    {"name": "Quiet for 30 days", "description": "Not contacted for a month (or never) — time to follow up", "match_type": "all", "rules": [R("last_contacted_at", "not_in_last_days", "30")]},
    {"name": "Opened emails recently", "description": "Opened any email in the last 30 days", "match_type": "all", "rules": [R("email_opened", "in_last_days", "30")]},
    {"name": "Never opened an email", "description": "Have an email but never opened one", "match_type": "all", "rules": [R("email", "is_set"), R("email_opened", "never")]},
    {"name": "Big deals", "description": "Deal value above ৳50,000", "match_type": "all", "rules": [R("deal_value", "gt", "50000")]},
]
