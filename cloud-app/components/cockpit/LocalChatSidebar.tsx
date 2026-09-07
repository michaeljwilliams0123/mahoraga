"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { mapOllamaProbe, type LocalConsoleProbe } from "@/lib/cockpit";

type Message = { sender: "SYSTEM" | "MAHORAGA"; text: string };

export function LocalChatSidebar() {
  const [messages, setMessages] = useState<Message[]>([
    { sender: "MAHORAGA", text: "Local zero-credit console. Soft-fail only — never paid fallback." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<LocalConsoleProbe | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1200);
    fetch("http://127.0.0.1:11434/api/tags", { signal: controller.signal })
      .then((response) => {
        if (cancelled) return;
        const mapped = mapOllamaProbe({
          reachable: response.ok,
          detail: response.ok ? "ollama-tags-ok" : `ollama-http-${response.status}`,
        });
        if (mapped.ok) setProbe(mapped.value);
      })
      .catch(() => {
        if (cancelled) return;
        const mapped = mapOllamaProbe({ reachable: false, detail: "ollama-unreachable-soft-fail" });
        if (mapped.ok) setProbe(mapped.value);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { sender: "SYSTEM", text: userText }]);
    setBusy(true);
    try {
      const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5-coder:3b",
          prompt: `Mahoraga cockpit zero-credit assist:\n${userText}`,
          stream: false,
        }),
      });
      if (!response.ok) throw new Error(`ollama-${response.status}`);
      const data = (await response.json()) as { response?: string };
      setMessages((prev) => [...prev, { sender: "MAHORAGA", text: data.response || "No response generated." }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: "MAHORAGA", text: "[SOFT_FAIL]: Local Ollama unreachable. No paid fallback attempted." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="cockpit-chat" aria-label="Local cognitive console">
      <div className="cockpit-chat-head">
        <strong>COGNITIVE_CONSOLE</strong>
        <span className={`cockpit-dot ${probe?.status === "ready" ? "ok" : "warn"}`} />
      </div>
      <p className="cockpit-muted">{probe?.detail ?? "probing-local-ollama"} · creditCost {probe?.creditCost ?? 0}</p>
      <div className="cockpit-chat-stream">
        {messages.map((message, index) => (
          <div key={`${message.sender}-${index}`} className={message.sender === "SYSTEM" ? "cockpit-bubble user" : "cockpit-bubble bot"}>
            <span>{message.sender}</span>
            <p>{message.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={onSubmit} className="cockpit-chat-form">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
          placeholder={busy ? "Computing…" : "Inject local prompt…"}
        />
      </form>
    </aside>
  );
}
