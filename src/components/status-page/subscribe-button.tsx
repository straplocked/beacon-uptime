"use client";

import { useState } from "react";
import { Bell } from "lucide-react";

export function SubscribeButton({ slug }: { slug: string }) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch(`/api/public/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email }),
      });

      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <span className="text-xs" style={{ color: "var(--sp-accent)" }}>
        Check your email to confirm!
      </span>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 transition-all"
        style={{
          color: "var(--sp-text-3)",
          border: "1px solid var(--sp-border)",
          fontFamily: "var(--sp-font)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--sp-text-2)";
          e.currentTarget.style.borderColor = "var(--sp-text-3)";
          e.currentTarget.style.background = "var(--sp-surface)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--sp-text-3)";
          e.currentTarget.style.borderColor = "var(--sp-border)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Bell className="h-3 w-3" />
        Subscribe
      </button>
    );
  }

  return (
    <form onSubmit={handleSubscribe} className="flex gap-2">
      <input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="text-xs px-3 py-1.5 rounded-lg w-48 focus:outline-none transition-colors"
        style={{
          background: "var(--sp-input-bg)",
          border: "1px solid var(--sp-input-border)",
          color: "var(--sp-text)",
          fontFamily: "var(--sp-font)",
        }}
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        style={{
          background: "var(--sp-accent-subtle)",
          color: "var(--sp-accent)",
          border: "1px solid var(--sp-accent-border)",
        }}
      >
        {status === "loading" ? "..." : "Subscribe"}
      </button>
    </form>
  );
}
