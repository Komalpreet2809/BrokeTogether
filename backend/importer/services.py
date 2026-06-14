"""Import engine: turn a raw CSV into staged rows + an anomaly report, then
(on approval) materialize approved rows into real Expense/Settlement records.

Design contract:
  * STAGE phase writes ONLY ImportBatch / StagedRow / Anomaly. It never creates
    or mutates expenses, settlements or members. This is what lets a human
    review and approve before anything real changes (Meera's request).
  * COMMIT phase reads the (approved) staged rows and creates the real records.
    It re-computes nothing from the raw CSV: the interpretation captured at
    stage time is the single source of truth, so what you approve is exactly
    what you get.
"""

from __future__ import annotations

import csv
import io
from collections import Counter
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from expenses.models import Expense, ExpenseSplit, Settlement, SplitType
from expenses.money import convert_to_base
from expenses.splitting import compute_shares
from groups.models import Member, MemberAlias

from . import parsing
from .models import Anomaly, ImportBatch, StagedRow

REQUIRED_COLUMNS = {
    "date", "description", "paid_by", "amount", "currency",
    "split_type", "split_with", "split_details", "notes",
}


# --------------------------------------------------------------------------- #
# Name / identity resolution
# --------------------------------------------------------------------------- #
class MemberResolver:
    """Resolves raw CSV names to canonical member names for one group.

    Resolution order (most to least confident):
      1. exact match on a canonical member name (case-insensitive)
      2. exact match on a recorded alias
      3. first-token match on a unique member ("Priya S" -> "Priya")
      4. otherwise: a brand-new participant (returned as-is, flagged NEW_MEMBER)

    Names discovered earlier in the same file are remembered, so "Kabir" is only
    flagged once even if he appears in several rows."""

    def __init__(self, group):
        self.group = group
        self.canonical: dict[str, str] = {}     # lower -> canonical display name
        self.alias: dict[str, str] = {}         # lower alias -> canonical name
        for m in group.members.all():
            self.canonical[m.name.lower()] = m.name
            for a in m.aliases.all():
                self.alias[a.raw_name.lower()] = m.name
        self.new_members: set[str] = set()      # canonical names not in DB yet

    def resolve(self, raw: str, field: str):
        """Return (canonical_name, findings)."""
        findings = []
        n = parsing.normalize_name(raw)
        if not n:
            return "", findings
        low = n.lower()

        # 1. exact canonical
        if low in self.canonical:
            canonical = self.canonical[low]
            if n != canonical:
                findings.append(parsing.finding(
                    "NAME_NORMALIZED", "info", field,
                    f"Name '{raw}' differs from canonical '{canonical}' (case/whitespace).",
                    f"Matched to existing member '{canonical}'.",
                    raw_value=raw, resolved_value=canonical))
            return canonical, findings

        # 2. known alias
        if low in self.alias:
            return self.alias[low], findings

        # 3. first-token match ("Priya S" -> "Priya")
        first = low.split(" ")[0]
        if first in self.canonical:
            canonical = self.canonical[first]
            findings.append(parsing.finding(
                "NAME_VARIANT", "warning", field,
                f"Name '{raw}' looks like a variant of existing member '{canonical}'.",
                f"Resolved to '{canonical}' and recorded '{n}' as an alias.",
                raw_value=raw, resolved_value=canonical))
            self.alias[low] = canonical
            return canonical, findings

        # 4. new participant
        self.canonical[low] = n
        self.new_members.add(n)
        findings.append(parsing.finding(
            "NEW_MEMBER", "warning", field,
            f"'{n}' is not a known member of this group.",
            f"Will be created as a guest participant named '{n}'.",
            raw_value=raw, resolved_value=n))
        return n, findings


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _description_tokens(desc: str) -> set[str]:
    return {t for t in "".join(c.lower() if c.isalnum() else " " for c in desc).split() if t}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _infer_default_year(rows: list[dict]) -> int:
    years = []
    for r in rows:
        for tok in str(r.get("date", "")).split("-"):
            if tok.isdigit() and len(tok) == 4:
                years.append(int(tok))
    return Counter(years).most_common(1)[0][0] if years else timezone.now().year


