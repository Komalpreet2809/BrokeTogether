"""Natural-language balance query.

The reliability principle the JD asks us to articulate: **the LLM never does
math**. We compute every balance deterministically (expenses.balances), hand
those exact numbers to the model as facts, and ask it only to (a) understand the
user's plain-English question and (b) phrase an answer using *only* the numbers
we gave it. If the model is unreachable or the key is missing, we degrade
gracefully to returning the raw facts. This keeps the money correct even when
the AI is flaky.
"""

from __future__ import annotations

import json

import requests
from django.conf import settings

from expenses.balances import group_balances, member_breakdown
from groups.models import Member

SYSTEM_PROMPT = (
    "You are the assistant for a shared-expenses app. You are given EXACT, "
    "already-computed balance facts as JSON. Answer the user's question using "
    "ONLY those numbers. Never invent, add, or recompute amounts. All amounts "
    "are in {currency}. If the question cannot be answered from the facts, say "
    "so plainly. Keep answers to 1-3 short sentences."
)


def build_facts(group) -> dict:
    """The complete, deterministic picture the model is allowed to use."""
    balances = group_balances(group)
    per_member = []
    for m in group.members.all():
        bd = member_breakdown(group, m)["summary"]
        per_member.append({
            "name": m.name,
            "net": bd["net"],
            "total_paid": bd["total_paid"],
            "total_owed": bd["total_owed"],
        })
    return {
        "currency": balances["currency"],
        "net_balances": [
            {"name": b["name"], "net": b["net"], "status": b["status"]}
            for b in balances["balances"]
        ],
        "who_pays_whom": balances["settle_up"],
        "per_member_totals": per_member,
    }


def answer_question(group, question: str) -> dict:
    facts = build_facts(group)

    if not settings.GROQ_API_KEY:
        return {
            "answer": "AI is not configured on this server, so here are the raw "
                      "balance facts instead.",
            "facts": facts,
            "model": None,
            "ai_used": False,
        }

    payload = {
        "model": settings.GROQ_MODEL,
        "temperature": 0,
        "messages": [
            {"role": "system",
             "content": SYSTEM_PROMPT.format(currency=facts["currency"])},
            {"role": "user",
             "content": f"FACTS:\n{json.dumps(facts)}\n\nQUESTION: {question}"},
        ],
    }
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            json=payload, timeout=20)
        resp.raise_for_status()
        answer = resp.json()["choices"][0]["message"]["content"].strip()
        return {"answer": answer, "facts": facts,
                "model": settings.GROQ_MODEL, "ai_used": True}
    except (requests.RequestException, KeyError, IndexError) as e:
        # The AI is flaky; the numbers are not. Fall back to the facts.
        return {
            "answer": "The AI service is unavailable right now; showing the raw "
                      "balance facts instead.",
            "facts": facts, "model": settings.GROQ_MODEL,
            "ai_used": False, "error": str(e),
        }
