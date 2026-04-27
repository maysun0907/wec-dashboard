"""Helpers for the free-form 'Rounds' string Wikipedia uses for entry lists.

Examples seen in the wild: '1', 'All', 'Various', 'TBC', '1-3', '1,2,5',
'1-3,5-8'. The schema stores the raw string; this module decides whether a
given round number falls inside it.
"""
import re

_RANGE_RE = re.compile(r"^(\d+)\s*[-–]\s*(\d+)$")


def driver_in_round(rounds: str | None, round_num: int) -> bool:
    """True if a driver scheduled for `rounds` participates in `round_num`.

    None / 'All' / 'Various' / empty → assumed full season (True).
    'TBC' / 'TBA' → unconfirmed, treated as not in this round (False).
    """
    if not rounds:
        return True
    s = rounds.strip().lower()
    if s in {"all", "various"}:
        return True
    if s in {"tbc", "tba"}:
        return False
    for part in rounds.split(","):
        part = part.strip()
        if not part:
            continue
        m = _RANGE_RE.match(part)
        if m:
            try:
                a, b = int(m.group(1)), int(m.group(2))
                if a <= round_num <= b:
                    return True
            except ValueError:
                continue
        else:
            try:
                if int(part) == round_num:
                    return True
            except ValueError:
                continue
    return False
