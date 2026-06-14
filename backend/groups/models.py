from django.conf import settings
from django.db import models


class Group(models.Model):
    """A household / expense group. The CSV maps to a single group, but the
    model supports many groups per user."""

    name = models.CharField(max_length=120)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_groups",
    )
    # All balances are reported in this currency. Expenses in other currencies
    # are converted on import (see expenses.money + SCOPE.md).
    base_currency = models.CharField(max_length=3, default="INR")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Member(models.Model):
    """A person participating in a group.

    A Member is deliberately NOT the same as a login User: the CSV contains
    people (Aisha, Dev, Kabir, ...) who may never log in. A Member can be
    optionally linked to a User account. Membership is time-bound via
    joined_on / left_on so that expenses only affect people who were in the
    group on the expense date (Sam's and Meera's requests)."""

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="members")
    name = models.CharField(max_length=120)  # canonical display name, e.g. "Priya"
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="memberships",
    )

    # Membership window. NULL joined_on == "present since the group began";
    # NULL left_on == "still a member".
    joined_on = models.DateField(null=True, blank=True)
    left_on = models.DateField(null=True, blank=True)

    # A guest is someone who participated in specific expenses but was never a
    # standing member of the household (e.g. Dev's friend Kabir for one day).
    is_guest = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["group", "name"], name="unique_member_name_per_group"
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.group.name})"

    def is_active_on(self, on_date) -> bool:
        """True if this member was part of the group on the given date.

        Used by the importer and balance engine to decide whether an expense
        dated D should involve this member."""
        if self.joined_on and on_date < self.joined_on:
            return False
        if self.left_on and on_date > self.left_on:
            return False
        return True


class MemberAlias(models.Model):
    """Raw name spellings from the CSV that resolve to one canonical Member.

    Example: "priya", "Priya S" -> Member "Priya". Recording the alias makes
    identity resolution auditable and lets us explain, in the live session,
    exactly why a row was attributed to a given person."""

    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="aliases")
    raw_name = models.CharField(max_length=120)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["member", "raw_name"], name="unique_alias_per_member"
            )
        ]

    def __str__(self):
        return f"{self.raw_name} -> {self.member.name}"
