"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import {
  MonitorEditForm,
  type MonitorEditFormInitial,
} from "@/components/monitors/monitor-edit-form";

/**
 * K1 805 — wraps the monitor detail page's "Configuration" rail so it can
 * flip between the existing read-only rows and the new edit form in place,
 * without a separate route.
 */
interface MonitorConfigSectionProps {
  monitorId: string;
  monitorType: string;
  canEdit: boolean;
  initial: MonitorEditFormInitial;
  children: React.ReactNode;
}

export function MonitorConfigSection({
  monitorId,
  monitorType,
  canEdit,
  initial,
  children,
}: MonitorConfigSectionProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <MonitorEditForm
        monitorId={monitorId}
        monitorType={monitorType}
        initial={initial}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {children}
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2.5 inline-flex items-center gap-1.5 self-start text-[11.5px] font-medium text-primary hover:underline"
        >
          <Pencil className="h-3 w-3" />
          Edit settings
        </button>
      )}
    </div>
  );
}
