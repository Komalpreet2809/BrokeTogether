from rest_framework import viewsets

from .models import Group, Member
from .serializers import GroupSerializer, MemberSerializer


class GroupViewSet(viewsets.ModelViewSet):
    """CRUD for the current user's groups."""
    serializer_class = GroupSerializer

    def get_queryset(self):
        return (Group.objects.filter(owner=self.request.user)
                .prefetch_related("members").order_by("id"))

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class MemberViewSet(viewsets.ModelViewSet):
    """CRUD for members. Membership windows (joined_on / left_on) are edited
    here — this is how a group's membership changes over time."""
    serializer_class = MemberSerializer

    def get_queryset(self):
        qs = Member.objects.filter(group__owner=self.request.user).order_by("name")
        group_id = self.request.query_params.get("group")
        return qs.filter(group_id=group_id) if group_id else qs
