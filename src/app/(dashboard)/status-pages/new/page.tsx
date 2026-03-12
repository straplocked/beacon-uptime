"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { StatusPageForm } from "@/components/dashboard/status-page-form";

export default function NewStatusPagePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/status-pages">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Status Page</h1>
          <p className="text-muted-foreground">
            Create a public status page for your services
          </p>
        </div>
      </div>

      <StatusPageForm mode="create" />
    </div>
  );
}
