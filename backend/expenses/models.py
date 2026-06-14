from django.conf import settings
from django.db import models

from groups.models import Group, Member
from .money import to_major_str


class SplitType(models.TextChoices):
    EQUAL = "equal", "Equal"
    UNEQUAL = "unequal", "Unequal (exact amounts)"
    PERCENTAGE = "percentage", "Percentage"
    SHARE = "share", "Shares (ratio)"


class Expense(models.Model):
    """A shared expense. One person paid; the cost is split across members
    according to `split_type`. Money is stored in integer minor units, both in
    the original currency and converted to the group's base currency."""

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="expenses")
    description = models.CharField(max_length=255)
    paid_by = models.ForeignKey(
        Member, on_delete=models.PROTECT, related_name="expenses_paid"
    )
    date = models.DateField()

    # Original-currency amount (e.g. 540 USD -> amount_minor=54000, currency=USD).
    amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3)

    # Same amount converted into the group's base currency, with the rate used.
    amount_base_minor = models.BigIntegerField()
    fx_rate = models.DecimalField(max_digits=12, decimal_places=4, default=1)

    split_type = models.CharField(max_length=12, choices=SplitType.choices)
    notes = models.TextField(blank=True)

    # Provenance: which import batch / CSV row produced this. Lets us answer
    # "trace this exact CSV row" in the live session.
    import_batch = models.ForeignKey(
        "importer.ImportBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    source_row = models.IntegerField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "id"]

    def __str__(self):
        return f"{self.date} {self.description} ({to_major_str(self.amount_base_minor)} {self.group.base_currency})"


class ExpenseSplit(models.Model):
    """How much one member owes for one expense, in base-currency minor units.

    `share_minor` is the concrete amount that goes into balance math. `raw_value`
    keeps the original input (percent / share-weight / exact amount) so we can
    show Rohan exactly how his number was built."""

    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="splits")
    member = models.ForeignKey(Member, on_delete=models.PROTECT, related_name="splits")
    share_minor = models.BigIntegerField()
    raw_value = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["expense", "member"], name="unique_member_per_expense_split"
            )
        ]

    def __str__(self):
        return f"{self.member.name} owes {to_major_str(self.share_minor)} on '{self.expense.description}'"


class Settlement(models.Model):
    """A direct payment from one member to another (e.g. "Rohan paid Aisha
    back"). Settlements are NOT expenses: they don't get split, they just move
    the balance. Keeping them in a separate table is the single most important
    modelling decision for correctness (see DECISIONS.md)."""

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="settlements")
    from_member = models.ForeignKey(
        Member, on_delete=models.PROTECT, related_name="settlements_paid"
    )
    to_member = models.ForeignKey(
        Member, on_delete=models.PROTECT, related_name="settlements_received"
    )
    date = models.DateField()

    amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3)
    amount_base_minor = models.BigIntegerField()
    fx_rate = models.DecimalField(max_digits=12, decimal_places=4, default=1)

    notes = models.TextField(blank=True)

    import_batch = models.ForeignKey(
        "importer.ImportBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="settlements",
    )
    source_row = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "id"]

    def __str__(self):
        return f"{self.from_member.name} -> {self.to_member.name}: {to_major_str(self.amount_base_minor)}"
