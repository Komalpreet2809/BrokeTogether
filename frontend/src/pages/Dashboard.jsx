import { useEffect, useRef, useState } from "react";
import api from "../api";
import { useAuth } from "../auth";
import Balances from "../components/Balances";
import Expenses from "../components/Expenses";
import Members from "../components/Members";
import ImportWizard from "../components/ImportWizard";
import Ask from "../components/Ask";

const TABS = ["Balances", "Expenses", "Members", "Import CSV", "Ask AI"];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(null);
  const [tab, setTab] = useState("Balances");
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const groupMenuRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target)) setGroupMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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
    <>
      <div className="appbar">
        <div className="appbar-left">
          <div className="brand">Broke<span>Together</span></div>
        </div>
        <div className="appbar-right" ref={menuRef}>
          <button className="user-chip" onClick={() => setMenuOpen((o) => !o)}>
            <span className="avatar">{(user?.username || "?")[0].toUpperCase()}</span>
            {user?.username}
            <span className="caret">{menuOpen ? "▴" : "▾"}</span>
          </button>
          {menuOpen && (
            <div className="menu">
              <div className="menu-label">{user?.username}</div>
              <button className="menu-item" onClick={() => { setMenuOpen(false); logout(); }}>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="container">
        {!group ? (
          <div className="card">
            <p>No groups yet.</p>
            <button onClick={createGroup}>Create your first group</button>
          </div>
        ) : (
          <>
            <div className="between">
              <div className="group-switcher" ref={groupMenuRef}>
                <button className="group-title" onClick={() => setGroupMenuOpen((o) => !o)}>
                  {group.name}
                  <span className="caret">{groupMenuOpen ? "▴" : "▾"}</span>
                </button>
                {groupMenuOpen && (
                  <div className="menu">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        className={`menu-item ${g.id === groupId ? "active" : ""}`}
                        onClick={() => { setGroupId(g.id); setGroupMenuOpen(false); }}
                      >
                        {g.name}
                      </button>
                    ))}
                    <div className="menu-sep" />
                    <button className="menu-item" onClick={() => { setGroupMenuOpen(false); createGroup(); }}>
                      + New group
                    </button>
                  </div>
                )}
              </div>
              <span className="muted small">
                {group.member_count} members · base {group.base_currency}
              </span>
            </div>

            <div className="tabs">
              {TABS.map((t) => (
                <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>

            {tab === "Balances" && <Balances groupId={group.id} key={`b${refreshKey}`} />}
            {tab === "Expenses" && (
              <Expenses group={group} onChange={bump} key={`e${refreshKey}`} />
            )}
            {tab === "Members" && (
              <Members group={group} onChange={() => { loadGroups(); bump(); }} key={`m${refreshKey}`} />
            )}
            {tab === "Import CSV" && (
              <ImportWizard group={group} onCommitted={() => { bump(); setTab("Balances"); }} />
            )}
            {tab === "Ask AI" && <Ask groupId={group.id} key={`a${refreshKey}`} />}
          </>
        )}
      </div>
    </>
  );
}
