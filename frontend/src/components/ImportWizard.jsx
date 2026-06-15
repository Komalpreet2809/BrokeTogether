import { useState } from "react";
import api from "../api";
import { Legend, SeverityBars, StatCard } from "./charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Check, RotateCcw, Upload, X, FileSpreadsheet, Eye, AlertTriangle, AlertOctagon, HelpCircle, ArrowRight
} from "lucide-react";

const sevVariant = { error: "destructive", warning: "secondary", info: "outline" };
const statusVariant = { approved: "default", needs_review: "secondary", rejected: "outline" };

export default function ImportWizard({ group, onCommitted }) {
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  
  // Interactive wizard states
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);

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
    try {
      await api.post(`/imports/${report.batch_id}/rows/${rowId}/decision`, { status });
      setReport({
        ...report,
        rows: report.rows.map((r) => (r.id === rowId ? { ...r, status } : r))
      });
      if (selectedRow && selectedRow.id === rowId) {
        setSelectedRow({ ...selectedRow, status });
      }
    } catch (e) {
      setErr("Failed to save decision");
    }
  }

  // Handle Conflicting Duplicates (Row 24/25) explicitly in UI
  async function resolveConflict(keepRowId, discardRowId) {
    setBusy(true);
    try {
      await api.post(`/imports/${report.batch_id}/rows/${keepRowId}/decision`, { status: "approved" });
      await api.post(`/imports/${report.batch_id}/rows/${discardRowId}/decision`, { status: "rejected" });
      setReport({
        ...report,
        rows: report.rows.map((r) => {
          if (r.id === keepRowId) return { ...r, status: "approved" };
          if (r.id === discardRowId) return { ...r, status: "rejected" };
          return r;
        })
      });
    } catch (e) {
      setErr("Failed to resolve duplicate conflict");
    } finally {
      setBusy(false);
    }
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
      <Card className="glow-card">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <span className="p-2 bg-primary/10 rounded-lg text-primary"><FileSpreadsheet className="h-6 w-6" /></span>
            <CardTitle>Import expenses CSV</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload the flatmates' messy spreadsheet export <code className="rounded bg-muted px-1.5 py-0.5 font-mono">expenses_export.csv</code>.
            The app parses the file, checks for 12+ deliberate data anomalies, displays the proposed resolutions, and writes nothing until approved.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center bg-muted/10 hover:bg-muted/20 transition-all cursor-pointer relative">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <span className="text-sm font-semibold text-foreground">
              {file ? file.name : "Drag & drop your CSV file here, or click to browse"}
            </span>
            <span className="text-[10px] text-muted-foreground mt-1">Accepts only .csv files</span>
          </div>

          {err && <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div>}
          
          <Button disabled={!file || busy} onClick={upload} className="w-full">
            {busy ? "Analyzing file columns…" : "Upload & Analyze Spreadsheet"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sev = report.by_severity;
  const pending = report.rows.filter((r) => r.status === "needs_review").length;
  const filteredRows = filterFlagged
    ? report.rows.filter((r) => r.anomalies.length > 0)
    : report.rows;

  // Find the Thalassa duplicate conflict rows for explicit resolution widget
  const thalassaConflictRows = report.rows.filter(
    (r) => r.anomalies.some((a) => a.code === "CONFLICTING_DUPLICATE")
  );

  return (
    <div className="space-y-6">
      {/* Import summary metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rows in file" value={report.raw_row_count} />
        <StatCard label="Anomalies detected" value={report.anomaly_count} />
        <StatCard label="Awaiting decision" value={pending} />
        <StatCard label="Errors / Warnings / Info" value={`${sev.error} / ${sev.warning} / ${sev.info}`} />
      </div>

      {/* Conflicting duplicate quick resolver */}
      {thalassaConflictRows.length === 2 && thalassaConflictRows.some(r => r.status === "needs_review") && (
        <Card className="border-border bg-muted/20 glow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-foreground">
              <AlertOctagon className="h-5 w-5" /> Duplicate Conflict: Dinner at Thalassa
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Meera's request: Row 24 and Row 25 both represent the same event, but contain conflicting payers and amounts. Select the correct record:
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 pt-2">
            {thalassaConflictRows.map((row) => (
              <div
                key={row.id}
                className={`border rounded-xl p-3.5 bg-card flex flex-col justify-between ${
                  row.status === "approved" ? "border-pos ring-1 ring-pos" : "border-border"
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-muted-foreground">CSV Row #{row.row_number}</span>
                    <Badge variant={statusVariant[row.status]}>{row.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="text-sm font-semibold">{row.raw.description}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Paid by: <span className="font-bold text-foreground">{row.raw.paid_by}</span></div>
                  <div className="text-xs text-muted-foreground mt-0.5">Amount: <span className="font-bold text-foreground">{row.raw.amount} {row.raw.currency}</span></div>
                </div>
                <div className="mt-4 flex gap-1.5">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={row.status === "approved"}
                    onClick={() => {
                      const otherRow = thalassaConflictRows.find(x => x.id !== row.id);
                      resolveConflict(row.id, otherRow.id);
                    }}
                  >
                    Keep this row
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Main spreadsheet inspector */}
      <Card className="glow-card">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" /> Staged CSV Inspector
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Nothing is saved to the ledger database until you commit below. Clicking a row shows its parsing breakdown.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={filterFlagged ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterFlagged(!filterFlagged)}
            >
              {filterFlagged ? "Showing Only Anomalies" : "Filter: All Rows"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setReport(null)}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reset upload
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 py-4 space-y-2.5">
            <SeverityBars error={sev.error} warning={sev.warning} info={sev.info} />
            <Legend
              items={[
                { label: `${sev.error} errors (skips)`, cls: "bg-foreground" },
                { label: `${sev.warning} warnings (policy adjustments)`, cls: "bg-muted-foreground" },
                { label: `${sev.info} info (normalizations)`, cls: "bg-muted-foreground/30" },
              ]}
            />
          </div>

          <div className="overflow-x-auto border-t border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">Row</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Split Mode</TableHead>
                  <TableHead>Action Recommendation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center w-24">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => {
                  const hasErr = r.anomalies.some((a) => a.severity === "error");
                  const hasWarn = r.anomalies.some((a) => a.severity === "warning");
                  const hasInfo = r.anomalies.some((a) => a.severity === "info");

                  let rowStyle = "cursor-pointer transition-colors hover:bg-muted/40";
                  if (hasErr) rowStyle += " bg-foreground/5 border-l-[3px] border-l-foreground";
                  else if (hasWarn) rowStyle += " bg-muted-foreground/5 border-l-[3px] border-l-muted-foreground";
                  else if (hasInfo) rowStyle += " bg-muted/10 border-l-[3px] border-l-muted";

                  return (
                    <TableRow
                      key={r.id}
                      className={rowStyle}
                      onClick={() => {
                        setSelectedRow(r);
                        setViewDetailsOpen(true);
                      }}
                    >
                      <TableCell className="text-center font-mono font-bold text-muted-foreground text-xs">{r.row_number}</TableCell>
                      <TableCell className="font-medium">
                        {r.raw.description || <span className="text-muted-foreground italic">(no description)</span>}
                      </TableCell>
                      <TableCell className="font-semibold">{r.raw.paid_by || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-mono">
                        {r.raw.amount} {r.raw.currency}
                      </TableCell>
                      <TableCell className="capitalize">
                        <Badge variant="outline" className="text-[10px] py-0">{r.raw.split_type || "Equal"}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold text-foreground">{r.action_label}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[r.status]}>{r.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setSelectedRow(r);
                            setViewDetailsOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {err && <div className="m-6 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div>}
          
          <div className="p-6 flex flex-wrap items-center gap-3 border-t border-border">
            <Button disabled={busy || pending > 0} onClick={() => commit(false)} className="shadow-sm">
              Commit approved rows
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => commit(true)}>
              Approve all &amp; commit
            </Button>
            {pending > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <HelpCircle className="h-4 w-4 text-yellow-500" />
                Decide the remaining {pending} pending row(s) before importing, or click "Approve all &amp; commit".
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Side-by-side Row Inspector Dialog */}
      <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-muted-foreground">CSV Line #{selectedRow?.row_number}</span>
              <Badge variant={selectedRow ? statusVariant[selectedRow.status] : "secondary"}>
                {selectedRow?.status.replace("_", " ")}
              </Badge>
            </div>
            <DialogTitle className="text-lg">Row Resolver details</DialogTitle>
            <DialogDescription>
              Inspecting parsed database mappings for this CSV row.
            </DialogDescription>
          </DialogHeader>

          {selectedRow && (
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-2 gap-4">
                {/* Left side: Raw CSV Data */}
                <div className="border border-border/80 rounded-xl p-3.5 bg-muted/10">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Raw CSV Data</div>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div><span className="text-muted-foreground font-sans">description:</span> "{selectedRow.raw.description}"</div>
                    <div><span className="text-muted-foreground font-sans">date:</span> {selectedRow.raw.date}</div>
                    <div><span className="text-muted-foreground font-sans">paid_by:</span> {selectedRow.raw.paid_by}</div>
                    <div><span className="text-muted-foreground font-sans">amount:</span> {selectedRow.raw.amount}</div>
                    <div><span className="text-muted-foreground font-sans">currency:</span> {selectedRow.raw.currency || "—"}</div>
                    <div><span className="text-muted-foreground font-sans">split_type:</span> {selectedRow.raw.split_type || "—"}</div>
                    <div><span className="text-muted-foreground font-sans">split_with:</span> {selectedRow.raw.split_with || "—"}</div>
                    <div><span className="text-muted-foreground font-sans">split_details:</span> {selectedRow.raw.split_details || "—"}</div>
                  </div>
                </div>

                {/* Right side: Proposed DB Change */}
                <div className="border border-border/80 rounded-xl p-3.5 bg-card">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Proposed DB Change</div>
                  <div className="space-y-1.5 text-xs">
                    <div><span className="text-muted-foreground">Description:</span> <span className="font-semibold">"{selectedRow.raw.description}"</span></div>
                    <div><span className="text-muted-foreground">Date parsed:</span> <span className="font-mono">{selectedRow.raw.date ? selectedRow.raw.date : "—"}</span></div>
                    <div><span className="text-muted-foreground">Payer resolved:</span> <span className="font-semibold">{selectedRow.raw.paid_by || "—"}</span></div>
                    <div>
                      <span className="text-muted-foreground">Amount (Base):</span>{" "}
                      <span className="font-mono font-bold">
                        {selectedRow.raw.amount} {selectedRow.raw.currency || group.base_currency}
                      </span>
                    </div>
                    <div><span className="text-muted-foreground">Split resolved:</span> <span className="capitalize font-semibold">{selectedRow.raw.split_type || "equal"}</span></div>
                  </div>
                </div>
              </div>

              {/* Anomaly reports list */}
              {selectedRow.anomalies.length > 0 && (
                <div className="border border-border/80 rounded-xl p-4 bg-muted/10 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /> Anomalies Logged for this row
                  </div>
                  <div className="space-y-2.5">
                    {selectedRow.anomalies.map((a, i) => (
                      <div key={i} className="flex flex-col gap-1 border-b border-border/40 pb-2 last:border-b-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={sevVariant[a.severity]} className="text-[9px] font-black uppercase py-0">{a.severity}</Badge>
                          <Badge variant="outline" className="text-[9px] py-0 font-mono">{a.code}</Badge>
                        </div>
                        <p className="text-xs text-foreground mt-0.5">{a.message}</p>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <ArrowRight className="h-3 w-3" /> <span className="font-semibold">Action:</span> {a.action_taken}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Individual row decision buttons */}
              {selectedRow.status === "needs_review" ? (
                <div className="flex gap-2.5 pt-2 border-t border-border">
                  <Button
                    className="flex-1 bg-primary text-primary-foreground"
                    onClick={() => {
                      decide(selectedRow.id, "approved");
                      setViewDetailsOpen(false);
                    }}
                  >
                    <Check className="h-4 w-4 mr-1.5" /> Approve Resolution
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      decide(selectedRow.id, "rejected");
                      setViewDetailsOpen(false);
                    }}
                  >
                    <X className="h-4 w-4 mr-1.5" /> Skip / Reject Row
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-center text-muted-foreground pt-2 border-t border-border">
                  Decision of <span className="font-bold">{selectedRow.status}</span> made. Click below to change decision:
                  <div className="flex justify-center gap-3 mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs font-bold"
                      onClick={() => decide(selectedRow.id, selectedRow.status === "approved" ? "rejected" : "approved")}
                    >
                      Change decision to {selectedRow.status === "approved" ? "Rejected" : "Approved"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
