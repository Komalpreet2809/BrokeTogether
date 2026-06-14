from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.views import MeView, RegisterView
from aiquery.views import AskView
from expenses.views import (
    ExpenseViewSet, GroupBalancesView, MemberBreakdownView, SettlementViewSet,
)
from groups.views import GroupViewSet, MemberViewSet
from importer.views import (
    ImportBatchDetailView, ImportBatchListView, ImportCommitView,
    ImportUploadView, RowDecisionView,
)

router = DefaultRouter()
router.register("groups", GroupViewSet, basename="group")
router.register("members", MemberViewSet, basename="member")
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("settlements", SettlementViewSet, basename="settlement")


def health(_request):
    return JsonResponse({"status": "ok", "service": "shared-expenses-api"})


api_patterns = [
    # auth (login module)
    path("auth/register", RegisterView.as_view()),
    path("auth/login", TokenObtainPairView.as_view()),
    path("auth/refresh", TokenRefreshView.as_view()),
    path("auth/me", MeView.as_view()),

    # core resources
    path("", include(router.urls)),

    # balances + drill-down
    path("groups/<int:group_id>/balances", GroupBalancesView.as_view()),
    path("groups/<int:group_id>/members/<int:member_id>/breakdown",
         MemberBreakdownView.as_view()),

    # csv import workflow
    path("imports/upload", ImportUploadView.as_view()),
    path("imports", ImportBatchListView.as_view()),
    path("imports/<int:batch_id>", ImportBatchDetailView.as_view()),
    path("imports/<int:batch_id>/rows/<int:row_id>/decision", RowDecisionView.as_view()),
    path("imports/<int:batch_id>/commit", ImportCommitView.as_view()),

    # natural-language query (Groq)
    path("groups/<int:group_id>/ask", AskView.as_view()),
]

urlpatterns = [
    path("", health),
    path("admin/", admin.site.urls),
    path("api/", include(api_patterns)),
]
