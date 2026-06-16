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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronDown, LogOut, Plus, LayoutDashboard, Receipt, Users, Upload, Bot, Sun, Moon, Loader2,
} from "lucide-react";

const TABS = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Expenses", icon: Receipt },
  { label: "Members", icon: Users },
  { label: "Import", icon: Upload },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBrokie, setShowBrokie] = useState(false);
  
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [loading, setLoading] = useState(true);

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
    try {
      setLoading(true);
      const { data } = await api.get("/groups/");
      setGroups(data);
      if (data.length && !groupId) setGroupId(data[0].id);
    } catch (err) {
      console.error("Failed to load groups:", err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadGroups(); }, []);

  const group = groups.find((g) => g.id === groupId);
  const bump = () => setRefreshKey((k) => k + 1);

  async function handleCreateGroup(e) {
    if (e) e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const { data } = await api.post("/groups/", { name, base_currency: "INR" });
      await loadGroups();
      setGroupId(data.id);
      setShowNewGroupModal(false);
      setNewGroupName("");
    } catch (err) {
      alert("Failed to create group. Please try again.");
    } finally {
      setCreatingGroup(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[radial-gradient(900px_500px_at_50%_-10%,rgba(255,255,255,0.05),transparent_70%)]">
        <div className="flex flex-col items-center gap-4 text-center max-w-xs px-4">
          <div className="relative flex items-center justify-center">
            {/* Outer glowing ring */}
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl w-12 h-12 animate-pulse" />
            <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
          </div>
          <div className="space-y-1.5 mt-2">
            <h3 className="font-bold text-foreground text-base tracking-tight">Waking up server</h3>
            <p className="text-xs text-muted-foreground leading-normal">
              Our free-tier server takes about 50 seconds to boot on first request. Thanks for waiting!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-colors duration-200 pt-3">
      <header className="sticky top-3 z-30 mx-4 max-w-5xl xl:mx-auto flex items-center justify-between border border-border bg-card/65 px-5 py-2.5 backdrop-blur-md rounded-2xl shadow-sm transition-all duration-300">
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
              <button className="rounded-full overflow-hidden hover:scale-105 transition-all duration-200 cursor-pointer shadow-sm border border-border bg-card shrink-0">
                <Initial name={user?.username} size={28} />
              </button>
            </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-xl border border-border bg-card shadow-lg z-50">
            <DropdownMenuLabel className="px-2.5 py-2 font-normal">
              <div className="flex items-center gap-2.5">
                <Initial name={user?.username} size={32} />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-foreground truncate">{user?.username}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{user?.email || "Signed in"}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            
            <DropdownMenuSeparator className="my-1.5" />
            
            <DropdownMenuItem onClick={() => { setNewGroupName(""); setShowNewGroupModal(true); }} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm cursor-pointer hover:bg-muted focus:bg-muted transition-colors">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">New group</span>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator className="my-1.5" />
            
            <DropdownMenuItem 
              onClick={logout} 
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 focus:bg-destructive/10 hover:text-destructive focus:text-destructive cursor-pointer transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="font-semibold">Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-32 pt-6">
        {!group ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="mb-4">No groups yet.</p>
            <Button onClick={() => { setNewGroupName(""); setShowNewGroupModal(true); }}>Create your first group</Button>
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
                <DropdownMenuContent align="start" className="w-56 p-1.5 rounded-xl border border-border bg-card shadow-lg z-50">
                  <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Switch group</DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-1" />
                  {groups.map((g) => {
                    const isActive = g.id === groupId;
                    return (
                      <DropdownMenuItem 
                        key={g.id} 
                        onClick={() => setGroupId(g.id)}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                          isActive 
                            ? "bg-muted font-bold text-foreground" 
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60 focus:bg-muted/60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>{g.name}</span>
                        </div>
                        {isActive && <span className="text-foreground font-black text-xs">✓</span>}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator className="my-1.5" />
                  <DropdownMenuItem 
                    onClick={() => { setNewGroupName(""); setShowNewGroupModal(true); }}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-semibold text-foreground cursor-pointer hover:bg-muted focus:bg-muted transition-colors"
                  >
                    <Plus className="h-4 w-4 text-muted-foreground" />
                    <span>New group</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {group.member_count} members · base {group.base_currency}
              </span>
            </div>

            <div className="mt-5">
              {tab === "Overview" && <Balances groupId={group.id} group={group} key={`b${refreshKey}`} />}
              {tab === "Expenses" && <Expenses group={group} onChange={bump} key={`e${refreshKey}`} />}
              {tab === "Members" && (
                <Members group={group} onChange={() => { loadGroups(); bump(); }} key={`m${refreshKey}`} />
              )}
              {tab === "Import" && (
                <ImportWizard group={group} onCommitted={() => { bump(); setTab("Overview"); }} />
              )}
            </div>

            {/* Flying Dock at the bottom center of the screen */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
              <div className="flex items-center gap-2.5 bg-card/65 backdrop-blur-lg border border-border p-2 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                {TABS.map(({ label, icon: Icon }) => {
                  const isActive = tab === label;
                  return (
                    <button
                      key={label}
                      onClick={() => setTab(label)}
                      className={`group relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 cursor-pointer ${
                        isActive
                          ? "bg-foreground text-background border-transparent scale-108 shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
                          : "bg-transparent border border-border/20 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-105"
                      }`}
                    >
                      {/* Icon */}
                      <Icon className={`h-5 w-5 transition-transform duration-300 ${isActive ? "scale-105" : "group-hover:scale-105"}`} />

                      {/* Tooltip */}
                      <span className="absolute -top-10 scale-0 group-hover:scale-100 transition-all duration-200 bg-foreground text-background px-2.5 py-1 rounded-md text-[10px] font-bold shadow-md whitespace-nowrap pointer-events-none">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Floating Brokie Assistant */}
            <div className="fixed bottom-6 right-4 sm:right-6 z-50 flex flex-col items-end gap-3 select-none">
              {showBrokie && (
                <div className="w-[300px] xs:w-[340px] sm:w-[380px] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.3)] animate-fadeIn">
                  <Ask groupId={group.id} key={`a${refreshKey}`} onClose={() => setShowBrokie(false)} />
                </div>
              )}
              <button
                onClick={() => setShowBrokie(!showBrokie)}
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.3)] border border-border/50 transition-all duration-300 cursor-pointer hover:scale-105 ${
                  showBrokie 
                    ? "bg-foreground text-background" 
                    : "bg-card text-foreground hover:bg-muted"
                }`}
                title={showBrokie ? "Close Brokie" : "Chat with Brokie"}
              >
                <Bot className={`h-5 w-5 ${showBrokie ? "" : "animate-pulse"}`} />
              </button>
            </div>
          </>
        )}
      </main>

      <Dialog open={showNewGroupModal} onOpenChange={setShowNewGroupModal}>
        <DialogContent className="max-w-md p-6 rounded-2xl border border-border bg-card shadow-lg">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-bold">Create New Group</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">Set up a new shared expense space.</p>
          </DialogHeader>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="groupName" className="text-xs font-semibold">Group Name</Label>
              <Input
                id="groupName"
                placeholder="e.g. Goa Trip 2026, Flat 4B"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
                disabled={creatingGroup}
                className="w-full text-sm bg-muted/20 border-border"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={creatingGroup}
                onClick={() => setShowNewGroupModal(false)}
                className="text-xs font-medium cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingGroup || !newGroupName.trim()}
                className="text-xs font-semibold shadow-sm cursor-pointer"
              >
                {creatingGroup ? "Creating..." : "Create Group"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
