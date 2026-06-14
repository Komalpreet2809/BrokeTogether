from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from groups.models import Group
from . import services
from .models import ImportBatch, StagedRow
from .report import report_data, report_markdown
from .serializers import ImportBatchListSerializer, RowDecisionSerializer


class ImportUploadView(APIView):
    """POST /api/imports/upload  (multipart: group, file)
    Parses + stages the CSV and returns the import report (no data committed)."""
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        group = get_object_or_404(Group, id=request.data.get("group"), owner=request.user)
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "No file uploaded."},
                            status=http_status.HTTP_400_BAD_REQUEST)
        try:
            batch = services.stage_csv(group, upload.read(), upload.name, user=request.user)
        except ValueError as e:
            return Response({"detail": str(e)}, status=http_status.HTTP_400_BAD_REQUEST)
        return Response(report_data(batch), status=http_status.HTTP_201_CREATED)


class ImportBatchListView(APIView):
    def get(self, request):
        qs = ImportBatch.objects.filter(group__owner=request.user)
        group_id = request.query_params.get("group")
        if group_id:
            qs = qs.filter(group_id=group_id)
        return Response(ImportBatchListSerializer(qs, many=True).data)


class ImportBatchDetailView(APIView):
    """GET — full import report (rows + anomalies + actions)."""
    def get(self, request, batch_id):
        batch = get_object_or_404(ImportBatch, id=batch_id, group__owner=request.user)
        fmt = request.query_params.get("format")
        if fmt == "markdown":
            return Response({"markdown": report_markdown(batch)})
        return Response(report_data(batch))


class RowDecisionView(APIView):
    """POST /api/imports/<batch_id>/rows/<row_id>/decision
    Approve or reject a single staged row (Meera's approval workflow)."""
    def post(self, request, batch_id, row_id):
        batch = get_object_or_404(ImportBatch, id=batch_id, group__owner=request.user)
        row = get_object_or_404(StagedRow, id=row_id, batch=batch)
        ser = RowDecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if "action" in ser.validated_data:
            row.proposed_action = ser.validated_data["action"]
        row.status = (StagedRow.Status.APPROVED
                      if ser.validated_data["status"] == "approved"
                      else StagedRow.Status.REJECTED)
        row.decided_by = request.user
        row.decided_at = timezone.now()
        row.save()
        return Response({"id": row.id, "status": row.status,
                         "proposed_action": row.proposed_action})


class ImportCommitView(APIView):
    """POST /api/imports/<batch_id>/commit  {auto_approve?: bool}
    Materialize approved rows into real expenses/settlements."""
    def post(self, request, batch_id):
        batch = get_object_or_404(ImportBatch, id=batch_id, group__owner=request.user)
        auto = bool(request.data.get("auto_approve", False))
        try:
            result = services.commit_batch(batch, user=request.user, auto_approve=auto)
        except ValueError as e:
            return Response({"detail": str(e)}, status=http_status.HTTP_400_BAD_REQUEST)
        return Response({"committed": result, "report": report_data(batch)})
