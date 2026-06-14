import { useEffect, useState } from "react";
import api from "../api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ColumnChart, HBar, Initial, NetBar, StatCard, money } from "./charts";
import { ArrowRight } from "lucide-react";

export default function Balances({ groupId }) {
  const [bal, setBal] = useState(null);
  const [stats, setStats] = useState(null);
  const [openMember, setOpenMember] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api.get(`/groups/${groupId}/balances`).then((r) => setBal(r.data));
    api.get(`/groups/${groupId}/stats`).then((r) => setStats(r.data));
  }, [groupId]);

  async function openDrill(b) {
    setOpenMember(b);
    setDetail(null);
    const { data } = await api.get(`/groups/${groupId}/members/${b.member_id}/breakdown`);
    setDetail(data);
  }

  if (!bal || !stats) return <div className="text-muted-foreground">Loading dashboard…</div>;
  const cur = bal.currency;
  const maxAbs = Math.max(...bal.balances.map((b) => Math.abs(b.net_minor)), 1);

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total spent" value={money(stats.total_spent, cur)} sub={`${stats.expense_count} expenses`} />
        <StatCard label="Avg expense" value={money(stats.avg_expense, cur)} />
        <StatCard label="Members" value={stats.member_count} sub={`${stats.settlement_count} settlements`} />
        <StatCard
          label="Biggest expense"
          value={stats.biggest ? money(stats.biggest.amount, cur) : "—"}
          sub={stats.biggest?.description}
        />
      </div>

      {/* Net balances */}
      <Card>
        <CardHeader>
          <CardTitle>Who owes whom</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bars left of center = owes the group · right = is owed. Click anyone to see the exact
            expenses behind their number.
          </p>
        </CardHeader>
        <CardContent className="space-y-0.5">
          {bal.balances.map((b) => (
            <NetBar
              key={b.member_id}
              name={b.name}
              netMinor={b.net_minor}
              netLabel={b.net}
              maxAbs={maxAbs}
              currency={cur}
              open={openMember?.member_id === b.member_id}
              onClick={() => openDrill(b)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Settle up */}
      <Card>
        <CardHeader>
          <CardTitle>Settle up</CardTitle>
          <p className="text-sm text-muted-foreground">The fewest payments that clear every debt.</p>
        </CardHeader>
        <CardContent>
          {bal.settle_up.length === 0 ? (
            <p className="font-medium">Everyone is settled up. 🎉</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {bal.settle_up.map((s, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <Initial name={s.from} size={26} />
                    <span className="text-sm font-medium">{s.from}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <Initial name={s.to} size={26} />
                    <span className="text-sm font-medium">{s.to}</span>
                  </div>
                  <span className="ml-auto font-bold tabular-nums">{money(s.amount, cur)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Spending over time</CardTitle></CardHeader>
          <CardContent>
            <ColumnChart data={stats.by_month} currency={cur} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top contributors</CardTitle>
            <p className="text-sm text-muted-foreground">Who has paid the most up front.</p>
          </CardHeader>
          <CardContent>
            {stats.by_payer.slice(0, 6).map((p) => (
              <HBar
                key={p.name}
                name={p.name}
                valueLabel={money(p.amount, cur)}
                pct={(p.amount_minor / stats.by_payer[0].amount_minor) * 100}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Drill-down dialog */}
      <Dialog open={!!openMember} onOpenChange={(o) => !o && setOpenMember(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Initial name={openMember?.name} size={28} /> {openMember?.name}
            </DialogTitle>
          </DialogHeader>
          {!detail ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : (
            <Drill detail={detail} cur={cur} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Drill({ detail, cur }) {
  const s = detail.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Paid" value={money(s.total_paid, cur)} />
        <StatCard label="Owed" value={money(s.total_owed, cur)} />
        <StatCard label="Net" value={money(s.net, cur)} />
      </div>
      <div>
        <div className="mb-1 text-sm font-semibold">Owes a share of</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead><TableHead>Expense</TableHead>
              <TableHead>Paid by</TableHead><TableHead className="text-right">Share</TableHead>
              <TableHead className="text-right">CSV row</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.owed.map((o, i) => (
              <TableRow key={i}>
                <TableCell className="text-muted-foreground">{o.date}</TableCell>
                <TableCell>{o.description}</TableCell>
                <TableCell>{o.paid_by}</TableCell>
                <TableCell className="text-right tabular-nums">{money(o.share, cur, true)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{o.source_row}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {detail.settlements.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-semibold">Settlements</div>
          {detail.settlements.map((x, i) => (
            <div key={i} className="text-sm text-muted-foreground">
              {x.direction} {money(x.amount, cur)} {x.direction === "paid" ? "to" : "from"} {x.counterparty} ({x.date})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
