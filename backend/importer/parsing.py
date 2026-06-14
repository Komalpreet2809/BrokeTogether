"""Low-level, database-free parsers for individual CSV fields.

Every parser returns ``(value, findings)`` where ``findings`` is a list of
anomaly dicts. Keeping detection here (pure functions) means each rule can be
unit-tested and pointed at directly in the live session."""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation

from expenses.money import to_minor

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Keywords that, on a single-recipient row, signal a money transfer (a
# settlement) rather than a shared expense.
SETTLEMENT_KEYWORDS = ("paid", "back", "deposit", "settle", "repay", "owe")


def finding(code, severity, field, message, action_taken, raw_value="", resolved_value=""):
    return {
        "code": code,
        "severity": severity,
        "field": field,
        "message": message,
        "action_taken": action_taken,
        "raw_value": str(raw_value),
        "resolved_value": str(resolved_value),
    }


def normalize_name(raw: str) -> str:
    """Collapse whitespace and trim. 'rohan ' -> 'rohan', 'Priya  S' -> 'Priya S'."""
    return re.sub(r"\s+", " ", (raw or "").strip())


def parse_amount(raw: str):
    """Return (amount_minor_in_original_currency, findings). amount_minor may be
    negative (refund) or zero; callers decide what to do with those."""
    findings = []
    s = (raw or "").strip()
    if s == "":
        return None, [finding("MISSING_AMOUNT", "error", "amount",
                              "Amount is empty.", "Row cannot be imported without an amount.")]

    had_comma = "," in s
    cleaned = s.replace(",", "")
    if had_comma:
        findings.append(finding(
            "THOUSANDS_SEPARATOR", "info", "amount",
            f"Amount '{s}' contains a thousands separator.",
            "Stripped the comma before parsing.", raw_value=s, resolved_value=cleaned))

    try:
        d = Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None, findings + [finding("INVALID_AMOUNT", "error", "amount",
                                         f"Amount '{s}' is not a number.",
                                         "Row cannot be imported.", raw_value=s)]

    # More than 2 decimal places -> sub-paisa precision we must round.
    exponent = d.as_tuple().exponent
    decimals = -exponent if isinstance(exponent, int) else 0
    if decimals > 2:
        minor = to_minor(d)
        findings.append(finding(
            "SUBUNIT_PRECISION", "warning", "amount",
            f"Amount '{s}' has {decimals} decimal places (sub-paisa precision).",
            "Rounded HALF_UP to 2 decimal places.",
            raw_value=s, resolved_value=f"{minor / 100:.2f}"))
    else:
        minor = to_minor(d)

    if minor == 0:
        findings.append(finding(
            "ZERO_AMOUNT", "warning", "amount",
            "Amount is zero.",
            "Skipped: a zero-value expense does not affect any balance.",
            raw_value=s))
    elif minor < 0:
        findings.append(finding(
            "NEGATIVE_AMOUNT", "warning", "amount",
            f"Amount is negative ({s}).",
            "Treated as a refund: kept negative so it reduces what members owe.",
            raw_value=s))

    return minor, findings


def parse_currency(raw: str, base: str, known: set[str]):
    """Return (currency_code, findings)."""
    findings = []
    c = (raw or "").strip().upper()
    if c == "":
        return base, [finding("MISSING_CURRENCY", "warning", "currency",
                              "Currency is blank.",
                              f"Defaulted to the group's base currency ({base}).",
                              resolved_value=base)]
    if c not in known:
        findings.append(finding("UNKNOWN_CURRENCY", "error", "currency",
                                f"Currency '{c}' has no configured exchange rate.",
                                "Row flagged; cannot convert to base currency.",
                                raw_value=c))
    return c, findings


def parse_date(raw: str, default_year: int):
    """Return (date, findings, ambiguous_bool).

    Canonical format for this file is DD-MM-YYYY (documented decision). We also
    accept 'MMM-DD' (e.g. 'Mar-14') by inferring the year. ``ambiguous`` flags
    rows where both components are <= 12 so DD-MM vs MM-DD cannot be told apart
    by the value alone; the caller decides whether that matters (see the
    chronology spike check in services)."""
    s = (raw or "").strip()
    findings = []

    m = re.match(r"^(\d{1,2})-(\d{1,2})-(\d{4})$", s)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        ambiguous = day <= 12 and month <= 12 and day != month
        try:
            dt = date(year, month, day)
            return dt, findings, ambiguous
        except ValueError:
            return None, [finding("INVALID_DATE", "error", "date",
                                  f"Date '{s}' is not a valid DD-MM-YYYY date.",
                                  "Row flagged.", raw_value=s)], False

    m = re.match(r"^([A-Za-z]{3})-(\d{1,2})$", s)
    if m:
        mon = MONTHS.get(m.group(1).lower())
        day = int(m.group(2))
        if mon:
            try:
                dt = date(default_year, mon, day)
                findings.append(finding(
                    "DATE_FORMAT", "warning", "date",
                    f"Date '{s}' uses a non-standard 'MMM-DD' format with no year.",
                    f"Parsed as {dt.isoformat()} (year {default_year} inferred from the file).",
                    raw_value=s, resolved_value=dt.isoformat()))
                return dt, findings, False
            except ValueError:
                pass

    return None, [finding("INVALID_DATE", "error", "date",
                          f"Date '{s}' is in an unrecognized format.",
                          "Row flagged; cannot be imported without a valid date.",
                          raw_value=s)], False


def parse_split_details(raw: str) -> dict[str, Decimal]:
    """Parse 'Rohan 700; Priya 400; Meera 400' or 'Aisha 30%; Rohan 30%' into
    {raw_name: Decimal}. Strips a trailing '%'. Returns {} if blank."""
    out: dict[str, Decimal] = {}
    s = (raw or "").strip()
    if not s:
        return out
    for part in s.split(";"):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^(.*?)[\s:]+(-?\d+(?:\.\d+)?)\s*%?$", part)
        if m:
            name = normalize_name(m.group(1))
            try:
                out[name] = Decimal(m.group(2))
            except InvalidOperation:
                continue
    return out


def split_participants(raw: str) -> list[str]:
    """Parse the split_with column ('Aisha;Rohan;Priya') into normalized names."""
    s = (raw or "").strip()
    if not s:
        return []
    return [normalize_name(p) for p in s.split(";") if normalize_name(p)]


def looks_like_settlement(split_type: str, participants: list[str], paid_by: str,
                          description: str, notes: str) -> bool:
    """A row is a settlement (transfer), not an expense, when one person pays
    exactly one *other* person and either the split type is blank or the text
    mentions a transfer ('paid X back', 'deposit')."""
    if len(participants) != 1:
        return False
    recipient = participants[0]
    if normalize_name(recipient).lower() == normalize_name(paid_by).lower():
        return False
    text = f"{description} {notes}".lower()
    if not split_type.strip():
        return True
    return any(k in text for k in SETTLEMENT_KEYWORDS)
