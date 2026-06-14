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
import { Plus, Trash2 } from "lucide-react";

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Expenses ({expenses.length})</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add expense</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
            <AddExpense group={group} onAdded={() => { setOpen(false); load(); onChange?.(); }} />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead><TableHead>Description</TableHead>
              <TableHead>Paid by</TableHead><TableHead>Split</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.date}</TableCell>
                <TableCell>
                  {e.description}
                  {e.currency !== group.base_currency && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({money(e.amount, e.currency)})
                    </span>
                  )}
                </TableCell>
                <TableCell>{e.paid_by_name}</TableCell>
                <TableCell><Badge variant="secondary">{e.split_type}</Badge></TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(e.amount_base, group.base_currency)}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => remove(e.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
  const needsValue = f.split_type !== "equal";

  function toggle(id) {
    setChecked(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const splits = checked.map((id) => ({ member: id, value: needsValue ? Number(values[id] || 0) : null }));
    try {
      await api.post("/expenses/", {
        group: group.id, description: f.description, date: f.date,
        paid_by: Number(f.paid_by), amount: f.amount, currency: f.currency,
        split_type: f.split_type, notes: f.notes, splits,
      });
      onAdded();
    } catch (e2) {
      setErr(JSON.stringify(e2.response?.data) || "Failed");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Description</Label>
          <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required />
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
            onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="INR">INR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Split type</Label>
          <Select value={f.split_type} onValueChange={(v) => setF({ ...f, split_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="equal">Equal</SelectItem>
              <SelectItem value="unequal">Unequal (exact amounts)</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="share">Shares (ratio)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Participants {needsValue && <span className="text-muted-foreground">— enter {f.split_type} value each</span>}</Label>
        <div className="mt-1 flex flex-wrap gap-3">
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-white"
                checked={checked.includes(m.id)} onChange={() => toggle(m.id)} />
              {m.name}
              {needsValue && checked.includes(m.id) && (
                <Input className="h-7 w-20" type="number" step="0.01"
                  value={values[m.id] || ""} onChange={(e) => setValues({ ...values, [m.id]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
      </div>
      {err && <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">{err}</div>}
      <Button type="submit" className="w-full">Save expense</Button>
    </form>
  );
}
