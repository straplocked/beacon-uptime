import { db } from "@/lib/db";
import { statusPages } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Globe, ExternalLink } from "lucide-react";
import Link from "next/link";

export default async function StatusPagesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const pages = await db
    .select()
    .from(statusPages)
    .where(eq(statusPages.userId, user.id))
    .orderBy(desc(statusPages.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Status Pages</h1>
          <p className="text-muted-foreground">
            Public pages showing the status of your services
          </p>
        </div>
        <Link href="/status-pages/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Status Page
          </Button>
        </Link>
      </div>

      {pages.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <Globe className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium text-lg">No status pages yet</p>
            <p className="text-muted-foreground mt-1 mb-4">
              Create a public status page for your users
            </p>
            <Link href="/status-pages/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Status Page
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pages.map((page) => (
            <Card key={page.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: page.brandColor }}
                  >
                    {page.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium">{page.name}</p>
                    <p className="text-sm text-muted-foreground">
                      /s/{page.slug}
                      {page.customDomain && (
                        <span className="ml-2">| {page.customDomain}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={page.isPublic ? "default" : "secondary"}>
                    {page.isPublic ? "Public" : "Private"}
                  </Badge>
                  <Link href={`/s/${page.slug}`} target="_blank">
                    <Button variant="ghost" size="icon">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href={`/status-pages/${page.id}/edit`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
