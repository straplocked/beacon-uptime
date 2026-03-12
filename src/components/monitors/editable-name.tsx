"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EditableName({
  monitorId,
  initialName,
}: {
  monitorId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) {
      setName(initialName);
      setEditing(false);
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/internal/monitors/${monitorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
    setSaving(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      setName(initialName);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">{initialName}</h1>
        <button
          onClick={() => setEditing(true)}
          className="text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={100}
        disabled={saving}
        className="text-2xl font-bold bg-transparent border-b-2 border-primary outline-none w-full max-w-md"
      />
      <Button variant="ghost" size="icon" onClick={save} disabled={saving}>
        <Check className="h-4 w-4 text-teal-600" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setName(initialName);
          setEditing(false);
        }}
        disabled={saving}
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
