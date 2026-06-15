"""Create the demo user + the flatmate group with correct membership windows.

The membership dates encode the story given in the assignment:
  * Aisha, Rohan, Priya, Meera have been in the flat since February (no
    joined_on => "since the beginning").
  * Meera moved out at the end of March  -> left_on 2026-03-31.
  * Sam moved in mid-April               -> joined_on 2026-04-08.
  * Dev is a trip guest, never a standing member -> is_guest.
  * Kabir is intentionally NOT seeded: he appears once in the CSV and the
    importer discovers him as a one-off guest (a deliberate anomaly).

These windows are a *product decision* configured by the group owner; the CSV
notes informed the dates. See DECISIONS.md.
"""

from datetime import date

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from groups.models import Group, Member


class Command(BaseCommand):
    help = "Seed the demo user, group and members."

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username="demo", defaults={"email": "demo@example.com"})
        user.set_password("BrokeTogether2026!")
        user.save()
        if created:
            self.stdout.write(self.style.SUCCESS("Created demo user (demo / BrokeTogether2026!)"))
        else:
            self.stdout.write(self.style.SUCCESS("Updated demo user password to BrokeTogether2026!"))

        group, _ = Group.objects.get_or_create(
            name="Flat 4B", owner=user, defaults={"base_currency": "INR"})

        members = [
            {"name": "Aisha"},
            {"name": "Rohan"},
            {"name": "Priya"},
            {"name": "Meera", "left_on": date(2026, 3, 31)},
            {"name": "Sam", "joined_on": date(2026, 4, 8)},
            {"name": "Dev", "is_guest": True},
        ]
        for m in members:
            Member.objects.get_or_create(group=group, name=m["name"], defaults={
                "left_on": m.get("left_on"),
                "joined_on": m.get("joined_on"),
                "is_guest": m.get("is_guest", False),
            })

        self.stdout.write(self.style.SUCCESS(
            f"Seeded group '{group.name}' (id={group.id}) with "
            f"{group.members.count()} members."))
