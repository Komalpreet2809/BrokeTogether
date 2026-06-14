import { useState } from "react";
import api from "../api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

const SAMPLES = [
  "How much does Rohan owe in total?",
  "Who should pay Aisha and how much?",
  "Who owes the most money?",
];

export default function Ask({ groupId }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  async function ask(question) {
    const text = question ?? q;
    if (!text.trim()) return;
    setBusy(true); setRes(null);
    try {
      const { data } = await api.post(`/groups/${groupId}/ask`, { question: text });
      setRes(data);
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Ask about your balances
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Ask in plain English. The AI only reads your question and phrases the answer — every number
          comes from the app's exact balance calculation, not the model.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. How much does Priya owe?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
          />
          <Button disabled={busy} onClick={() => ask()}>{busy ? "…" : "Ask"}</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => { setQ(s); ask(s); }}>
              {s}
            </Button>
          ))}
        </div>

        {res && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="text-[15px]">{res.answer}</div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {res.ai_used ? (
                <>
                  <Badge variant="secondary">{res.model}</Badge>
                  numbers from the deterministic engine
                </>
              ) : (
                <Badge variant="outline">AI unavailable — raw facts shown</Badge>
              )}
            </div>
            {!res.ai_used && (
              <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs">
                {JSON.stringify(res.facts, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
