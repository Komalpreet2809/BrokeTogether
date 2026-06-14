"""Import the CSV from the command line and write IMPORT_REPORT.md.

Usage:
    python manage.py import_csv                      # stage only (review needed)
    python manage.py import_csv --commit             # stage + auto-approve + commit
    python manage.py import_csv --group-id 1 --csv ../data/expenses_export.csv --commit
"""

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from groups.models import Group
from importer import services
from importer.report import report_markdown


class Command(BaseCommand):
    help = "Stage (and optionally commit) a CSV import, then write IMPORT_REPORT.md."

    def add_arguments(self, parser):
        parser.add_argument("--group-id", type=int, default=None)
        parser.add_argument("--csv", type=str, default=None)
        parser.add_argument("--commit", action="store_true",
                            help="Auto-approve recommended actions and commit.")
        parser.add_argument("--out", type=str, default=None,
                            help="Path for the generated import report markdown.")

    def handle(self, *args, **options):
        group = (Group.objects.get(id=options["group_id"]) if options["group_id"]
                 else Group.objects.order_by("id").first())
        if group is None:
            raise CommandError("No group found. Run `python manage.py seed_demo` first.")

        csv_path = Path(options["csv"]) if options["csv"] else (
            settings.BASE_DIR.parent / "data" / "expenses_export.csv")
        if not csv_path.exists():
            raise CommandError(f"CSV not found: {csv_path}")

        file_bytes = csv_path.read_bytes()
        batch = services.stage_csv(group, file_bytes, csv_path.name, user=group.owner)
        self.stdout.write(self.style.SUCCESS(
            f"Staged batch #{batch.id}: {batch.raw_row_count} rows, "
            f"{batch.anomalies.count()} anomalies."))

        if options["commit"]:
            result = services.commit_batch(batch, user=group.owner, auto_approve=True)
            self.stdout.write(self.style.SUCCESS(f"Committed: {result}"))

        out_path = Path(options["out"]) if options["out"] else (
            settings.BASE_DIR.parent / "IMPORT_REPORT.md")
        out_path.write_text(report_markdown(batch), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Wrote import report -> {out_path}"))
