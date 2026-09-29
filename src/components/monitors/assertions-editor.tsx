"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import type { Assertion } from "@/lib/monitoring/assertions";

/**
 * K1 805 — extracted from the monitor create form so the monitor edit form
 * (on the monitor detail page) can reuse the exact same UI, field shapes,
 * and add/remove/change-type behavior instead of duplicating it.
 */

export type AssertionDraft =
  | { localId: string; type: "body_contains"; value: string }
  | { localId: string; type: "body_not_contains"; value: string }
  | { localId: string; type: "body_regex"; pattern: string }
  | { localId: string; type: "header_equals"; header: string; value: string }
  | { localId: string; type: "json_path_equals"; path: string; value: string };

export function emptyAssertion(type: AssertionDraft["type"]): AssertionDraft {
  const localId = crypto.randomUUID();
  switch (type) {
    case "body_contains":
    case "body_not_contains":
      return { localId, type, value: "" };
    case "body_regex":
      return { localId, type, pattern: "" };
    case "header_equals":
      return { localId, type, header: "", value: "" };
    case "json_path_equals":
      return { localId, type, path: "", value: "" };
  }
}

export const assertionTypeLabel: Record<AssertionDraft["type"], string> = {
  body_contains: "Body contains",
  body_not_contains: "Body does not contain",
  body_regex: "Body matches regex",
  header_equals: "Header equals",
  json_path_equals: "JSON path equals",
};

/** Attach a stable `localId` to each stored assertion for list rendering. */
export function assertionsToDrafts(assertions: Assertion[]): AssertionDraft[] {
  return assertions.map((a) => ({ ...a, localId: crypto.randomUUID() }) as AssertionDraft);
}

/** Strip `localId` back off before sending drafts to the API. */
export function draftsToAssertions(drafts: AssertionDraft[]): Assertion[] {
  return drafts.map(({ localId, ...rest }) => {
    void localId;
    return rest as Assertion;
  });
}

interface AssertionsEditorProps {
  assertions: AssertionDraft[];
  onChange: (assertions: AssertionDraft[]) => void;
}

export function AssertionsEditor({ assertions, onChange }: AssertionsEditorProps) {
  function addAssertion() {
    onChange([...assertions, emptyAssertion("body_contains")]);
  }

  function removeAssertion(localId: string) {
    onChange(assertions.filter((a) => a.localId !== localId));
  }

  function changeAssertionType(localId: string, newType: AssertionDraft["type"]) {
    onChange(
      assertions.map((a) => (a.localId === localId ? emptyAssertion(newType) : a)),
    );
  }

  function updateAssertionField(localId: string, field: string, value: string) {
    onChange(
      assertions.map((a) =>
        a.localId === localId ? ({ ...a, [field]: value } as AssertionDraft) : a,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label>Assertions</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fail the check when the response doesn&apos;t match. Evaluated
            only after the status code already matches.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addAssertion}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add assertion
        </Button>
      </div>

      {assertions.length > 0 && (
        <div className="space-y-3">
          {assertions.map((a) => (
            <div
              key={a.localId}
              className="flex items-start gap-2 rounded-md border border-border p-3"
            >
              <div className="flex-1 space-y-2">
                <Select
                  value={a.type}
                  onValueChange={(v) =>
                    v && changeAssertionType(a.localId, v as AssertionDraft["type"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(assertionTypeLabel) as AssertionDraft["type"][]).map(
                      (t) => (
                        <SelectItem key={t} value={t}>
                          {assertionTypeLabel[t]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>

                {(a.type === "body_contains" || a.type === "body_not_contains") && (
                  <Input
                    placeholder="Text the body should (not) contain"
                    value={a.value}
                    onChange={(e) =>
                      updateAssertionField(a.localId, "value", e.target.value)
                    }
                  />
                )}

                {a.type === "body_regex" && (
                  <Input
                    placeholder="Regex pattern (max 200 chars)"
                    value={a.pattern}
                    onChange={(e) =>
                      updateAssertionField(a.localId, "pattern", e.target.value)
                    }
                  />
                )}

                {a.type === "header_equals" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Header name"
                      value={a.header}
                      onChange={(e) =>
                        updateAssertionField(a.localId, "header", e.target.value)
                      }
                    />
                    <Input
                      placeholder="Expected value"
                      value={a.value}
                      onChange={(e) =>
                        updateAssertionField(a.localId, "value", e.target.value)
                      }
                    />
                  </div>
                )}

                {a.type === "json_path_equals" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="JSON path, e.g. data.status"
                      value={a.path}
                      onChange={(e) =>
                        updateAssertionField(a.localId, "path", e.target.value)
                      }
                    />
                    <Input
                      placeholder="Expected value"
                      value={a.value}
                      onChange={(e) =>
                        updateAssertionField(a.localId, "value", e.target.value)
                      }
                    />
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeAssertion(a.localId)}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
