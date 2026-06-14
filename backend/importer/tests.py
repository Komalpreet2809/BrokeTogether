from django.conf import settings
from django.core.management import call_command
from django.test import TestCase

from expenses.balances import compute_net
from expenses.models import Expense, Settlement
from groups.models import Group, Member
from importer import services
from importer.models import ImportBatch, StagedRow


def _csv_bytes():
    return (settings.BASE_DIR.parent / "data" / "expenses_export.csv").read_bytes()


class ImportPipelineTests(TestCase):
    """End-to-end test over the real, unedited CSV."""

    def setUp(self):
        call_command("seed_demo")
        self.group = Group.objects.get(name="Flat 4B")
        self.batch = services.stage_csv(self.group, _csv_bytes(), "expenses_export.csv",
                                        user=self.group.owner)

    def _codes(self):
        return set(self.batch.anomalies.values_list("code", flat=True))

    def test_detects_the_key_anomalies(self):
        expected = {
            "DUPLICATE", "CONFLICTING_DUPLICATE", "THOUSANDS_SEPARATOR",
            "SUBUNIT_PRECISION", "NAME_NORMALIZED", "NAME_VARIANT", "MISSING_PAYER",
            "SETTLEMENT_NOT_EXPENSE", "PERCENTAGE_SUM", "CURRENCY_CONVERTED",
            "NEGATIVE_AMOUNT", "NEW_MEMBER", "DATE_FORMAT", "MISSING_CURRENCY",
            "ZERO_AMOUNT", "AMBIGUOUS_DATE", "INACTIVE_MEMBER_IN_SPLIT",
            "SPLIT_DETAILS_IGNORED",
        }
        missing = expected - self._codes()
        self.assertEqual(missing, set(), f"importer failed to detect: {missing}")
        # The assignment promises "at least 12" problems; we must exceed that.
        self.assertGreaterEqual(len(self._codes()), 12)

    def test_clean_rows_autoapprove_changed_rows_need_review(self):
        statuses = set(self.batch.rows.values_list("status", flat=True))
        self.assertIn(StagedRow.Status.APPROVED, statuses)
        self.assertIn(StagedRow.Status.NEEDS_REVIEW, statuses)

    def test_commit_is_blocked_until_rows_are_decided(self):
        with self.assertRaises(ValueError):
            services.commit_batch(self.batch, user=self.group.owner, auto_approve=False)

    def test_commit_materializes_and_balances_to_zero(self):
        result = services.commit_batch(self.batch, user=self.group.owner, auto_approve=True)
        self.assertEqual(result["settlements"], 2)   # Rohan->Aisha, Sam->Aisha
        self.assertEqual(result["dropped"], 2)        # the two duplicates
        self.assertEqual(result["skipped"], 2)        # missing payer + zero amount
        self.assertGreater(result["expenses"], 30)

        net = compute_net(self.group)
        self.assertEqual(sum(net.values()), 0)

        # Kabir was discovered from the CSV and created as a guest.
        self.assertTrue(Member.objects.filter(
            group=self.group, name="Dev's friend Kabir", is_guest=True).exists())

    def test_inactive_member_dropped_from_split(self):
        services.commit_batch(self.batch, user=self.group.owner, auto_approve=True)
        # Meera left 2026-03-31; the 2026-04-02 groceries must not include her.
        meera = Member.objects.get(group=self.group, name="Meera")
        april = Expense.objects.filter(group=self.group, date="2026-04-02").first()
        self.assertIsNotNone(april)
        self.assertFalse(april.splits.filter(member=meera).exists())

    def test_settlement_not_double_counted_as_expense(self):
        services.commit_batch(self.batch, user=self.group.owner, auto_approve=True)
        # "Rohan paid Aisha back" must be a Settlement, never an Expense.
        self.assertFalse(Expense.objects.filter(
            group=self.group, description__icontains="paid Aisha back").exists())
        self.assertTrue(Settlement.objects.filter(group=self.group).exists())
