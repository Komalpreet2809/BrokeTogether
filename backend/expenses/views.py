from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from groups.models import Group, Member
from .balances import group_balances, member_breakdown
from .models import Expense, Settlement
from .serializers import (
    ExpenseCreateSerializer, ExpenseReadSerializer, SettlementSerializer,
)


class ExpenseViewSet(viewsets.ModelViewSet):
    """List / create / delete expenses for the user's groups."""

    def get_queryset(self):
        qs = (Expense.objects.filter(group__owner=self.request.user)
              .select_related("paid_by").prefetch_related("splits__member"))
        group_id = self.request.query_params.get("group")
        return qs.filter(group_id=group_id) if group_id else qs

    def get_serializer_class(self):
        return ExpenseCreateSerializer if self.action == "create" else ExpenseReadSerializer


class SettlementViewSet(viewsets.ModelViewSet):
    serializer_class = SettlementSerializer

    def get_queryset(self):
        qs = (Settlement.objects.filter(group__owner=self.request.user)
              .select_related("from_member", "to_member"))
        group_id = self.request.query_params.get("group")
        return qs.filter(group_id=group_id) if group_id else qs


class GroupBalancesView(APIView):
    """GET /api/groups/<id>/balances — net balances + simplified settle-up."""

    def get(self, request, group_id):
        group = get_object_or_404(Group, id=group_id, owner=request.user)
        return Response(group_balances(group))


class MemberBreakdownView(APIView):
    """GET /api/groups/<id>/members/<member_id>/breakdown — Rohan's drill-down:
    every expense and settlement that makes up a member's balance."""

    def get(self, request, group_id, member_id):
        group = get_object_or_404(Group, id=group_id, owner=request.user)
        member = get_object_or_404(Member, id=member_id, group=group)
        return Response(member_breakdown(group, member))
