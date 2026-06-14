from decimal import Decimal

from rest_framework import serializers

from groups.models import Group, Member
from .models import Expense, ExpenseSplit, Settlement, SplitType
from .money import convert_to_base, to_major_str, to_minor
from .splitting import compute_shares


# --------------------------- read serializers ---------------------------- #
class ExpenseSplitReadSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source="member.name", read_only=True)
    share = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseSplit
        fields = ("member", "member_name", "share_minor", "share", "raw_value")

    def get_share(self, obj):
        return to_major_str(obj.share_minor)


class ExpenseReadSerializer(serializers.ModelSerializer):
    paid_by_name = serializers.CharField(source="paid_by.name", read_only=True)
    amount = serializers.SerializerMethodField()
    amount_base = serializers.SerializerMethodField()
    splits = ExpenseSplitReadSerializer(many=True, read_only=True)

    class Meta:
        model = Expense
        fields = ("id", "group", "date", "description", "paid_by", "paid_by_name",
                  "amount_minor", "amount", "currency", "amount_base_minor",
                  "amount_base", "fx_rate", "split_type", "notes", "source_row",
                  "splits")

    def get_amount(self, obj):
        return to_major_str(obj.amount_minor)

    def get_amount_base(self, obj):
        return to_major_str(obj.amount_base_minor)


# --------------------------- write serializer ---------------------------- #
class SplitInputSerializer(serializers.Serializer):
    member = serializers.IntegerField()
    # value = exact amount (unequal), percent (percentage) or share count (share).
    value = serializers.DecimalField(max_digits=12, decimal_places=4, required=False,
                                     allow_null=True)


class ExpenseCreateSerializer(serializers.Serializer):
    """Create an expense through the app. Shares are computed server-side from
    the split type + per-member values, using the same engine as the importer."""

    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all())
    description = serializers.CharField(max_length=255)
    date = serializers.DateField()
    paid_by = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField(max_length=3, default="INR")
    split_type = serializers.ChoiceField(choices=SplitType.choices)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    splits = SplitInputSerializer(many=True)

    def validate(self, attrs):
        from django.conf import settings
        request = self.context["request"]
        group = attrs["group"]
        if group.owner_id != request.user.id:
            raise serializers.ValidationError("You do not own this group.")

        currency = attrs["currency"].upper()
        if currency not in settings.FX_RATES_TO_BASE:
            raise serializers.ValidationError({"currency": f"No FX rate for {currency}."})

        member_ids = {s["member"] for s in attrs["splits"]} | {attrs["paid_by"]}
        members = {m.id: m for m in Member.objects.filter(group=group, id__in=member_ids)}
        if len(members) != len(member_ids):
            raise serializers.ValidationError("Some members do not belong to this group.")

        # membership window check (same rule as the importer)
        for s in attrs["splits"]:
            m = members[s["member"]]
            if not m.is_active_on(attrs["date"]):
                raise serializers.ValidationError(
                    f"{m.name} was not a member on {attrs['date']}.")

        attrs["_members"] = members
        attrs["_currency"] = currency
        return attrs

    def create(self, validated):
        from django.conf import settings
        group = validated["group"]
        members = validated["_members"]
        currency = validated["_currency"]
        request = self.context["request"]

        amount_minor = to_minor(validated["amount"])
        fx_rate = Decimal(str(settings.FX_RATES_TO_BASE[currency]))
        amount_base_minor = convert_to_base(amount_minor, fx_rate)

        participants = [
            {"name": members[s["member"]].name, "raw_value": s.get("value"),
             "_id": s["member"]}
            for s in validated["splits"]
        ]
        shares = compute_shares(amount_base_minor, validated["split_type"], participants)

        expense = Expense.objects.create(
            group=group, description=validated["description"],
            paid_by=members[validated["paid_by"]], date=validated["date"],
            amount_minor=amount_minor, currency=currency,
            amount_base_minor=amount_base_minor, fx_rate=fx_rate,
            split_type=validated["split_type"], notes=validated.get("notes", ""),
            created_by=request.user)
        for part, share in zip(participants, shares):
            ExpenseSplit.objects.create(
                expense=expense, member_id=part["_id"],
                share_minor=share["share_minor"],
                raw_value=part["raw_value"])
        return expense

    def to_representation(self, instance):
        return ExpenseReadSerializer(instance, context=self.context).data


# --------------------------- settlement serializer ----------------------- #
class SettlementSerializer(serializers.ModelSerializer):
    from_name = serializers.CharField(source="from_member.name", read_only=True)
    to_name = serializers.CharField(source="to_member.name", read_only=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, write_only=True)
    amount_display = serializers.SerializerMethodField()

    class Meta:
        model = Settlement
        fields = ("id", "group", "from_member", "to_member", "from_name", "to_name",
                  "date", "amount", "amount_display", "currency", "notes", "source_row")
        read_only_fields = ("source_row",)

    def get_amount_display(self, obj):
        return to_major_str(obj.amount_base_minor)

    def validate(self, attrs):
        from django.conf import settings
        request = self.context["request"]
        if attrs["group"].owner_id != request.user.id:
            raise serializers.ValidationError("You do not own this group.")
        currency = attrs.get("currency", "INR").upper()
        if currency not in settings.FX_RATES_TO_BASE:
            raise serializers.ValidationError({"currency": f"No FX rate for {currency}."})
        attrs["currency"] = currency
        return attrs

    def create(self, validated):
        from django.conf import settings
        amount_minor = to_minor(validated.pop("amount"))
        fx_rate = Decimal(str(settings.FX_RATES_TO_BASE[validated["currency"]]))
        return Settlement.objects.create(
            amount_minor=amount_minor,
            amount_base_minor=convert_to_base(amount_minor, fx_rate),
            fx_rate=fx_rate, **validated)
