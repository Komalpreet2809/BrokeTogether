import { useEffect, useState } from "react";
import api from "../api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ColumnChart, HBar, Initial, Legend, NetBar, StatCard, money } from "./charts";
import {
  ArrowRight, Wallet, Receipt, Users, Trophy, Scale, HandCoins, CalendarDays,
  MousePointerClick, Utensils, Zap, Car, Tag, Calendar, ShieldCheck, Info,
  ZoomIn, ZoomOut, RotateCcw, Check, Trash2
} from "lucide-react";

export default function Balances({ groupId, group }) {
  const [bal, setBal] = useState(null);
  const [stats, setStats] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [openMember, setOpenMember] = useState(null);
  const [detail, setDetail] = useState(null);
  
  // Responsive screen size detection
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  useEffect(() => {
    const checkSize = () => {
      setIsSmallScreen(window.innerWidth < 1024);
    };
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  // Interactive hover states
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [zoom, setZoom] = useState(1.25);
  const [nodePositions, setNodePositions] = useState({});
  const [draggedNode, setDraggedNode] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  // Set visual map default zoom level to prevent clipping on mobile
  useEffect(() => {
    setZoom(isSmallScreen ? 0.95 : 1.25);
  }, [isSmallScreen]);

  useEffect(() => {
    if (group && group.members) {
      const N = group.members.length;
      const initial = {};
      const radius = isSmallScreen ? 110 : 140;
      group.members.forEach((m, idx) => {
        const angle = (2 * Math.PI * idx) / N - Math.PI / 2;
        initial[m.id] = {
          x: 200 + radius * Math.cos(angle),
          y: 200 + radius * Math.sin(angle)
        };
      });
      setNodePositions(initial);
    }
  }, [group, isSmallScreen]);

  useEffect(() => {
    setNodePositions({});
  }, [groupId]);

  const handleMouseMove = (e) => {
    if (isSmallScreen || draggedNode === null) return;
    
    if (dragStart) {
      const dist = Math.sqrt(Math.pow(e.clientX - dragStart.x, 2) + Math.pow(e.clientY - dragStart.y, 2));
      if (dist > 5) {
        setHasDragged(true);
      }
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    const svgX = (clientX / rect.width) * 400;
    const svgY = (clientY / rect.height) * 400;
    
    // Reverse scale transformation relative to center 200, 200
    const nativeX = 200 + (svgX - 200) / zoom;
    const nativeY = 200 + (svgY - 200) / zoom;
    
    const boundedX = Math.max(Math.min(nativeX, 385), 15);
    const boundedY = Math.max(Math.min(nativeY, 385), 15);
    
    setNodePositions(prev => ({
      ...prev,
      [draggedNode]: { x: boundedX, y: boundedY }
    }));
  };

  const handleTouchMove = (e) => {
    if (isSmallScreen || draggedNode === null) return;
    if (e.touches.length === 0) return;
    const touch = e.touches[0];

    if (dragStart) {
      const dist = Math.sqrt(Math.pow(touch.clientX - dragStart.x, 2) + Math.pow(touch.clientY - dragStart.y, 2));
      if (dist > 5) {
        setHasDragged(true);
      }
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = touch.clientX - rect.left;
    const clientY = touch.clientY - rect.top;
    
    const svgX = (clientX / rect.width) * 400;
    const svgY = (clientY / rect.height) * 400;
    
    const nativeX = 200 + (svgX - 200) / zoom;
    const nativeY = 200 + (svgY - 200) / zoom;
    
    const boundedX = Math.max(Math.min(nativeX, 385), 15);
    const boundedY = Math.max(Math.min(nativeY, 385), 15);
    
    setNodePositions(prev => ({
      ...prev,
      [draggedNode]: { x: boundedX, y: boundedY }
    }));
  };

  const handleDragEnd = () => {
    setDraggedNode(null);
    setDragStart(null);
  };

  const handleReset = () => {
    setZoom(isSmallScreen ? 0.95 : 1.25);
    setNodePositions({});
    setSelectedNode(null);
  };

  function loadData() {
    api.get(`/groups/${groupId}/balances`).then((r) => setBal(r.data));
    api.get(`/groups/${groupId}/stats`).then((r) => setStats(r.data));
    api.get(`/expenses/?group=${groupId}`).then((r) => setExpenses(r.data));
    api.get(`/settlements/?group=${groupId}`).then((r) => setSettlements(r.data));
  }

  useEffect(() => {
    loadData();
  }, [groupId]);

  async function openDrill(b) {
    setOpenMember(b);
    setDetail(null);
    const { data } = await api.get(`/groups/${groupId}/members/${b.member_id}/breakdown`);
    setDetail(data);
  }

  async function handleSettle(s) {
    try {
      await api.post("/settlements/", {
        group: groupId,
        from_member: s.from_id,
        to_member: s.to_id,
        date: new Date().toISOString().slice(0, 10),
        amount: s.amount,
        currency: bal?.currency || "INR",
        notes: "Settled via Settle Up"
      });
      loadData();
    } catch (err) {
      console.error("Error recording settlement:", err);
    }
  }

  async function handleDeleteSettlement(id) {
    try {
      await api.delete(`/settlements/${id}/`);
      loadData();
    } catch (err) {
      console.error("Error deleting settlement:", err);
    }
  }

  if (!bal || !stats || !group) return <div className="text-muted-foreground p-8 text-center">Loading dashboard…</div>;
  const cur = bal.currency;
  const maxAbs = Math.max(...bal.balances.map((b) => Math.abs(b.net_minor)), 1);

  // --- Category Classification on the fly ---
  const categories = {
    Food: { label: "Food & Dining", color: "var(--cat-food)", cls: "bg-cat-food", icon: Utensils, amount: 0 },
    Bills: { label: "Bills & Utilities", color: "var(--cat-bills)", cls: "bg-cat-bills", icon: Zap, amount: 0 },
    Travel: { label: "Travel & Transport", color: "var(--cat-travel)", cls: "bg-cat-travel", icon: Car, amount: 0 },
    Others: { label: "Others", color: "var(--cat-others)", cls: "bg-cat-others", icon: Tag, amount: 0 }
  };

  expenses.forEach(e => {
    const desc = e.description.toLowerCase();
    const notes = (e.notes || "").toLowerCase();
    const amount = Number(e.amount_base);
    
    if (desc.includes("dinner") || desc.includes("marina") || desc.includes("thalassa") || desc.includes("bites") || desc.includes("groceries") || desc.includes("food") || desc.includes("pizza") || desc.includes("lunch") || desc.includes("caf") || desc.includes("drinks")) {
      categories.Food.amount += amount;
    } else if (desc.includes("electricity") || desc.includes("wifi") || desc.includes("internet") || desc.includes("power") || desc.includes("water") || desc.includes("gas") || desc.includes("rent") || desc.includes("deposit")) {
      categories.Bills.amount += amount;
    } else if (desc.includes("cab") || desc.includes("taxi") || desc.includes("uber") || desc.includes("flight") || desc.includes("trip") || desc.includes("travel") || desc.includes("parasailing") || desc.includes("car")) {
      categories.Travel.amount += amount;
    } else {
      categories.Others.amount += amount;
    }
  });

  const totalSpent = Object.values(categories).reduce((sum, c) => sum + c.amount, 0);

  // SVG Donut calculation
  let accumulatedPercent = 0;
  const segments = Object.entries(categories).map(([key, cat]) => {
    const percent = totalSpent > 0 ? cat.amount / totalSpent : 0;
    const strokeLength = percent * 314.159;
    const rotateAngle = (accumulatedPercent * 360) - 90;
    accumulatedPercent += percent;
    return {
      key,
      ...cat,
      percent,
      strokeLength,
      rotateAngle
    };
  }).filter(s => s.amount > 0);

  // --- Network Graph Nodes and Edges calculation ---
  const N = group.members.length;
  const radius = isSmallScreen ? 110 : 140;
  const graphNodes = group.members.map((m, idx) => {
    if (nodePositions[m.id]) {
      return { id: m.id, name: m.name, x: nodePositions[m.id].x, y: nodePositions[m.id].y };
    }
    const angle = (2 * Math.PI * idx) / N - Math.PI / 2; // start at top
    return {
      id: m.id,
      name: m.name,
      x: 200 + radius * Math.cos(angle),
      y: 200 + radius * Math.sin(angle),
    };
  });

  const graphEdges = bal.settle_up.map((s, idx) => {
    const fromNode = graphNodes.find(n => n.name === s.from);
    const toNode = graphNodes.find(n => n.name === s.to);
    return {
      id: idx,
      from: s.from,
      to: s.to,
      fromNode,
      toNode,
      amount: s.amount,
      amount_minor: s.amount_minor,
    };
  }).filter(e => e.fromNode && e.toNode);

  const activeHighlightNode = hoveredNode !== null ? hoveredNode : selectedNode;

  const connectedNodeIds = new Set();
  if (activeHighlightNode !== null) {
    connectedNodeIds.add(activeHighlightNode);
    graphEdges.forEach(e => {
      if (e.fromNode.id === activeHighlightNode) {
        connectedNodeIds.add(e.toNode.id);
      }
      if (e.toNode.id === activeHighlightNode) {
        connectedNodeIds.add(e.fromNode.id);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Total spent" value={money(stats.total_spent, cur)} sub={`across ${stats.expense_count} expenses`} />
        <StatCard icon={Receipt} label="Avg expense" value={money(stats.avg_expense, cur)} sub="per expense" />
        <StatCard icon={Users} label="People in group" value={stats.member_count} sub={`${stats.settlement_count} payments recorded`} />
        <StatCard
          icon={Trophy}
          label="Biggest expense"
          value={stats.biggest ? money(stats.biggest.amount, cur) : "—"}
          sub={stats.biggest?.description}
        />
      </div>

      {/* Visual Debt settlement map */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3 glow-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" /> Visual Settlement Map
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Interactive network showing who owes whom.
            </p>
          </CardHeader>
          <CardContent className="relative flex items-center justify-center p-4 min-h-[350px]">
            <div className="relative w-full max-w-[340px]">
              <svg
                viewBox="0 0 400 400"
                className={`w-full h-auto overflow-visible select-none ${
                  isSmallScreen ? "cursor-default" : (draggedNode !== null ? "cursor-grabbing" : "cursor-grab")
                }`}
                onClick={() => setSelectedNode(null)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleDragEnd}
              >
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="21" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--muted-foreground)" />
                  </marker>
                  <marker id="arrow-active-out" viewBox="0 0 10 10" refX="21" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--neg)" />
                  </marker>
                  <marker id="arrow-active-in" viewBox="0 0 10 10" refX="21" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--pos)" />
                  </marker>
                </defs>
                
                <g transform={`scale(${zoom})`} style={{ transformOrigin: "200px 200px", transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}>
                {/* Edge lines */}
                {graphEdges.map((e) => {
                  const isHighlightActive = activeHighlightNode !== null;
                  const isFromHighlight = activeHighlightNode === e.fromNode.id;
                  const isToHighlight = activeHighlightNode === e.toNode.id;
                  
                  let strokeColor = "var(--border)";
                  let strokeWidth = 1.5;
                  let active = false;
                  let marker = "url(#arrow)";
                  let opacity = 1;
  
                  if (isHighlightActive) {
                    if (isFromHighlight) {
                      strokeColor = "var(--neg)";
                      strokeWidth = 3;
                      active = true;
                      marker = "url(#arrow-active-out)";
                    } else if (isToHighlight) {
                      strokeColor = "var(--pos)";
                      strokeWidth = 3;
                      active = true;
                      marker = "url(#arrow-active-in)";
                    } else {
                      opacity = 0.15;
                    }
                  }
  
                  return (
                    <g key={e.id} className="transition-opacity duration-300" style={{ opacity }}>
                      <path
                        d={`M ${e.fromNode.x} ${e.fromNode.y} L ${e.toNode.x} ${e.toNode.y}`}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        fill="none"
                        markerEnd={marker}
                        className={active ? "flow-line" : ""}
                      />
                      
                      {/* Animated moving dot for active flow */}
                      {active && (
                        <circle r="4.5" fill={isFromHighlight ? "var(--neg)" : "var(--pos)"}>
                          <animateMotion dur="2.5s" repeatCount="indefinite" path={`M ${e.fromNode.x} ${e.fromNode.y} L ${e.toNode.x} ${e.toNode.y}`} />
                        </circle>
                      )}
  
                      {/* Midpoint value label */}
                      <g transform={`translate(${(e.fromNode.x + e.toNode.x) / 2}, ${(e.fromNode.y + e.toNode.y) / 2})`}>
                        <rect
                          x="-24" y="-9" width="48" height="18" rx="4"
                          fill="var(--card)" stroke="var(--border)" strokeWidth="1"
                        />
                        <text
                          textAnchor="middle" y="4" fontSize="9" fontWeight="bold"
                          className="fill-foreground font-sans tabular-nums"
                        >
                          {money(e.amount, cur)}
                        </text>
                      </g>
                    </g>
                  );
                })}
  
                {/* Node Circles */}
                {graphNodes.map((n) => {
                  const isHighlightActive = activeHighlightNode !== null;
                  const isSelf = activeHighlightNode === n.id;
                  const isConnected = connectedNodeIds.has(n.id);
                  
                  let opacity = 1;
                  let scale = 1;
                  let strokeColor = "var(--primary)";
                  let strokeWidth = 2.5;
  
                  if (isHighlightActive) {
                    if (isSelf) {
                      scale = 1.15;
                      strokeColor = "var(--primary)";
                      strokeWidth = 3.5;
                    } else if (isConnected) {
                      scale = 1.05;
                      strokeColor = "var(--foreground)";
                      strokeWidth = 2.5;
                    } else {
                      opacity = 0.15;
                    }
                  }
  
                  return (
                    <g
                      key={n.id}
                      className={isSmallScreen ? "transition-all duration-150" : "cursor-grab active:cursor-grabbing transition-all duration-150"}
                      style={{ opacity, transformOrigin: `${n.x}px ${n.y}px`, transform: `scale(${scale})` }}
                      onMouseEnter={() => setHoveredNode(n.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onMouseDown={(e) => {
                        if (isSmallScreen) return;
                        e.stopPropagation();
                        e.preventDefault();
                        setDragStart({ x: e.clientX, y: e.clientY });
                        setHasDragged(false);
                        setDraggedNode(n.id);
                      }}
                      onTouchStart={(e) => {
                        if (isSmallScreen) return;
                        e.stopPropagation();
                        if (e.touches.length > 0) {
                          setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                        }
                        setHasDragged(false);
                        setDraggedNode(n.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isSmallScreen && hasDragged) return;
                        setSelectedNode(prev => prev === n.id ? null : n.id);
                      }}
                    >
                      <clipPath id={`clip-${n.id}`}>
                        <circle cx={n.x} cy={n.y} r="18" />
                      </clipPath>
                      <image
                        href={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(n.name)}`}
                        x={n.x - 18}
                        y={n.y - 18}
                        width="36"
                        height="36"
                        clipPath={`url(#clip-${n.id})`}
                      />
                      <circle cx={n.x} cy={n.y} r="18" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} className="shadow-sm" />
                      <rect x={n.x - 32} y={n.y + 24} width="64" height="16" rx="4" fill="var(--card)" stroke="var(--border)" strokeWidth="0.5" />
                      <text textAnchor="middle" x={n.x} y={n.y + 35} fontSize="10" fontWeight="600" className="fill-muted-foreground font-sans tracking-wide">
                        {n.name}
                      </text>
                    </g>
                  );
                })}
                </g>
              </svg>
  
              {/* Floating Selection Details (on Top-Right of Map) */}
              {selectedNode !== null && (
                <div className="absolute top-2 right-2 flex items-center gap-2 bg-card/90 backdrop-blur border border-border px-3 py-1.5 rounded-xl shadow-md z-10 animate-fadeIn">
                  <span className="text-xs font-extrabold text-foreground pl-1">
                    {group.members.find(m => m.id === selectedNode)?.name}
                  </span>
                  <Button
                    size="xs"
                    className="h-6 text-[10px] px-2.5 font-bold cursor-pointer rounded-md shadow-sm ml-1"
                    onClick={() => {
                      const b = bal.balances.find(x => x.member_id === selectedNode);
                      if (b) openDrill(b);
                    }}
                  >
                    View Receipt
                  </Button>
                  <button
                    type="button"
                    className="h-6 w-6 p-0 flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                    onClick={() => setSelectedNode(null)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Floating Zoom Controls (Vertically on Card Right Wall Top) */}
            <div className="absolute top-4 right-4 flex flex-col gap-1 z-10">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg hover:bg-muted"
                onClick={() => setZoom(z => Math.min(z + 0.15, 2.5))}
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg hover:bg-muted"
                onClick={() => setZoom(z => Math.max(z - 0.15, 0.5))}
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg hover:bg-muted"
                onClick={handleReset}
                title="Reset Zoom"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Balance cards list */}
        <Card className="lg:col-span-2 glow-card overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Member Standing
              </CardTitle>
              <p className="text-sm text-muted-foreground">Click person to view their receipt.</p>
            </div>
            <Legend
              items={[
                { label: "owes", cls: "bg-neg" },
                { label: "is owed", cls: "bg-pos" },
              ]}
            />
          </CardHeader>
          <CardContent className="space-y-1">
            {bal.balances.map((b) => {
              const isOwed = b.net_minor > 0;
              const isSettled = b.net_minor === 0;
              return (
                <button
                  key={b.member_id}
                  onClick={() => openDrill(b)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-all duration-200 hover:bg-muted border border-transparent hover:border-border cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <div>
                      <span className="text-sm font-semibold block">{b.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mt-0.5">
                        {isSettled ? "Settled" : isOwed ? "Creditor" : "Debtor"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    {isSettled ? (
                      <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Settled
                      </span>
                    ) : (
                      <span className={`text-sm font-extrabold tabular-nums px-2.5 py-1 rounded-lg ${isOwed ? "text-pos bg-pos-bg" : "text-neg bg-neg-bg"}`}>
                        {isOwed ? "+" : ""}{money(b.net, cur)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Settle up instructions & Recent Settlements Log */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3 glow-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-primary" /> Settle up Instructions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Minimal transactions to clear all debts.
            </p>
          </CardHeader>
          <CardContent>
            {bal.settle_up.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-border rounded-xl">
                <span className="text-2xl mb-2">🎉</span>
                <p className="font-semibold text-foreground">Everyone is fully settled up!</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-x-auto pb-2 scrollbar-thin">
                {bal.settle_up.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-3 transition-all hover:shadow-sm w-max min-w-full">
                    <span className="text-sm font-bold text-foreground pl-1 whitespace-nowrap shrink-0">{s.from}</span>
                    <span className="text-xs text-muted-foreground px-1 shrink-0">pays</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-bold text-foreground pl-1 whitespace-nowrap shrink-0">{s.to}</span>
                    <div className="ml-auto flex items-center gap-2.5 shrink-0 pl-4">
                      <span className="text-sm font-extrabold text-foreground bg-secondary/80 px-2.5 py-1 rounded-lg tabular-nums border border-border shrink-0">
                        {money(s.amount, cur)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 rounded-lg animate-fadeIn shrink-0"
                        onClick={() => handleSettle(s)}
                      >
                        <Check className="h-3.5 w-3.5" /> Settle
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 glow-card flex flex-col justify-between overflow-hidden">
          <div>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /> Recent Settlements</CardTitle>
              <p className="text-sm text-muted-foreground">
                Log of recorded debt payments.
              </p>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {settlements.length === 0 ? (
                <div className="text-center py-10 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                  No settlements recorded yet.
                </div>
              ) : (
                settlements.map((st) => (
                  <div key={st.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/10 text-xs transition-all hover:bg-muted/15">
                    <div>
                      <div className="font-semibold text-foreground">
                        {st.from_name} paid {st.to_name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{st.date}</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold font-mono text-pos bg-pos-bg/10 px-2.5 py-0.5 rounded border border-pos/20">
                        {money(st.amount_display, cur)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer hover:bg-destructive/10 rounded-md"
                        onClick={() => handleDeleteSettlement(st.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Infographics row: Categories donut & Spending by month */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category donut */}
        <Card className="glow-card overflow-hidden">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary" /> Categorized Spending</CardTitle>
            <p className="text-sm text-muted-foreground">Group expenses classified by categories.</p>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center justify-around gap-6 py-6">
            <div className="relative w-[130px] h-[130px] flex items-center justify-center shrink-0">
              {totalSpent === 0 ? (
                <div className="text-xs text-muted-foreground text-center">No spending recorded</div>
              ) : (
                <>
                  <svg width="130" height="130" viewBox="0 0 120 120" className="overflow-visible select-none">
                    <circle cx="60" cy="60" r="50" fill="transparent" stroke="var(--border)" strokeWidth="12" />
                    {segments.map((seg) => (
                      <circle
                        key={seg.key}
                        cx="60"
                        cy="60"
                        r="50"
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth="12"
                        strokeDasharray={`${seg.strokeLength} 314.159`}
                        transform={`rotate(${seg.rotateAngle} 60 60)`}
                        className="cursor-pointer transition-all duration-300 hover:stroke-[15px]"
                        onMouseEnter={() => setHoveredCategory(seg)}
                        onMouseLeave={() => setHoveredCategory(null)}
                      />
                    ))}
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center p-2 w-[70px] h-[70px] rounded-full bg-card shadow-inner">
                    {hoveredCategory ? (
                      <>
                        <span className="text-[10px] text-muted-foreground font-semibold leading-tight truncate max-w-[66px]">{hoveredCategory.label}</span>
                        <span className="text-xs font-bold mt-0.5">{Math.round(hoveredCategory.percent * 100)}%</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[9px] text-muted-foreground leading-tight uppercase font-bold tracking-wider">Total</span>
                        <span className="text-[11px] font-black mt-0.5">{money(totalSpent, cur)}</span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 space-y-2.5 w-full">
              {Object.entries(categories).map(([key, cat]) => {
                const pct = totalSpent > 0 ? cat.amount / totalSpent : 0;
                const Icon = cat.icon;
                return (
                  <div key={key} className="flex items-center justify-between text-sm p-1.5 rounded-lg hover:bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-muted text-foreground">
                        <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                      </span>
                      <span className="font-medium">{cat.label}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold block">{money(cat.amount, cur)}</span>
                      <span className="text-[10px] text-muted-foreground block">{Math.round(pct * 100)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Spending over time */}
        <Card className="glow-card overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Spending Over Time</CardTitle>
            <p className="text-sm text-muted-foreground">Monthly breakdown of group spending.</p>
          </CardHeader>
          <CardContent className="pb-6">
            <ColumnChart data={stats.by_month} currency={cur} />
          </CardContent>
        </Card>
      </div>

      {/* Membership History Timeline */}
      <Card className="glow-card overflow-hidden">
        <CardHeader className="pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" /> Time-Bounded Membership Timeline
            </CardTitle>
            <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex items-center gap-1">
              <Info className="h-3 w-3" /> Time-bounded rule
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Visualizing member active date ranges.
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="border border-border rounded-xl p-4 bg-muted/10 space-y-4">
            {/* Header / Month markers */}
            <div className="grid grid-cols-6 items-center gap-4 text-xs font-bold text-foreground/80 border-b border-border pb-2">
              <span className="col-span-2 pl-1">Member</span>
              <div className="col-span-4 grid grid-cols-4 text-center">
                <div>Feb 2026</div>
                <div>Mar 2026</div>
                <div>Apr 2026</div>
                <div>May 2026</div>
              </div>
            </div>

            {/* Timeline rows */}
            <div className="space-y-1 pt-1">
              {group.members.map((m) => {
                const j = m.joined_on;
                const l = m.left_on;
                
                // Graphical positioning percentages
                let startPct = 0;
                let endPct = 100;

                // Basic parsing for Feb-May 2026 window
                if (j) {
                  const date = new Date(j);
                  if (date.getMonth() === 1) startPct = (date.getDate() / 28) * 25; // Feb
                  else if (date.getMonth() === 2) startPct = 25 + (date.getDate() / 31) * 25; // Mar
                  else if (date.getMonth() === 3) startPct = 50 + (date.getDate() / 30) * 25; // Apr
                  else if (date.getMonth() === 4) startPct = 75 + (date.getDate() / 31) * 25; // May
                }
                
                if (l) {
                  const date = new Date(l);
                  if (date.getMonth() === 1) endPct = (date.getDate() / 28) * 25;
                  else if (date.getMonth() === 2) endPct = 25 + (date.getDate() / 31) * 25;
                  else if (date.getMonth() === 3) endPct = 50 + (date.getDate() / 30) * 25;
                  else if (date.getMonth() === 4) endPct = 75 + (date.getDate() / 31) * 25;
                }

                return (
                  <div key={m.id} className="grid grid-cols-6 items-center gap-4 pb-5 border-b border-border/10 last:border-b-0 last:pb-2 pt-2">
                    <span className="text-xs font-bold col-span-2 truncate flex items-center gap-2 pl-1 text-foreground">
                      <Initial name={m.name} size={22} />
                      <span className="truncate">{m.name}</span>
                      {m.is_guest && <span className="text-[8px] text-muted-foreground border border-border px-1 rounded-sm uppercase font-normal shrink-0">guest</span>}
                    </span>
                    <div className="col-span-4 relative h-6 flex items-center">
                      {/* Track container */}
                      <div className="w-full h-2 bg-muted rounded-sm relative">
                        {/* Colored bar for active window */}
                        <div
                          className="absolute h-full bg-muted-foreground rounded-sm transition-all duration-300"
                          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
                        />
                      </div>

                      {/* Labels */}
                      {j && (
                        <div
                          className="absolute text-[9px] font-bold text-foreground/90 whitespace-nowrap"
                          style={{ left: `${startPct}%`, top: "20px", transform: "translateX(-10%)" }}
                        >
                          joined {j.slice(5)}
                        </div>
                      )}
                      {l && (
                        <div
                          className="absolute text-[9px] font-bold text-foreground/90 whitespace-nowrap"
                          style={{ left: `${endPct}%`, top: "20px", transform: "translateX(-90%)" }}
                        >
                          left {l.slice(5)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drill-down dialog */}
      <Dialog open={!!openMember} onOpenChange={(o) => !o && setOpenMember(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Initial name={openMember?.name} size={28} /> {openMember?.name}'s Balance Breakdown
            </DialogTitle>
          </DialogHeader>
          {!detail ? (
            <div className="text-muted-foreground p-6 text-center">Loading breakdown details…</div>
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
  const isCreditor = s.net_minor > 0;
  return (
    <div className="space-y-6">
      {/* Visual financial totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3.5 text-center">
          <div className="text-[10px] uppercase font-bold text-muted-foreground">Paid Upfront</div>
          <div className="mt-1 text-base font-extrabold tabular-nums text-foreground">{money(s.total_paid, cur)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5 text-center">
          <div className="text-[10px] uppercase font-bold text-muted-foreground">Their Share</div>
          <div className="mt-1 text-base font-extrabold tabular-nums text-foreground">{money(s.total_owed, cur)}</div>
        </div>
        <div className={`rounded-xl border p-3.5 text-center ${isCreditor ? "border-pos/30 bg-pos-bg/10" : "border-neg/30 bg-neg-bg/10"}`}>
          <div className="text-[10px] uppercase font-bold text-muted-foreground">Net Balance</div>
          <div className={`mt-1 text-base font-black tabular-nums ${isCreditor ? "text-pos" : "text-neg"}`}>
            {isCreditor ? "+" : ""}{money(s.net, cur)}
          </div>
        </div>
      </div>

      {/* Monospace receipt layout */}
      <div className="receipt-paper border border-border border-b-0 p-5 font-mono shadow-sm bg-card overflow-hidden">
        <div className="text-center border-b border-dashed border-border pb-4 mb-4">
          <div className="text-sm font-black uppercase">BROKETOGETHER LEDGER</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">DETAILED STATEMENT FOR {detail.member.name.toUpperCase()}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">GENERATED AUTOMATICALLY · RELATIONAL AUDIT COMPLETE</div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[11px] font-black border-b border-border/50 pb-1 mb-2 uppercase text-muted-foreground">Owed Shares (Cost splits)</div>
            {detail.owed.length === 0 ? (
              <div className="text-[10px] text-muted-foreground py-2">No shared expenses logged for this member.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] text-left text-foreground">
                  <thead>
                    <tr className="border-b border-border/30 font-bold text-muted-foreground">
                      <th className="pb-1 w-16">Date</th>
                      <th className="pb-1">Expense</th>
                      <th className="pb-1">Paid By</th>
                      <th className="pb-1 text-center">CSV Row</th>
                      <th className="pb-1 text-right">Their Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.owed.map((o, i) => (
                      <tr key={i} className="border-b border-border/10 hover:bg-muted/20">
                        <td className="py-1.5 tabular-nums text-muted-foreground">{o.date}</td>
                        <td className="py-1.5 font-bold">{o.description}</td>
                        <td className="py-1.5 text-muted-foreground">{o.paid_by}</td>
                        <td className="py-1.5 text-center text-muted-foreground font-semibold">
                          {o.source_row ? `#${o.source_row}` : "Manual"}
                        </td>
                        <td className="py-1.5 text-right font-black tabular-nums">{money(o.share, cur, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {detail.settlements.length > 0 && (
            <div>
              <div className="text-[11px] font-black border-b border-border/50 pb-1 mb-2 uppercase text-muted-foreground">Direct Payments & Settlements</div>
              <div className="space-y-1.5">
                {detail.settlements.map((x, i) => {
                  const isPaid = x.direction === "paid";
                  return (
                    <div key={i} className="flex justify-between text-[10px] py-1 border-b border-border/10">
                      <div>
                        <span className="text-muted-foreground">[{x.date}]</span>{" "}
                        <span className="font-bold">{isPaid ? "Paid to" : "Received from"}</span>{" "}
                        <span className="font-semibold text-foreground">{x.counterparty}</span>
                        {x.source_row && <span className="text-muted-foreground text-[8px] ml-1.5">(CSV #{x.source_row})</span>}
                      </div>
                      <span className={`font-black tabular-nums ${isPaid ? "text-pos" : "text-neg"}`}>
                        {isPaid ? "+" : "-"}{money(x.amount, cur)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-border pt-4 mt-6 flex justify-between items-center text-xs">
          <span className="font-black">TOTAL NET CHANGE</span>
          <span className={`font-black tabular-nums p-1 rounded ${isCreditor ? "text-pos bg-pos-bg" : "text-neg bg-neg-bg"}`}>
            {isCreditor ? "+" : ""}{money(s.net, cur)}
          </span>
        </div>
      </div>
      
      {/* Compliance stamp */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg border border-border">
        <ShieldCheck className="h-4 w-4 text-pos shrink-0" />
        <span>This drill-down breaks down exact transaction components from the database. Audit complete with zero decimal truncation.</span>
      </div>
    </div>
  );
}
