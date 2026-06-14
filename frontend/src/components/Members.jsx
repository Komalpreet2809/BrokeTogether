import { useState } from "react";
import api from "../api";
import { Initial } from "./charts";
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
import { Plus } from "lucide-react";

export default function Members({ group, onChange }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", joined_on: "", left_on: "", is_guest: false });

  async function save(member, patch) {
    await api.patch(`/members/${member.id}/`, patch);
    onChange?.();
  }
  async function add(e) {
    e.preventDefault();
    await api.post("/members/", {
      group: group.id, name: form.name,
      joined_on: form.joined_on || null, left_on: form.left_on || null, is_guest: form.is_guest,
    });
    setForm({ name: "", joined_on: "", left_on: "", is_guest: false });
    setOpen(false);
    onChange?.();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Members</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Membership is time-bound — a member only shares expenses dated within their window.
            March electricity never touches Sam; April groceries never touch Meera.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add member</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Add member</DialogTitle></DialogHeader>
            <form onSubmit={add} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Joined on</Label>
                  <Input type="date" value={form.joined_on}
                    onChange={(e) => setForm({ ...form, joined_on: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Left on</Label>
                  <Input type="date" value={form.left_on}
                    onChange={(e) => setForm({ ...form, left_on: e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-white" checked={form.is_guest}
                  onChange={(e) => setForm({ ...form, is_guest: e.target.checked })} />
                Guest (not a standing member)
              </label>
              <Button type="submit" className="w-full">Add</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead><TableHead>Joined</TableHead>
              <TableHead>Left</TableHead><TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Initial name={m.name} size={24} /> {m.name}
                  </span>
                </TableCell>
                <TableCell>
                  <Input className="h-8 w-40" type="date" defaultValue={m.joined_on || ""}
                    onBlur={(e) => save(m, { joined_on: e.target.value || null })} />
                </TableCell>
                <TableCell>
                  <Input className="h-8 w-40" type="date" defaultValue={m.left_on || ""}
                    onBlur={(e) => save(m, { left_on: e.target.value || null })} />
                </TableCell>
                <TableCell>
                  {m.is_guest ? <Badge variant="secondary">guest</Badge> : <Badge>member</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