# --------------------------------------------------------------------------- #
# Stage phase
# --------------------------------------------------------------------------- #
def _interpret_row(row_number, raw, resolver, group):
    """Parse and classify a single CSV row. Returns an `interp` dict capturing
    the normalized interpretation plus all findings. No DB writes here."""
    findings = []
    base = group.base_currency
    known_currencies = set(settings.FX_RATES_TO_BASE.keys())

    description = (raw.get("description") or "").strip()
    notes = (raw.get("notes") or "").strip()
    split_type_raw = (raw.get("split_type") or "").strip().lower()

    # --- payer -----------------------------------------------------------
    paid_by_raw = raw.get("paid_by") or ""
    if not parsing.normalize_name(paid_by_raw):
        findings.append(parsing.finding(
            "MISSING_PAYER", "error", "paid_by",
            "No payer recorded for this expense.",
            "Skipped: an expense cannot be attributed without knowing who paid.",
            raw_value=paid_by_raw))
        return {"row_number": row_number, "raw": raw, "record_type": "skip",
                "action": StagedRow.Action.SKIP, "findings": findings, "parsed": {},
                "date": None, "desc_tokens": set()}
    payer_name, f = resolver.resolve(paid_by_raw, "paid_by")
    findings += f

    # --- date ------------------------------------------------------------
    dt, f, ambiguous = parsing.parse_date(raw.get("date"), group._default_year)
    findings += f

    # --- amount + currency ----------------------------------------------
    amount_minor, f = parsing.parse_amount(raw.get("amount"))
    findings += f
    currency, f = parsing.parse_currency(raw.get("currency"), base, known_currencies)
    findings += f

    fatal = any(x["severity"] == "error" for x in findings) or amount_minor is None or dt is None
    is_zero = amount_minor == 0 if amount_minor is not None else False

    # currency conversion (only meaningful if we have an amount + known rate)
    amount_base_minor = None
    fx_rate = Decimal("1")
    if amount_minor is not None and currency in settings.FX_RATES_TO_BASE:
        fx_rate = Decimal(str(settings.FX_RATES_TO_BASE[currency]))
        amount_base_minor = convert_to_base(amount_minor, fx_rate)
        if currency != base:
            findings.append(parsing.finding(
                "CURRENCY_CONVERTED", "info", "currency",
                f"Amount is in {currency}, not the base currency {base}.",
                f"Converted at 1 {currency} = {fx_rate} {base} "
                f"({amount_minor/100:.2f} {currency} -> {amount_base_minor/100:.2f} {base}).",
                raw_value=currency, resolved_value=f"{amount_base_minor/100:.2f} {base}"))

    participants_raw = parsing.split_participants(raw.get("split_with"))
    details = parsing.parse_split_details(raw.get("split_details"))

    # --- settlement detection -------------------------------------------
    if not fatal and parsing.looks_like_settlement(
        split_type_raw, participants_raw, payer_name, description, notes
    ):
        to_name, f = resolver.resolve(participants_raw[0], "split_with")
        findings += f
        findings.append(parsing.finding(
            "SETTLEMENT_NOT_EXPENSE", "warning", "split_type",
            f"This row records a payment from {payer_name} to {to_name}, not a shared expense.",
            "Recorded as a settlement (moves the balance, is not split).",
            raw_value=raw.get("description")))
        parsed = {
            "record_type": "settlement", "date": dt.isoformat(),
            "description": description, "notes": notes,
            "amount_minor": amount_minor, "currency": currency,
            "amount_base_minor": amount_base_minor, "fx_rate": str(fx_rate),
            "from": {"raw": paid_by_raw.strip(), "name": payer_name},
            "to": {"raw": participants_raw[0], "name": to_name},
        }
        return {"row_number": row_number, "raw": raw, "record_type": "settlement",
                "action": StagedRow.Action.CREATE_SETTLEMENT, "findings": findings,
                "parsed": parsed, "date": dt, "desc_tokens": _description_tokens(description)}

    # --- unimportable rows (skip) ---------------------------------------
    if fatal or is_zero:
        return {"row_number": row_number, "raw": raw, "record_type": "skip",
                "action": StagedRow.Action.SKIP, "findings": findings, "parsed": {},
                "date": dt, "desc_tokens": _description_tokens(description)}

    # --- normal expense: build participant list with weights ------------
    split_type, participants = _build_participants(
        split_type_raw, participants_raw, details, resolver, findings)

    # For exact-amount (unequal) splits the per-person amounts must add up to the
    # expense total. If they don't, allocate() would silently re-proportion them,
    # so we flag the mismatch instead of guessing.
    if split_type == SplitType.UNEQUAL.value:
        detail_sum_minor = sum(
            int((Decimal(str(p["raw_value"])) * 100).to_integral_value())
            for p in participants if p["raw_value"] is not None)
        if detail_sum_minor != amount_minor:
            findings.append(parsing.finding(
                "UNEQUAL_SUM_MISMATCH", "warning", "split_details",
                f"Exact split amounts add up to {detail_sum_minor/100:.2f} "
                f"but the expense total is {amount_minor/100:.2f}.",
                "Allocated proportionally to the given amounts so shares still sum to the total.",
                raw_value=f"{detail_sum_minor/100:.2f}",
                resolved_value=f"{amount_minor/100:.2f}"))

    # drop members who were not in the group on the expense date
    participants = _drop_inactive(participants, dt, group, findings)

    if not participants:
        findings.append(parsing.finding(
            "NO_PARTICIPANTS", "error", "split_with",
            "No valid participants remain for this expense.",
            "Skipped: nothing to split.", raw_value=raw.get("split_with")))
        return {"row_number": row_number, "raw": raw, "record_type": "skip",
                "action": StagedRow.Action.SKIP, "findings": findings, "parsed": {},
                "date": dt, "desc_tokens": _description_tokens(description)}

    shares = compute_shares(amount_base_minor, split_type, participants)

    parsed = {
        "record_type": "expense", "date": dt.isoformat(),
        "description": description, "notes": notes,
        "paid_by": {"raw": paid_by_raw.strip(), "name": payer_name},
        "amount_minor": amount_minor, "currency": currency,
        "amount_base_minor": amount_base_minor, "fx_rate": str(fx_rate),
        "split_type": split_type,
        "participants": [
            {"raw": p["raw"], "name": p["name"],
             "raw_value": (str(p["raw_value"]) if p["raw_value"] is not None else None),
             "share_minor": s["share_minor"]}
            for p, s in zip(participants, shares)
        ],
    }
    return {"row_number": row_number, "raw": raw, "record_type": "expense",
            "action": StagedRow.Action.CREATE_EXPENSE, "findings": findings,
            "parsed": parsed, "date": dt, "desc_tokens": _description_tokens(description),
            "payer": payer_name, "amount_base_minor": amount_base_minor}


