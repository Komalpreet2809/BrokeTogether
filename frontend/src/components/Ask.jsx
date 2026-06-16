import { useState, useEffect, useRef } from "react";
import api from "../api";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bot, Send, Trash2, HelpCircle, TrendingDown, Scale, Clipboard, Check,
  Database, Info, ShieldCheck, MessageSquare, ListFilter, Cpu
} from "lucide-react";

const SUGGESTIONS = [
  {
    title: "Check balances",
    desc: "Find out who is positive or negative.",
    query: "How much does Rohan owe in total?",
    icon: Scale,
  },
  {
    title: "Settle up steps",
    desc: "Optimized payments to clear all debts.",
    query: "Who should pay Aisha and how much?",
    icon: TrendingDown,
  },
  {
    title: "Highest debtor",
    desc: "Find out who owes the most money.",
    query: "Who owes the most money?",
    icon: HelpCircle,
  },
];

export default function Ask({ groupId, onClose }) {
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [factsTab, setFactsTab] = useState("structured");

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function handleSend(questionText) {
    const text = (questionText || q).trim();
    if (!text) return;

    // Append user message
    const userMsgId = Math.random().toString(36).substring(7);
    const newMessages = [...messages, { id: userMsgId, role: "user", text }];
    setMessages(newMessages);
    setQ("");
    setBusy(true);

    try {
      const { data } = await api.post(`/groups/${groupId}/ask`, { question: text });
      const assistantMsgId = Math.random().toString(36).substring(7);
      
      const responseMessage = {
        id: assistantMsgId,
        role: "assistant",
        text: data.answer,
        ai_used: data.ai_used,
        model: data.model,
        facts: data.facts,
      };

      setMessages((prev) => [...prev, responseMessage]);
      setActiveMessageId(assistantMsgId);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          role: "assistant",
          text: "Sorry, I had trouble communicating with the database parser. Please try again.",
          ai_used: false,
          model: "Error",
          facts: null,
        }
      ]);
    } finally {
      setBusy(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setActiveMessageId(null);
  }

  function copyToClipboard(id, text) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatResponseText(text) {
    if (!text) return "";
    
    // Split bold tags **text**
    const blocks = text.split(/(\*\*[^*]+\*\*)/g);
    
    return blocks.map((block, idx) => {
      if (block.startsWith("**") && block.endsWith("**")) {
        const inner = block.slice(2, -2);
        return <strong key={idx} className="font-extrabold text-foreground">{inner}</strong>;
      }
      
      // Highlight numbers and currencies
      const numParts = block.split(/((?:₹|\$)\d+(?:,\d{3})*(?:\.\d+)?|\b\d+(?:,\d{3})*(?:\.\d+)?\b)/g);
      return numParts.map((part, i) => {
        const isNumber = /^(?:₹|\$)?\d+(?:,\d{3})*(?:\.\d+)?$/.test(part) && part.trim().length > 0;
        if (isNumber) {
          return (
            <strong
              key={`${idx}-${i}`}
              className="font-extrabold text-foreground bg-muted-foreground/10 border border-border/20 px-1 py-0.2 rounded font-mono text-xs inline-block"
            >
              {part}
            </strong>
          );
        }
        return part;
      });
    });
  }

  // Find facts of selected or active message
  const activeMsg = messages.find(m => m.id === activeMessageId);
  const activeFacts = activeMsg?.facts;

  return (
    <div className="flex flex-col justify-between glow-card overflow-hidden h-[480px] w-full border border-border shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.55)] p-0 gap-0 rounded-2xl text-card-foreground">
      <CardHeader className="pt-5 pb-3 px-5 border-b border-border flex flex-row items-center justify-between space-y-0 shrink-0 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg text-foreground">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-sm flex items-center gap-1.5">
              Brokie <Bot className="h-4 w-4 text-muted-foreground animate-pulse" />
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">Ask questions about group expenses.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={clearChat} className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer rounded-lg" title="Clear chat history">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg" title="Close chat">
              <span className="text-sm font-bold">✕</span>
            </Button>
          )}
        </div>
      </CardHeader>

        {/* Message scroll list */}
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`rounded-2xl px-4 py-2.5 text-xs transition-all max-w-[85%] ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-sm shadow-sm"
                      : "bg-muted/40 rounded-tl-sm border border-border/40 text-foreground space-y-2"
                  }`}
                >
                  <div className="whitespace-pre-line leading-relaxed">
                    {isUser ? m.text : formatResponseText(m.text)}
                  </div>
                  
                  {!isUser && (
                    <div className="flex items-center justify-end pt-1 border-t border-border/10">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-foreground cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(m.id, m.text);
                        }}
                      >
                        {copiedId === m.id ? <Check className="h-3.5 w-3.5 text-pos" /> : <Clipboard className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {busy && (
            <div className="flex flex-col items-start mr-auto">
              <div className="flex items-center gap-2.5 bg-muted/20 border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3">
                <Bot className="h-4 w-4 animate-bounce text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium animate-pulse">Brokie is querying the engine...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </CardContent>

        {/* Suggestion Grid (shown only when thread has only the welcome message) */}
        {messages.length === 0 && !busy && (
          <div className="px-4 pb-4 grid gap-3 sm:grid-cols-3 shrink-0">
            {SUGGESTIONS.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleSend(item.query)}
                  className="text-left border border-border bg-card/50 hover:bg-muted/40 p-3 rounded-xl transition-all duration-200 hover:scale-102 cursor-pointer shadow-sm group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="p-1.5 bg-muted rounded-lg text-muted-foreground group-hover:text-foreground transition-all">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-bold text-foreground">{item.title}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-normal">{item.desc}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-4 border-t border-border flex gap-2 bg-muted/10 shrink-0 rounded-b-2xl">
          <Input
            placeholder="Ask AI e.g. Who owes Aisha money?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={busy}
            className="flex-1 bg-card border-border shadow-inner text-xs"
          />
          <Button disabled={busy || !q.trim()} onClick={() => handleSend()} className="shadow-sm">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
  );
}
