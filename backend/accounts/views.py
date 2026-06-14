from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import RegisterSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    """Open endpoint to create a new login account."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(APIView):
    """Return the currently authenticated user (used by the frontend to confirm
    a token is still valid and show who is logged in)."""

    def get(self, request):
        return Response(UserSerializer(request.user).data)