def _build_participants(split_type_raw, participants_raw, details, resolver, findings):
    """Return (canonical_split_type, participants) where each participant is
    {raw, name, raw_value}. Applies per-type weight rules and validation."""
    valid_types = {t.value for t in SplitType}
    split_type = split_type_raw if split_type_raw in valid_types else SplitType.EQUAL.value
    if split_type_raw and split_type_raw not in valid_types:
        findings.append(parsing.finding(
            "UNKNOWN_SPLIT_TYPE", "warning", "split_type",
            f"Split type '{split_type_raw}' is not recognized.",
            "Defaulted to an equal split.", raw_value=split_type_raw))

    if split_type == SplitType.EQUAL.value:
        if details:
            findings.append(parsing.finding(
                "SPLIT_DETAILS_IGNORED", "warning", "split_details",
                "Split type is 'equal' but per-person amounts were also provided.",
                "Honored the 'equal' split type and ignored the provided amounts.",
                raw_value="; ".join(f"{k} {v}" for k, v in details.items())))
        out = []
        for rawname in participants_raw:
            name, f = resolver.resolve(rawname, "split_with")
            findings += f
            out.append({"raw": rawname, "name": name, "raw_value": None})
        return split_type, out

    # unequal / percentage / share use the per-name values in split_details
    if not details:
        findings.append(parsing.finding(
            "MISSING_SPLIT_DETAILS", "warning", "split_details",
            f"Split type is '{split_type}' but no per-person values were given.",
            "Fell back to an equal split.", raw_value=""))
        out = []
        for rawname in participants_raw:
            name, f = resolver.resolve(rawname, "split_with")
            findings += f
            out.append({"raw": rawname, "name": name, "raw_value": None})
        return SplitType.EQUAL.value, out

    out = []
    for rawname, value in details.items():
        name, f = resolver.resolve(rawname, "split_details")
        findings += f
        out.append({"raw": rawname, "name": name, "raw_value": value})

    if split_type == SplitType.PERCENTAGE.value:
        total_pct = sum(v for v in details.values())
        if total_pct != 100:
            findings.append(parsing.finding(
                "PERCENTAGE_SUM", "warning", "split_details",
                f"Percentages sum to {total_pct}%, not 100%.",
                "Allocated proportionally to the given percentages (treated as relative weights).",
                raw_value=f"{total_pct}%"))
    return split_type, out


