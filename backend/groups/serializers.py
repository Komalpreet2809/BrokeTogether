from rest_framework import serializers

from .models import Group, Member


class MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Member
        fields = ("id", "group", "name", "joined_on", "left_on", "is_guest")

    def validate_group(self, group):
        request = self.context.get("request")
        if request and group.owner_id != request.user.id:
            raise serializers.ValidationError("You do not own this group.")
        return group


class GroupSerializer(serializers.ModelSerializer):
    members = MemberSerializer(many=True, read_only=True)
    member_count = serializers.IntegerField(source="members.count", read_only=True)

    class Meta:
        model = Group
        fields = ("id", "name", "base_currency", "created_at", "members", "member_count")
        read_only_fields = ("created_at",)
