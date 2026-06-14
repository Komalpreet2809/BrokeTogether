from django.conf import settings
from django.db import models

from groups.models import Group


class ImportBatch(models.Model):
    """One CSV upload. Rows are parsed and staged here for human review BEFORE
    anything touches the real expense tables. This two-phase design (stage ->
    approve -> commit) is what lets Meera approve every change the app makes."""

    class Status(models.TextChoices):
        PENDING_REVIEW = "pending_review", "Pending review"
        COMMITTED = "committed", "Committed"
        DISCARDED = "discarded", "Discarded"

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="import_batches")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    filename = models.CharField(max_length=255)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING_REVIEW
    )
    raw_row_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    committed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Import #{self.pk} {self.filename} [{self.status}]"


class StagedRow(models.Model):
    """A single parsed CSV row awaiting a decision.

    `raw` is the untouched original cells. `parsed` is the importer's normalized
    interpretation. `proposed_action` is what the app wants to do; the human can
    approve or reject it. Nothing here becomes a real Expense/Settlement until
    the batch is committed and this row's status is APPROVED."""

    class Action(models.TextChoices):
        CREATE_EXPENSE = "create_expense", "Create expense"
        CREATE_SETTLEMENT = "create_settlement", "Record settlement"
        MERGE_DUPLICATE = "merge_duplicate", "Drop as duplicate"
        SKIP = "skip", "Skip row"

    class Status(models.TextChoices):
        # Clean rows auto-approve; anything the app altered defaults to NEEDS_REVIEW.
        APPROVED = "approved", "Approved"
        NEEDS_REVIEW = "needs_review", "Needs review"
        REJECTED = "rejected", "Rejected"

    batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name="rows")
    row_number = models.IntegerField()  # 1-based CSV data row (matches the file)
    raw = models.JSONField()
    parsed = models.JSONField(default=dict)
    proposed_action = models.CharField(max_length=20, choices=Action.choices)
    status = models.CharField(max_length=20, choices=Status.choices)

    # Set when this row was materialized on commit (provenance / idempotency).
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["row_number"]

    def __str__(self):
        return f"Row {self.row_number} [{self.proposed_action}/{self.status}]"


class Anomaly(models.Model):
    """One data problem detected in one row. The collection of these for a batch
    IS the 'Import report' deliverable. Each records what was wrong AND the
    policy action we took, so nothing is handled silently."""

    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        ERROR = "error", "Error"

    batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name="anomalies")
    row = models.ForeignKey(
        StagedRow, on_delete=models.CASCADE, null=True, blank=True, related_name="anomalies"
    )
    row_number = models.IntegerField()
    code = models.CharField(max_length=40)  # machine code, e.g. THOUSANDS_SEPARATOR
    severity = models.CharField(max_length=10, choices=Severity.choices)
    field = models.CharField(max_length=40, blank=True)
    message = models.TextField()       # what was wrong (human readable)
    action_taken = models.TextField()  # the policy we applied
    raw_value = models.CharField(max_length=255, blank=True)
    resolved_value = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["row_number", "id"]

    def __str__(self):
        return f"Row {self.row_number} {self.code}"