def _drop_inactive(participants, dt, group, findings):
    """Remove participants who were not active members on the expense date."""
    members_by_name = {m.name: m for m in group.members.all()}
    kept = []
    for p in participants:
        member = members_by_name.get(p["name"])
        if member is not None and not member.is_active_on(dt):
            findings.append(parsing.finding(
                "INACTIVE_MEMBER_IN_SPLIT", "warning", "split_with",
                f"{p['name']} was not a group member on {dt.isoformat()} "
                f"(joined {member.joined_on}, left {member.left_on}).",
                f"Removed {p['name']} from this expense's split.",
                raw_value=p["name"]))
            continue
        kept.append(p)
    return kept


def _detect_duplicates(interps):
    """Flag exact and conflicting duplicates. Compares each expense row to the
    expense rows already seen on the same date."""
    seen = []  # list of interp dicts (expenses only)
    for it in interps:
        if it["record_type"] != "expense":
            continue
        for prev in seen:
            if prev["date"] != it["date"]:
                continue
            overlap = _jaccard(prev["desc_tokens"], it["desc_tokens"])
            same_payer = prev.get("payer") == it.get("payer")
            same_amount = prev.get("amount_base_minor") == it.get("amount_base_minor")
            if overlap >= 0.5 and same_payer and same_amount:
                it["findings"].append(parsing.finding(
                    "DUPLICATE", "warning", "description",
                    f"Looks like a duplicate of row {prev['row_number']} "
                    f"(same date, payer and amount).",
                    f"Dropped as a duplicate; kept row {prev['row_number']}.",
                    raw_value=it["raw"].get("description")))
                it["action"] = StagedRow.Action.MERGE_DUPLICATE
                break
            if overlap >= 0.5 and (not same_payer or not same_amount):
                it["findings"].append(parsing.finding(
                    "CONFLICTING_DUPLICATE", "warning", "description",
                    f"Same event as row {prev['row_number']} but details differ "
                    f"(payer/amount). Only one can be correct.",
                    f"Kept row {prev['row_number']} by default and dropped this one; "
                    f"needs human confirmation of which is right.",
                    raw_value=it["raw"].get("description")))
                it["action"] = StagedRow.Action.MERGE_DUPLICATE
                break
        else:
            seen.append(it)


def _detect_date_spikes(interps):
    """A clean export is chronological. A row whose date is later than BOTH its
    neighbours is a single-row spike — a strong sign its date was misread. When
    that row's raw value is also DD-MM/MM-DD ambiguous, flag it as such."""
    dated = [it for it in interps if it.get("date") is not None
             and it["record_type"] in ("expense", "settlement")]
    for i in range(1, len(dated) - 1):
        prev, cur, nxt = dated[i - 1], dated[i], dated[i + 1]
        if cur["date"] > prev["date"] and cur["date"] > nxt["date"]:
            raw_date = (cur["raw"].get("date") or "").strip()
            parts = raw_date.split("-")
            both_small = (len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit()
                          and int(parts[0]) <= 12 and int(parts[1]) <= 12)
            if both_small:
                cur["findings"].append(parsing.finding(
                    "AMBIGUOUS_DATE", "warning", "date",
                    f"Date '{raw_date}' is ambiguous (DD-MM vs MM-DD) and is out of "
                    f"chronological order with its neighbours.",
                    "Interpreted as DD-MM-YYYY (the file's dominant format); flagged for review.",
                    raw_value=raw_date, resolved_value=cur["date"].isoformat()))
            else:
                cur["findings"].append(parsing.finding(
                    "OUT_OF_ORDER", "info", "date",
                    f"Row date {cur['date'].isoformat()} is out of chronological order.",
                    "Kept as-is; flagged for awareness.", raw_value=raw_date))


def _status_for(interp) -> str:
    """Clean rows auto-approve; anything we changed/dropped/skipped/merged needs
    explicit human approval (Meera's rule)."""
    changed = any(x["severity"] in ("warning", "error") for x in interp["findings"])
    if interp["action"] in (StagedRow.Action.MERGE_DUPLICATE, StagedRow.Action.SKIP):
        return StagedRow.Status.NEEDS_REVIEW
    return StagedRow.Status.NEEDS_REVIEW if changed else StagedRow.Status.APPROVED


