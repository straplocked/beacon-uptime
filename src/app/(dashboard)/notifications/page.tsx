import { db } from "@/lib/db";
import { notificationChannels } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Mail, MessageSquare, Webhook } from "lucide-react";
import { AddChannelForm } from "@/components/dashboard/add-channel-form";

export default async function NotificationsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const channels = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.organizationId, ctx.organization.id))
    .orderBy(desc(notificationChannels.createdAt));

  const typeIcons: Record<string, React.ReactNode> = {
    email: <Mail className="h-4 w-4" />,
    slack: <MessageSquare className="h-4 w-4" />,
    discord: <MessageSquare className="h-4 w-4" />,
    webhook: <Webhook className="h-4 w-4" />,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notification Channels</h1>
        <p className="text-muted-foreground">
          Configure where you receive downtime alerts
        </p>
      </div>

      {/* Existing channels */}
      {channels.length > 0 && (
        <div className="grid gap-3">
          {channels.map((channel) => (
            <Card key={channel.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    {typeIcons[channel.type]}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{channel.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {channel.type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {channel.isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      Default
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add new channel */}
      <AddChannelForm />
    </div>
  );
}
