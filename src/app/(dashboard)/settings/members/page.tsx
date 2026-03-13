"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, UserPlus, Trash2, Shield } from "lucide-react";

interface Member {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

const roleColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800",
  admin: "bg-indigo-100 text-indigo-800",
  member: "bg-sky-100 text-sky-800",
  viewer: "bg-slate-100 text-slate-800",
};

export default function MembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.organization) {
          setOrgId(data.organization.id);
          setRole(data.role);
          return fetch(`/api/internal/organizations/${data.organization.id}/members`);
        }
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data?.members) setMembers(data.members);
      })
      .catch(() => {});
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !orgId) return;

    setInviting(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/internal/organizations/${orgId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send invitation");
      } else {
        const data = await res.json();
        setSuccess(`Invitation sent to ${inviteEmail}. Token: ${data.invitation.token}`);
        setInviteEmail("");
      }
    } catch {
      setError("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm("Remove this member from the organization?")) return;

    const res = await fetch(`/api/internal/organizations/${orgId}/members/${userId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setMembers(members.filter((m) => m.userId !== userId));
    }
  }

  async function handleChangeRole(userId: string, newRole: string) {
    const res = await fetch(`/api/internal/organizations/${orgId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    if (res.ok) {
      setMembers(members.map((m) =>
        m.userId === userId ? { ...m, role: newRole } : m
      ));
    }
  }

  const canManage = role === "owner" || role === "admin";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Team Members</h1>
        <p className="text-muted-foreground">
          Manage who has access to your organization
        </p>
      </div>

      {/* Current members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                    {member.userName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.userName}</p>
                    <p className="text-xs text-muted-foreground">{member.userEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={roleColors[member.role]}>
                    {member.role}
                  </Badge>
                  {canManage && member.role !== "owner" && (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                        className="text-xs border rounded px-2 py-1 bg-background"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleRemoveMember(member.userId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Invite form */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="flex gap-3">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1"
                  required
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="border rounded px-3 py-2 bg-background text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button type="submit" disabled={inviting}>
                  {inviting ? "Inviting..." : "Invite"}
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-teal-600">{success}</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Role legend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Role Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex gap-3">
              <Badge variant="secondary" className={`${roleColors.owner} w-16 justify-center`}>Owner</Badge>
              <span className="text-muted-foreground">Full access, billing, delete org</span>
            </div>
            <div className="flex gap-3">
              <Badge variant="secondary" className={`${roleColors.admin} w-16 justify-center`}>Admin</Badge>
              <span className="text-muted-foreground">Manage members, create/edit/delete resources</span>
            </div>
            <div className="flex gap-3">
              <Badge variant="secondary" className={`${roleColors.member} w-16 justify-center`}>Member</Badge>
              <span className="text-muted-foreground">Create/edit/delete resources</span>
            </div>
            <div className="flex gap-3">
              <Badge variant="secondary" className={`${roleColors.viewer} w-16 justify-center`}>Viewer</Badge>
              <span className="text-muted-foreground">View only, no modifications</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