@transaction.atomic
def stage_csv(group, file_bytes: bytes, filename: str, user=None) -> ImportBatch:
    """Parse a CSV into a reviewable ImportBatch. No real data is created."""
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
    if missing:
        raise ValueError(f"CSV is missing required columns: {sorted(missing)}")

    rows = list(reader)
    group._default_year = _infer_default_year(rows)
    resolver = MemberResolver(group)

    # row_number is the 1-based line number in the FILE (header is line 1), so it
    # matches exactly what a reviewer sees when they open the CSV.
    interps = [_interpret_row(i, row, resolver, group) for i, row in enumerate(rows, start=2)]
    _detect_duplicates(interps)
    _detect_date_spikes(interps)

    batch = ImportBatch.objects.create(
        group=group, uploaded_by=user, filename=filename, raw_row_count=len(rows))

    for it in interps:
        staged = StagedRow.objects.create(
            batch=batch, row_number=it["row_number"], raw=it["raw"],
            parsed=it["parsed"], proposed_action=it["action"], status=_status_for(it))
        for fnd in it["findings"]:
            Anomaly.objects.create(
                batch=batch, row=staged, row_number=it["row_number"],
                code=fnd["code"], severity=fnd["severity"], field=fnd["field"],
                message=fnd["message"], action_taken=fnd["action_taken"],
                raw_value=fnd["raw_value"][:255], resolved_value=fnd["resolved_value"][:255])
    return batch


# --------------------------------------------------------------------------- #
# Commit phase
# --------------------------------------------------------------------------- #
def _get_or_create_member(group, name, cache):
    if name in cache:
        return cache[name]
    member, _ = Member.objects.get_or_create(
        group=group, name=name, defaults={"is_guest": True})
    cache[name] = member
    return member


def _record_alias(member, raw_name):
    raw_name = parsing.normalize_name(raw_name)
    if raw_name and raw_name.lower() != member.name.lower():
        MemberAlias.objects.get_or_create(member=member, raw_name=raw_name)


@transaction.atomic
def commit_batch(batch: ImportBatch, user=None, auto_approve: bool = False) -> dict:
    """Materialize approved staged rows into real Expense/Settlement records.

    If `auto_approve` is False and any row still needs review, the commit is
    refused (so nothing is created without a decision). `auto_approve` accepts
    the importer's recommended action for every pending row at once."""
    if batch.status == ImportBatch.Status.COMMITTED:
        raise ValueError("This batch has already been committed.")

    pending = batch.rows.filter(status=StagedRow.Status.NEEDS_REVIEW)
    if pending.exists():
        if not auto_approve:
            raise ValueError(
                f"{pending.count()} row(s) still need review. Approve or reject them, "
                f"or commit with auto_approve to accept the recommended actions.")
        pending.update(status=StagedRow.Status.APPROVED, decided_by=user,
                       decided_at=timezone.now())

    group = batch.group
    cache: dict[str, Member] = {}
    created = {"expenses": 0, "settlements": 0, "dropped": 0, "skipped": 0}

    for row in batch.rows.filter(status=StagedRow.Status.APPROVED):
        action = row.proposed_action
        p = row.parsed
        if action == StagedRow.Action.MERGE_DUPLICATE:
            created["dropped"] += 1
            continue
        if action == StagedRow.Action.SKIP:
            created["skipped"] += 1
            continue
        if action == StagedRow.Action.CREATE_SETTLEMENT:
            frm = _get_or_create_member(group, p["from"]["name"], cache)
            to = _get_or_create_member(group, p["to"]["name"], cache)
            _record_alias(frm, p["from"]["raw"])
            _record_alias(to, p["to"]["raw"])
            Settlement.objects.create(
                group=group, from_member=frm, to_member=to, date=p["date"],
                amount_minor=p["amount_minor"], currency=p["currency"],
                amount_base_minor=p["amount_base_minor"], fx_rate=Decimal(p["fx_rate"]),
                notes=p.get("notes", ""), import_batch=batch, source_row=row.row_number)
            created["settlements"] += 1
            continue

        # CREATE_EXPENSE
        payer = _get_or_create_member(group, p["paid_by"]["name"], cache)
        _record_alias(payer, p["paid_by"]["raw"])
        expense = Expense.objects.create(
            group=group, description=p["description"], paid_by=payer, date=p["date"],
            amount_minor=p["amount_minor"], currency=p["currency"],
            amount_base_minor=p["amount_base_minor"], fx_rate=Decimal(p["fx_rate"]),
            split_type=p["split_type"], notes=p.get("notes", ""),
            import_batch=batch, source_row=row.row_number, created_by=user)
        for part in p["participants"]:
            member = _get_or_create_member(group, part["name"], cache)
            _record_alias(member, part["raw"])
            ExpenseSplit.objects.create(
                expense=expense, member=member, share_minor=part["share_minor"],
                raw_value=(Decimal(part["raw_value"]) if part["raw_value"] else None))
        created["expenses"] += 1

    batch.status = ImportBatch.Status.COMMITTED
    batch.committed_at = timezone.now()
    batch.save(update_fields=["status", "committed_at"])
    return created
