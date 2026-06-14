from rest_framework import serializers

from .models import ImportBatch


class ImportBatchListSerializer(serializers.ModelSerializer):
    anomaly_count = serializers.IntegerField(source="anomalies.count", read_only=True)

    class Meta:
        model = ImportBatch
        fields = ("id", "group", "filename", "status", "raw_row_count",
                  "anomaly_count", "created_at", "committed_at")


class RowDecisionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["approved", "rejected"])
    # optional override of the importer's recommended action
    action = serializers.ChoiceField(
        choices=["create_expense", "create_settlement", "merge_duplicate", "skip"],
        required=False)
