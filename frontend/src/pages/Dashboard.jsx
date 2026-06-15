import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../auth";
import Balances from "../components/Balances";
import Expenses from "../components/Expenses";
import Members from "../components/Members";
import ImportWizard from "../components/ImportWizard";
import Ask from "../components/Ask";
import { Initial } from "../components/charts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown, LogOut, Plus, LayoutDashboard, Receipt, Users, Upload, Sparkles, Sun, Moon,
} from "lucide-react";

const TABS = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Expenses", icon: Receipt },
  { label: "Members", icon: Users },
  { label: "Import", icon: Upload },
  { label: "Ask AI", icon: Sparkles },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem("theme");
    return stored ? stored === "dark" : true; // default to dark mode
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  async function loadGroups() {
    const { data } = await api.get("/groups/");
    setGroups(data);
    if (data.length && !groupId) setGroupId(data[0].id);
  }
  useEffect(() => { loadGroups(); }, []);

  const group = groups.find((g) => g.id === groupId);
  const bump = () => setRefreshKey((k) => k + 1);

  async function createGroup() {
    const name = prompt("New group name?");
    if (!name) return;
    const { data } = await api.post("/groups/", { name, base_currency: "INR" });
    await loadGroups();
    setGroupId(data.id);
  }

  return (
    <div className="min-h-screen transition-colors duration-200">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-5 py-3 backdrop-blur">
        <div className="text-lg font-extrabold tracking-tight flex items-center gap-2">
          <img src="/favicon.png" alt="BrokeTogether Logo" className="h-6 w-6 rounded-md" />
          <span>Broke<span className="text-muted-foreground">Together</span></span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-full h-8 w-8 text-muted-foreground hover:text-foreground"
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full border border-border bg-card px-1 py-1 pr-3 text-sm font-medium transition-all duration-200 hover:bg-muted hover:scale-102 cursor-pointer shadow-sm">
                <Initial name={user?.username} size={24} />
                {user?.username}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{user?.username}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={createGroup}>
              <Plus className="mr-2 h-4 w-4" /> New group
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-6">
        {!group ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="mb-4">No groups yet.</p>
            <Button onClick={createGroup}>Create your first group</Button>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 text-2xl font-extrabold tracking-tight hover:opacity-80">
                    {group.name}
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel>Switch group</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {groups.map((g) => (
                    <DropdownMenuItem key={g.id} onClick={() => setGroupId(g.id)}>
                      {g.name}
                      {g.id === groupId && <span className="ml-auto text-muted-foreground">✓</span>}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={createGroup}>
                    <Plus className="mr-2 h-4 w-4" /> New group
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {group.member_count} members · base {group.base_currency}
              </span>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="mt-5">
              <TabsList>
                {TABS.map(({ label, icon: Icon }) => (
                  <TabsTrigger key={label} value={label}>
                    <Icon className="h-4 w-4" /> {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="mt-5">
              {tab === "Overview" && <Balances groupId={group.id} group={group} key={`b${refreshKey}`} />}
              {tab === "Expenses" && <Expenses group={group} onChange={bump} key={`e${refreshKey}`} />}
              {tab === "Members" && (
                <Members group={group} onChange={() => { loadGroups(); bump(); }} key={`m${refreshKey}`} />
              )}
              {tab === "Import" && (
                <ImportWizard group={group} onCommitted={() => { bump(); setTab("Overview"); }} />
              )}
              {tab === "Ask AI" && <Ask groupId={group.id} key={`a${refreshKey}`} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
