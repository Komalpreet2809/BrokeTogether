from django.contrib import admin

from .models import Anomaly, ImportBatch, StagedRow


class AnomalyInline(admin.TabularInline):
    model = Anomaly
    extra = 0


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = ("id", "filename", "group", "status", "raw_row_count", "created_at")
    list_filter = ("status",)
    inlines = [AnomalyInline]


@admin.register(StagedRow)
class StagedRowAdmin(admin.ModelAdmin):
    list_display = ("batch", "row_number", "proposed_action", "status")
    list_filter = ("batch", "proposed_action", "status")


@admin.register(Anomaly)
class AnomalyAdmin(admin.ModelAdmin):
    list_display = ("batch", "row_number", "code", "severity", "field")
    list_filter = ("batch", "severity", "code")
