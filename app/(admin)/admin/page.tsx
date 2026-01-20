"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Users,
  ListChecks,
  Loader2,
  Mail,
  Globe,
  Calendar,
  BookOpen,
  BookMarked,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type Tab = "allowlist" | "users";

interface AllowlistEntry {
  id: string;
  entry: string;
  type: "email" | "domain";
  notes: string | null;
  addedBy: string | null;
  createdAt: string;
}

interface UserWithStats {
  id: string;
  clerkId: string;
  email: string | null;
  targetLanguage: string;
  cefrLevel: string;
  createdAt: string;
  articleCount: number;
  completedArticles: number;
  savedWordsCount: number;
  lastActiveAt: string | null;
  // Clerk info
  clerkEmail: string | null;
  clerkName: string | null;
  clerkImageUrl: string | null;
}

interface Stats {
  totalUsers: number;
  totalArticles: number;
  totalWords: number;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("allowlist");
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newEntry, setNewEntry] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [oldClerkId, setOldClerkId] = useState("");
  const [newClerkId, setNewClerkId] = useState("");
  const [isPorting, setIsPorting] = useState(false);
  const [portResult, setPortResult] = useState<{
    success?: boolean;
    warning?: boolean;
    message?: string;
    oldUser?: { id: string; clerkId: string; articles: number; words: number };
    newUser?: { id: string; clerkId: string; articles: number; words: number };
  } | null>(null);

  // Fetch data on tab change
  useEffect(() => {
    if (activeTab === "allowlist") {
      fetchAllowlist();
    } else {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchAllowlist = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/allowlist");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAllowlist(data.entries);
    } catch (error) {
      toast({
        title: "Failed to load allowlist",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUsers(data.users);
      setStats(data.stats);
    } catch (error) {
      toast({
        title: "Failed to load users",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntry.trim()) return;

    setIsAdding(true);
    try {
      const res = await fetch("/api/admin/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry: newEntry.trim(),
          notes: newNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add");
      }

      const data = await res.json();
      setAllowlist((prev) => [data.entry, ...prev]);
      setNewEntry("");
      setNewNotes("");
      toast({
        title: "Entry added",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to add entry",
        variant: "error",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleSeedLegacy = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch("/api/admin/allowlist/seed", {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to seed");

      const data = await res.json();
      toast({
        title: `Seeded ${data.added} entries`,
        description: data.skipped > 0 ? `${data.skipped} already existed` : undefined,
        variant: "success",
      });

      // Refresh the list
      fetchAllowlist();
    } catch (error) {
      toast({
        title: "Failed to seed entries",
        variant: "error",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/allowlist/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");

      setAllowlist((prev) => prev.filter((e) => e.id !== id));
      toast({
        title: "Entry removed",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Failed to remove entry",
        variant: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatRelativeDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateStr);
  };

  const handlePortAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldClerkId.trim() || !newClerkId.trim()) return;

    setIsPorting(true);
    setPortResult(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldClerkId: oldClerkId.trim(),
          newClerkId: newClerkId.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: data.error || "Failed to port account",
          variant: "error",
        });
        return;
      }

      if (data.success) {
        toast({
          title: "Account ported successfully",
          description: data.message,
          variant: "success",
        });
        setOldClerkId("");
        setNewClerkId("");
        setPortResult(null);
        fetchUsers(); // Refresh the list
      } else if (data.warning) {
        setPortResult(data);
      }
    } catch (error) {
      toast({
        title: "Failed to port account",
        variant: "error",
      });
    } finally {
      setIsPorting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("allowlist")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
            activeTab === "allowlist"
              ? "bg-[#c45c3e] text-white"
              : "bg-[#f3ede4] text-[#6b6b6b] hover:bg-[#e8dfd3]"
          )}
        >
          <ListChecks className="h-4 w-4" />
          Allowlist
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
            activeTab === "users"
              ? "bg-[#c45c3e] text-white"
              : "bg-[#f3ede4] text-[#6b6b6b] hover:bg-[#e8dfd3]"
          )}
        >
          <Users className="h-4 w-4" />
          Users
        </button>
      </div>

      {/* Allowlist Tab */}
      {activeTab === "allowlist" && (
        <div className="space-y-6">
          {/* Add Form */}
          <Card className="p-4">
            <form onSubmit={handleAddEntry} className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    value={newEntry}
                    onChange={(e) => setNewEntry(e.target.value)}
                    placeholder="Email (user@example.com) or domain (example.com)"
                    className="h-11"
                  />
                </div>
                <Button type="submit" disabled={isAdding || !newEntry.trim()}>
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span className="ml-2">Add</span>
                </Button>
              </div>
              <div className="flex gap-3">
                <Input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Notes (optional) - e.g., who this is for"
                  className="text-sm flex-1"
                />
                {allowlist.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSeedLegacy}
                    disabled={isSeeding}
                    className="flex-shrink-0"
                  >
                    {isSeeding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="ml-2">Import Legacy</span>
                  </Button>
                )}
              </div>
            </form>
          </Card>

          {/* Entries List */}
          <Card>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#c45c3e]" />
              </div>
            ) : allowlist.length === 0 ? (
              <div className="text-center py-12 text-[#6b6b6b]">
                No allowlist entries yet. Add emails or domains above.
              </div>
            ) : (
              <div className="divide-y divide-[#e8dfd3]">
                {allowlist.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-4 hover:bg-[#faf8f5] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {entry.type === "email" ? (
                        <Mail className="h-4 w-4 text-[#6b6b6b] flex-shrink-0" />
                      ) : (
                        <Globe className="h-4 w-4 text-[#6b6b6b] flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1a1a1a] truncate">
                            {entry.entry}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs",
                              entry.type === "domain" && "bg-blue-100 text-blue-700"
                            )}
                          >
                            {entry.type}
                          </Badge>
                        </div>
                        {entry.notes && (
                          <p className="text-sm text-[#6b6b6b] truncate">
                            {entry.notes}
                          </p>
                        )}
                        <p className="text-xs text-[#9a9a9a]">
                          Added {formatDate(entry.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteEntry(entry.id)}
                      disabled={deletingId === entry.id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      {deletingId === entry.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {!isLoading && allowlist.length > 0 && (
            <p className="text-sm text-[#9a9a9a] text-center">
              {allowlist.length} {allowlist.length === 1 ? "entry" : "entries"} in allowlist
            </p>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-6">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-[#1a1a1a]">
                  {stats.totalUsers}
                </div>
                <div className="text-sm text-[#6b6b6b]">Total Users</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-[#1a1a1a]">
                  {stats.totalArticles}
                </div>
                <div className="text-sm text-[#6b6b6b]">Total Articles</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-[#1a1a1a]">
                  {stats.totalWords}
                </div>
                <div className="text-sm text-[#6b6b6b]">Saved Words</div>
              </Card>
            </div>
          )}

          {/* Port Account */}
          <Card className="p-4">
            <h3 className="font-medium text-[#1a1a1a] mb-3">Port Account</h3>
            <p className="text-sm text-[#6b6b6b] mb-4">
              Transfer data from an old Clerk ID to a new one. This updates the old user&apos;s clerk_id and deletes the new user record if it exists.
            </p>
            <form onSubmit={handlePortAccount} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={oldClerkId}
                  onChange={(e) => setOldClerkId(e.target.value)}
                  placeholder="Old Clerk ID (user_xxx...)"
                  className="font-mono text-sm"
                />
                <Input
                  value={newClerkId}
                  onChange={(e) => setNewClerkId(e.target.value)}
                  placeholder="New Clerk ID (user_xxx...)"
                  className="font-mono text-sm"
                />
              </div>
              {portResult?.warning && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                  <p className="font-medium text-amber-800 mb-2">⚠️ Warning</p>
                  <p className="text-amber-700">{portResult.message}</p>
                  <div className="mt-2 grid grid-cols-2 gap-4 text-amber-700">
                    <div>
                      <p className="font-medium">Old user (keep):</p>
                      <p>{portResult.oldUser?.articles} articles, {portResult.oldUser?.words} words</p>
                    </div>
                    <div>
                      <p className="font-medium">New user (delete):</p>
                      <p>{portResult.newUser?.articles} articles, {portResult.newUser?.words} words</p>
                    </div>
                  </div>
                </div>
              )}
              <Button
                type="submit"
                disabled={isPorting || !oldClerkId.trim() || !newClerkId.trim()}
              >
                {isPorting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Port Account
              </Button>
            </form>
          </Card>

          {/* Users List */}
          <Card>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#c45c3e]" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-[#6b6b6b]">
                No users yet.
              </div>
            ) : (
              <div className="divide-y divide-[#e8dfd3]">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="p-4 hover:bg-[#faf8f5] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Avatar */}
                        {user.clerkImageUrl ? (
                          <img
                            src={user.clerkImageUrl}
                            alt=""
                            className="w-10 h-10 rounded-full flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#e8dfd3] flex items-center justify-center flex-shrink-0">
                            <Users className="w-5 h-5 text-[#6b6b6b]" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-[#1a1a1a] truncate">
                              {user.clerkName || user.clerkEmail || user.email || "Unknown user"}
                            </span>
                            <Badge variant="secondary">
                              {user.targetLanguage} {user.cefrLevel}
                            </Badge>
                            {!user.clerkEmail && (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                                Not in Clerk
                              </Badge>
                            )}
                          </div>
                          {user.clerkName && user.clerkEmail && (
                            <p className="text-sm text-[#6b6b6b] truncate mb-1">
                              {user.clerkEmail}
                            </p>
                          )}
                          <p
                            className="text-xs text-[#9a9a9a] font-mono truncate mb-1 cursor-pointer hover:text-[#6b6b6b]"
                            onClick={() => {
                              navigator.clipboard.writeText(user.clerkId);
                              toast({ title: "Clerk ID copied", variant: "success" });
                            }}
                            title="Click to copy"
                          >
                            {user.clerkId}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-[#6b6b6b]">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Joined {formatDate(user.createdAt)}
                            </span>
                            <span>
                              Active {formatRelativeDate(user.lastActiveAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-[#6b6b6b]">
                          <BookOpen className="h-4 w-4" />
                          <span className="font-medium">
                            {user.completedArticles}/{user.articleCount}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[#6b6b6b]">
                          <BookMarked className="h-4 w-4" />
                          <span className="font-medium">{user.savedWordsCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
