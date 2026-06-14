from django.contrib import admin

from .models import Group, Member, MemberAlias


class MemberAliasInline(admin.TabularInline):
    model = MemberAlias
    extra = 0


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "base_currency", "created_at")


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ("name", "group", "joined_on", "left_on", "is_guest")
    list_filter = ("group", "is_guest")
    inlines = [MemberAliasInline]
