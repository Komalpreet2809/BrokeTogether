from decimal import Decimal

from django.test import TestCase

from .money import allocate, to_minor, convert_to_base, to_major_str
from .splitting import compute_shares


class MoneyTests(TestCase):
    def test_to_minor_rounds_half_up(self):
        # The sub-paisa case from the CSV: 899.995 -> 90000 paise (= 900.00).
        self.assertEqual(to_minor(Decimal("899.995")), 90000)
        self.assertEqual(to_minor("1200"), 120000)
        self.assertEqual(to_minor(Decimal("3200")), 320000)

    def test_to_major_str(self):
        self.assertEqual(to_major_str(90000), "900.00")
        self.assertEqual(to_major_str(-2505), "-25.05")

    def test_allocate_sums_to_total(self):
        # 100.00 split 3 ways cannot divide evenly; shares must still sum exactly.
        shares = allocate(10000, [Decimal(1), Decimal(1), Decimal(1)])
        self.assertEqual(sum(shares), 10000)
        self.assertEqual(sorted(shares), [3333, 3333, 3334])

    def test_allocate_handles_negative_refund(self):
        shares = allocate(-2505, [Decimal(1)] * 4)
        self.assertEqual(sum(shares), -2505)
        self.assertTrue(all(s <= 0 for s in shares))

    def test_convert_to_base(self):
        # 540 USD at 83.50 -> 45090.00 INR
        self.assertEqual(convert_to_base(54000, Decimal("83.50")), 4509000)


class SplittingTests(TestCase):
    def test_percentage_not_summing_to_100_is_normalized(self):
        # 30/30/30/20 = 110%; shares are proportional and sum to the total.
        parts = [
            {"name": "A", "raw_value": Decimal(30)},
            {"name": "B", "raw_value": Decimal(30)},
            {"name": "C", "raw_value": Decimal(30)},
            {"name": "D", "raw_value": Decimal(20)},
        ]
        shares = compute_shares(144000, "percentage", parts)
        self.assertEqual(sum(s["share_minor"] for s in shares), 144000)
        # weights 30 and 20 should be in proportion
        a = next(s for s in shares if s["name"] == "A")["share_minor"]
        d = next(s for s in shares if s["name"] == "D")["share_minor"]
        self.assertAlmostEqual(a / d, 30 / 20, places=2)

    def test_share_ratio_split(self):
        parts = [
            {"name": "A", "raw_value": Decimal(1)},
            {"name": "B", "raw_value": Decimal(2)},
            {"name": "C", "raw_value": Decimal(1)},
        ]
        shares = compute_shares(40000, "share", parts)  # ratio 1:2:1 of 400.00
        by = {s["name"]: s["share_minor"] for s in shares}
        self.assertEqual(sum(by.values()), 40000)
        self.assertEqual(by["B"], by["A"] + by["C"])
