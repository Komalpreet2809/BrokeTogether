import { useState } from "react";
import api from "../api";
import { Initial } from "./charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, ChevronDown, ChevronUp, Search, Calendar, Users, ShieldAlert } from "lucide-react";

function formatDate(dateStr) {
  if (!dateStr) return "Feb 1, 2026";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getTimelineStart(joinedOn) {
  if (!joinedOn) return 0;
  const start = new Date("2026-02-01").getTime();
  const end = new Date("2026-05-31").getTime();
  const current = new Date(joinedOn).getTime();
  const pct = ((current - start) / (end - start)) * 100;
  return Math.max(Math.min(pct, 100), 0);
}

function getTimelineWidth(joinedOn, leftOn) {
  const start = new Date("2026-02-01").getTime();
  const end = new Date("2026-05-31").getTime();
  
  const currentJoined = joinedOn ? new Date(joinedOn).getTime() : start;
  const currentLeft = leftOn ? new Date(leftOn).getTime() : end;
  
  const pct = ((currentLeft - currentJoined) / (end - start)) * 100;
  return Math.max(Math.min(pct, 100), 0);
}

export default function Members({ group, onChange }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", joined_on: "", left_on: "", is_guest: false });
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");

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

  const filteredMembers = group.members.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase())
  );
  
  const memberCount = group.members.filter(m => !m.is_guest).length;
  const guestCount = group.members.filter(m => m.is_guest).length;

  return (
    <Card className="glow-card">
      <CardHeader className="flex flex-col gap-4 pb-4 border-b border-border mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Members Directory
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Active periods determine expense sharing windows.
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex gap-2">
              <Badge variant="outline" className="text-[10px] font-mono font-bold">
                {memberCount} Members
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-mono font-bold">
                {guestCount} Guests
              </Badge>
            </div>
            
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="shadow-sm">
                  <Plus className="mr-1 h-4 w-4" /> Add member
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-1.5">
                    Add new member
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={add} className="space-y-4 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-name">Name</Label>
                    <Input
                      id="new-name"
                      placeholder="e.g. Priya"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-joined">Joined date</Label>
                      <Input
                        id="new-joined"
                        type="date"
                        value={form.joined_on}
                        onChange={(e) => setForm({ ...form, joined_on: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-left">Left date</Label>
                      <Input
                        id="new-left"
                        type="date"
                        value={form.left_on}
                        onChange={(e) => setForm({ ...form, left_on: e.target.value })}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold select-none cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-foreground rounded"
                      checked={form.is_guest}
                      onChange={(e) => setForm({ ...form, is_guest: e.target.checked })}
                    />
                    Guest status (does not establish standing balances)
                  </label>
                  <Button type="submit" className="w-full shadow-sm">
                    Add to group
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search filter input */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search group directory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </CardHeader>
      
      <CardContent className="p-0 px-6 pb-6">
        {filteredMembers.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border rounded-xl">
            <span className="text-muted-foreground text-sm">No members found matching "{search}"</span>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMembers.map((m) => {
              const isExpanded = expandedId === m.id;
              const hasDates = m.joined_on || m.left_on;
              
              return (
                <div 
                  key={m.id} 
                  className={`rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:shadow-md flex flex-col justify-between ${
                    isExpanded ? "ring-1 ring-foreground/20" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Initial name={m.name} size={36} />
                        <h4 className="font-extrabold text-sm text-foreground">{m.name}</h4>
                      </div>
                      <Badge variant={m.is_guest ? "secondary" : "default"} className="text-[9px] uppercase px-1.5 py-0.2">
                        {m.is_guest ? "guest" : "member"}
                      </Badge>
                    </div>

                    {/* Membership active timeline visualizer */}
                    <div className="mt-5 space-y-1.5">
                      <div className="flex items-center justify-between text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                        <span>Timeline Window</span>
                        <span className="font-mono text-foreground font-semibold">
                          {m.joined_on ? formatDate(m.joined_on) : "Full Period"}
                          {m.left_on && ` → ${formatDate(m.left_on)}`}
                        </span>
                      </div>
                      {/* Visual bar */}
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden relative">
                        <div
                          className="absolute h-full bg-foreground rounded-full transition-all duration-300"
                          style={{
                            left: `${getTimelineStart(m.joined_on)}%`,
                            width: `${getTimelineWidth(m.joined_on, m.left_on)}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    {/* Actions row */}
                    <div className="mt-4 flex justify-end gap-2 border-t border-border/30 pt-3">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setExpandedId(isExpanded ? null : m.id)}
                        className="h-7 text-xs font-semibold px-2 cursor-pointer hover:bg-muted"
                      >
                        {isExpanded ? (
                          <span className="flex items-center gap-1">Collapse <ChevronUp className="h-3.5 w-3.5" /></span>
                        ) : (
                          <span className="flex items-center gap-1">Adjust Period <ChevronDown className="h-3.5 w-3.5" /></span>
                        )}
                      </Button>
                    </div>

                    {/* Collapsible edit panel */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-dashed border-border/50 grid grid-cols-2 gap-3 animate-fadeIn">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground">Joined Date</Label>
                          <Input
                            type="date"
                            defaultValue={m.joined_on || ""}
                            onBlur={(e) => save(m, { joined_on: e.target.value || null })}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground">Left Date</Label>
                          <Input
                            type="date"
                            defaultValue={m.left_on || ""}
                            onBlur={(e) => save(m, { left_on: e.target.value || null })}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="col-span-2 pt-1 flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground">Membership Profile:</span>
                          <button
                            type="button"
                            onClick={() => save(m, { is_guest: !m.is_guest })}
                            className="font-bold underline text-foreground hover:text-muted-foreground cursor-pointer"
                          >
                            Make {m.is_guest ? "Standard Member" : "Temporary Guest"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
