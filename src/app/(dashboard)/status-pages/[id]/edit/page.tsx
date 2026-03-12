"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { StatusPageForm } from "@/components/dashboard/status-page-form";

export default function EditStatusPagePage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{
    statusPage: any;
    monitors: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/internal/status-pages/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="max-w-2xl">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!data?.statusPage) {
    return (
      <div className="max-w-2xl">
        <p className="text-muted-foreground">Status page not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/status-pages">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Status Page</h1>
          <p className="text-muted-foreground">{data.statusPage.name}</p>
        </div>
      </div>

      <StatusPageForm
        mode="edit"
        initialData={data.statusPage}
        initialMonitors={data.monitors}
      />
    </div>
  );
}
