from django.contrib import admin

from .models import Expense, ExpenseSplit, Settlement


class ExpenseSplitInline(admin.TabularInline):
    model = ExpenseSplit
    extra = 0


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ("date", "description", "paid_by", "amount_minor", "currency", "split_type", "source_row")
    list_filter = ("group", "split_type", "currency")
    search_fields = ("description",)
    inlines = [ExpenseSplitInline]


@admin.register(Settlement)
class SettlementAdmin(admin.ModelAdmin):
    list_display = ("date", "from_member", "to_member", "amount_base_minor", "source_row")
    list_filter = ("group",)
