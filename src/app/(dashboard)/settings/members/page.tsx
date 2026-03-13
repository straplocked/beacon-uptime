import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function MembersPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Team Members</h1>
        <p className="text-muted-foreground">
          Manage who has access to your organization
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Team management with invitations and role-based access control is
            available in{" "}
            <a
              href="https://beacon.pluginsynthesis.com"
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Beacon Cloud
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
