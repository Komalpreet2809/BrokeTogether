import { useEffect, useState } from "react";
import api from "../api";
import { money } from "./charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Camera, ScanLine, Sparkles, AlertCircle, CheckCircle2,
  Utensils, Zap, Car, Tag
} from "lucide-react";

export default function Expenses({ group, onChange }) {
  const [expenses, setExpenses] = useState([]);
  const [open, setOpen] = useState(false);

  async function load() {
    const { data } = await api.get(`/expenses/?group=${group.id}`);
    setExpenses(data);
  }
  useEffect(() => { load(); }, [group.id]);

  async function remove(id) {
    if (!confirm("Delete this expense?")) return;
    await api.delete(`/expenses/${id}/`);
    load(); onChange?.();
  }

  // Description-based category resolver for table icons
  function getCategoryIcon(desc = "") {
    const d = desc.toLowerCase();
    if (d.includes("dinner") || d.includes("marina") || d.includes("thalassa") || d.includes("bites") || d.includes("groceries") || d.includes("food") || d.includes("pizza") || d.includes("lunch")) {
      return <Utensils className="h-4 w-4 text-cat-food" />;
    }
    if (d.includes("electricity") || d.includes("wifi") || d.includes("internet") || d.includes("power") || d.includes("water") || d.includes("gas") || d.includes("rent") || d.includes("deposit")) {
      return <Zap className="h-4 w-4 text-cat-bills" />;
    }
    if (d.includes("cab") || d.includes("taxi") || d.includes("uber") || d.includes("flight") || d.includes("trip") || d.includes("travel") || d.includes("parasailing")) {
      return <Car className="h-4 w-4 text-cat-travel" />;
    }
    return <Tag className="h-4 w-4 text-cat-others" />;
  }

  return (
    <Card className="glow-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-border mb-4">
        <div>
          <CardTitle>Expenses ({expenses.length})</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">List of all manually entered and CSV-imported expenses.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shadow-sm"><Plus className="mr-1 h-4 w-4" /> Add expense</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-1.5"><Sparkles className="h-5 w-5 text-primary" /> Add expense</DialogTitle>
            </DialogHeader>
            <AddExpense group={group} onAdded={() => { setOpen(false); load(); onChange?.(); }} />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Paid by</TableHead>
                <TableHead>Split Type</TableHead>
                <TableHead className="text-right">Amount (Base)</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    No expenses logged yet. Click "Add expense" or go to the "Import" tab to upload a CSV.
                  </TableCell>
                </TableRow>
              ) : (
                expenses.map((e) => (
                  <TableRow key={e.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{e.date}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="p-1.5 bg-muted/40 rounded-lg shrink-0">
                          {getCategoryIcon(e.description)}
                        </span>
                        <div>
                          <span className="font-semibold block">{e.description}</span>
                          {e.currency !== group.base_currency && (
                            <span className="text-[10px] text-muted-foreground block">
                              Original: {money(e.amount, e.currency)} (FX Rate: {e.fx_rate})
                            </span>
                          )}
                        </div>
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{e.paid_by_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize text-[10px]">{e.split_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {money(e.amount_base, group.base_currency)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => remove(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function AddExpense({ group, onAdded }) {
  const members = group.members;
  const [f, setF] = useState({
    description: "", date: new Date().toISOString().slice(0, 10),
    paid_by: String(members[0]?.id), amount: "", currency: "INR", split_type: "equal", notes: "",
  });
  const [checked, setChecked] = useState(() => members.map((m) => m.id));
  const [values, setValues] = useState({});
  const [err, setErr] = useState("");

  // Receipt Scanner states
  const [scanning, setScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);

  const needsValue = f.split_type !== "equal";

  // Simulate receipt scanner OCR
  function handleScanReceipt() {
    setScanning(true);
    setScanSuccess(false);
    setTimeout(() => {
      setScanning(false);
      setScanSuccess(true);
      setF({
        description: "Dinner at Marina Bites",
        date: "2026-03-05",
        paid_by: String(members.find(m => m.name === "Aisha")?.id || members[0]?.id),
        amount: "2400",
        currency: "INR",
        split_type: "equal",
        notes: "Imported via mock receipt scan",
      });
      setChecked(members.map(m => m.id));
    }, 2200);
  }

  function toggle(id) {
    setChecked(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);
  }

  // --- Real-time split simulator logic ---
  function getLiveSplits() {
    const amt = Number(f.amount || 0);
    if (amt <= 0 || checked.length === 0) return [];
    
    if (f.split_type === "equal") {
      const share = amt / checked.length;
      return checked.map(id => ({
        name: members.find(m => m.id === id)?.name || "",
        share
      }));
    }
    
    if (f.split_type === "unequal") {
      return checked.map(id => ({
        name: members.find(m => m.id === id)?.name || "",
        share: Number(values[id] || 0)
      }));
    }
    
    if (f.split_type === "percentage") {
      return checked.map(id => {
        const pct = Number(values[id] || 0);
        return {
          name: members.find(m => m.id === id)?.name || "",
          share: (pct / 100) * amt,
          pct
        };
      });
    }

    if (f.split_type === "share") {
      const totalShares = checked.reduce((sum, id) => sum + Number(values[id] || 0), 0);
      return checked.map(id => {
        const val = Number(values[id] || 0);
        const share = totalShares > 0 ? (val / totalShares) * amt : 0;
        return {
          name: members.find(m => m.id === id)?.name || "",
          share,
          ratio: val
        };
      });
    }
    return [];
  }

  const liveSplits = getLiveSplits();
  const totalAllocated = liveSplits.reduce((sum, s) => sum + s.share, 0);
  const remainingAmount = Number(f.amount || 0) - totalAllocated;

  async function submit(e) {
    e.preventDefault();
    setErr("");
    
    // Form splits list
    const splits = checked.map((id) => ({ member: id, value: needsValue ? Number(values[id] || 0) : null }));
    
    // Validate split sum matching (unequal/percentage)
    if (f.split_type === "unequal" && Math.abs(remainingAmount) > 0.01) {
      setErr(`Amounts must sum exactly to ${money(f.amount, f.currency)}. You are off by ${money(remainingAmount, f.currency)}.`);
      return;
    }
    if (f.split_type === "percentage") {
      const sumPct = checked.reduce((sum, id) => sum + Number(values[id] || 0), 0);
      if (Math.abs(sumPct - 100) > 0.01) {
        setErr(`Percentages must sum exactly to 100%. Current sum: ${sumPct}%.`);
        return;
      }
    }

    try {
      await api.post("/expenses/", {
        group: group.id, description: f.description, date: f.date,
        paid_by: Number(f.paid_by), amount: f.amount, currency: f.currency,
        split_type: f.split_type, notes: f.notes, splits,
      });
      onAdded();
    } catch (e2) {
      setErr(JSON.stringify(e2.response?.data) || "Failed to create expense");
    }
  }

  return (
    <div className="space-y-4">
      {/* Mock Scanner display */}
      {scanning ? (
        <div className="border border-border/80 bg-muted/20 rounded-xl p-8 flex flex-col items-center justify-center relative overflow-hidden h-36">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-primary opacity-60 shadow-[0_0_8px_var(--primary)] animate-bounce" style={{ animationDuration: "1.8s" }} />
          <ScanLine className="h-8 w-8 text-primary animate-pulse" />
          <span className="text-xs font-bold mt-2 text-foreground">Scanning mock receipt OCR...</span>
          <span className="text-[9px] text-muted-foreground">Extracting description, amount, date & currency</span>
        </div>
      ) : scanSuccess ? (
        <div className="border border-pos/20 bg-pos-bg/10 rounded-xl p-3 flex items-center justify-between">
          <span className="text-xs text-pos font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Mock receipt scanned successfully! Fields autofilled.
          </span>
          <Button variant="ghost" size="xs" onClick={() => setScanSuccess(false)} className="h-6 text-[10px]">Dismiss</Button>
        </div>
      ) : (
        <div className="border border-border/80 rounded-xl p-4 bg-muted/10 flex items-center justify-between">
          <div className="text-xs text-muted-foreground max-w-[70%]">
            <span className="font-semibold text-foreground block">Have a receipt?</span>
            Test our mock scanner to instantly fill out the description, date, payer, and amounts.
          </div>
          <Button type="button" size="sm" onClick={handleScanReceipt} className="shadow-sm">
            <Camera className="h-4 w-4 mr-1.5" /> Scan mock receipt
          </Button>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 pt-1">
        <div className="grid grid-cols-2 gap-3.5">
          <div className="col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Electricity bill" required />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Paid by</Label>
            <Select value={f.paid_by} onValueChange={(v) => setF({ ...f, paid_by: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {members.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input type="number" step="0.01" value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" required />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR (₹)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Split type</Label>
            <Select value={f.split_type} onValueChange={(v) => setF({ ...f, split_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equal">Split Equally</SelectItem>
                <SelectItem value="unequal">Unequal (exact amounts)</SelectItem>
                <SelectItem value="percentage">Percentage (100% total)</SelectItem>
                <SelectItem value="share">Shares (ratio weights)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="flex justify-between items-center mb-1">
            <span>Participants list</span>
            {needsValue && (
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Enter {f.split_type} for each
              </span>
            )}
          </Label>
          <div className="mt-1 border border-border/80 rounded-xl p-3 bg-muted/10 grid gap-2">
            {members.map((m) => {
              const isChecked = checked.includes(m.id);
              return (
                <div key={m.id} className="flex items-center justify-between text-sm py-1 border-b border-border/20 last:border-0 last:pb-0">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" className="accent-foreground rounded"
                      checked={isChecked} onChange={() => toggle(m.id)} />
                    <span className={isChecked ? "font-semibold text-foreground" : "text-muted-foreground"}>
                      {m.name}
                    </span>
                  </label>
                  {needsValue && isChecked && (
                    <div className="flex items-center gap-1.5">
                      <Input className="h-7 w-20 text-xs font-mono font-bold text-right py-0 pr-1.5" type="number" step="0.01"
                        placeholder="0"
                        value={values[m.id] || ""} onChange={(e) => setValues({ ...values, [m.id]: e.target.value })} />
                      <span className="text-[10px] text-muted-foreground uppercase font-bold w-6">
                        {f.split_type === "percentage" ? "%" : f.split_type === "share" ? "w." : f.currency}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Real-time split simulator card */}
        {Number(f.amount || 0) > 0 && checked.length > 0 && (
          <div className="border border-border/80 rounded-xl p-3.5 bg-card space-y-2.5">
            <div className="flex justify-between items-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <span>Split Simulator Preview</span>
              {f.split_type === "unequal" && (
                <span className={remainingAmount === 0 ? "text-pos bg-pos-bg/25 px-1.5 py-0.5 rounded" : "text-neg bg-neg-bg/25 px-1.5 py-0.5 rounded"}>
                  {remainingAmount === 0 ? "Fully Allocated" : `Remaining: ${money(remainingAmount, f.currency)}`}
                </span>
              )}
            </div>
            
            <div className="grid gap-2 grid-cols-2">
              {liveSplits.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs border border-border/40 p-2 rounded-lg bg-muted/20">
                  <span className="font-semibold truncate max-w-[80px]">{item.name}</span>
                  <div className="text-right">
                    <span className="font-bold tabular-nums block">{money(item.share, f.currency, true)}</span>
                    {item.pct !== undefined && <span className="text-[9px] text-muted-foreground block">{item.pct}%</span>}
                    {item.ratio !== undefined && <span className="text-[9px] text-muted-foreground block">wt. {item.ratio}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}
        
        <Button type="submit" className="w-full shadow-sm" disabled={scanning}>
          Save expense record
        </Button>
      </form>
    </div>
  );
}
