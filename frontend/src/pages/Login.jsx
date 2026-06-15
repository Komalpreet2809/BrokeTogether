import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "demo", email: "", password: "BrokeTogether2026!" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "login") await login(form.username, form.password);
      else await register(form.username, form.email, form.password);
      navigate("/");
    } catch (e2) {
      setErr(e2.response?.data?.detail || JSON.stringify(e2.response?.data) || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-5 bg-[radial-gradient(900px_500px_at_50%_-10%,rgba(255,255,255,0.05),transparent_70%)]">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <img src="/favicon.png" alt="BrokeTogether Logo" className="h-7 w-7 rounded-md" />
            <span>Broke<span className="text-muted-foreground">Together</span></span>
          </div>
          <div className="text-sm text-muted-foreground">
            Shared expenses for flatmates made simple.
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={form.username} onChange={set("username")} autoFocus />
            </div>
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={form.password} onChange={set("password")} />
            </div>
            {err && (
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">{err}</div>
            )}
            <Button type="submit" className="w-full cursor-wait" disabled={busy}>
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-background" />
                  <span>Waking up server (takes ~50s)...</span>
                </span>
              ) : mode === "login" ? (
                "Log in"
              ) : (
                "Create account"
              )}
            </Button>
          </form>
          <div className="mt-4 text-sm text-muted-foreground">
            {mode === "login" ? "New here? " : "Have an account? "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Register" : "Log in"}
            </button>
            <div className="mt-2">
              Demo account: <span className="font-semibold text-foreground">demo / BrokeTogether2026!</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
