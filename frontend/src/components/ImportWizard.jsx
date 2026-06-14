import { useState } from "react";
import api from "../api";
import { SeverityBars, StatCard } from "./charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Check, RotateCcw, Upload, X } from "lucide-react";

const sevVariant = { error: "default", warning: "secondary", info: "outline" };
const statusVariant = { approved: "default", needs_review: "secondary", rejected: "outline" };

export default function ImportWizard({ group, onCommitted }) {
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload() {
    if (!file) return;
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.append("group", group.id);
    fd.append("file", file);
    try {
      const { data } = await api.post("/imports/upload", fd);
      setReport(data);
    } catch (e) {
      setErr(e.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); }
  }

  async function decide(rowId, status) {
    await api.post(`/imports/${report.batch_id}/rows/${rowId}/decision`, { status });
    setReport({ ...report, rows: report.rows.map((r) => (r.id === rowId ? { ...r, status } : r)) });
  }

  async function commit(autoApprove) {
    setBusy(true); setErr("");
    try {
      await api.post(`/imports/${report.batch_id}/commit`, { auto_approve: autoApprove });
      onCommitted?.();
    } catch (e) {
      setErr(e.response?.data?.detail || "Commit failed");
    } finally { setBusy(false); }
  }

  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import expenses CSV</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload <code className="rounded bg-muted px-1.5 py-0.5">expenses_export.csv</code>. The app
            detects every data problem, shows exactly what it will do, and changes nothing until you approve.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} />
          {err && <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">{err}</div>}
          <Button disabled={!file || busy} onClick={upload}>
            <Upload className="mr-2 h-4 w-4" /> {busy ? "Analyzing…" : "Upload & analyze"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sev = report.by_severity;
  const pending = report.rows.filter((r) => r.status === "needs_review").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rows in file" value={report.raw_row_count} />
        <StatCard label="Anomalies" value={report.anomaly_count} />
        <StatCard label="Awaiting decision" value={pending} />
        <StatCard label="Errors / Warnings / Info" value={`${sev.error} / ${sev.warning} / ${sev.info}`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Import report</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setReport(null)}>
            <RotateCcw className="mr-1 h-4 w-4" /> Start over
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <SeverityBars error={sev.error} warning={sev.warning} info={sev.info} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Row</TableHead><TableHead>Action</TableHead>
                <TableHead>Status</TableHead><TableHead>Anomalies &amp; handling</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.filter((r) => r.anomalies.length > 0).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{r.row_number}</TableCell>
                  <TableCell className="text-sm">{r.action_label}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[r.status]}>{r.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      {r.anomalies.map((a, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={sevVariant[a.severity]}>{a.code}</Badge>
                          <span className="text-sm">{a.message}</span>
                          <span className="text-xs text-muted-foreground">→ {a.action_taken}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.status === "needs_review" && (
                      <div className="flex gap-1">
                        <Button size="icon" className="h-7 w-7" onClick={() => decide(r.id, "approved")}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => decide(r.id, "rejected")}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {err && <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">{err}</div>}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy || pending > 0} onClick={() => commit(false)}>
              Import approved rows
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => commit(true)}>
              Approve all recommendations &amp; import
            </Button>
            {pending > 0 && (
              <span className="text-sm text-muted-foreground">
                Decide the {pending} pending row(s), or use “Approve all”.
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
