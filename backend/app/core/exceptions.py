class PlanLimitError(Exception):
    """Raised when an org tries to create a resource beyond its plan's limit
    for that resource. Caught by a global handler in main.py and turned into
    a 402 so the frontend can show an upgrade prompt."""

    def __init__(self, resource: str, current: int, limit: int):
        self.resource = resource
        self.current = current
        self.limit = limit
        super().__init__(f"{resource} limit reached ({current}/{limit})")
