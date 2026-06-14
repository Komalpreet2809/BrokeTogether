from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import APIView

from groups.models import Group
from .services import answer_question


class AskView(APIView):
    """POST /api/groups/<group_id>/ask  {question: "how much does Rohan owe?"}"""

    def post(self, request, group_id):
        group = get_object_or_404(Group, id=group_id, owner=request.user)
        question = (request.data.get("question") or "").strip()
        if not question:
            return Response({"detail": "Question is required."},
                            status=http_status.HTTP_400_BAD_REQUEST)
        return Response(answer_question(group, question))
