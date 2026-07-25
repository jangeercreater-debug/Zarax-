"use client";
import { useState } from "react";
import { Key, Plus, Trash2, Copy, Eye, EyeOff } from "lucide-react";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/use-api-keys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function ApiKeysPage() {
  const { data: keys, isLoading } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!label.trim()) return;
    const res = await create.mutateAsync({ label: label.trim() });
    setNewKey(res.key);
    setLabel("");
    setShowKey(true);
  };

  const copyKey = () => {
    if (newKey) { navigator.clipboard.writeText(newKey).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
        <p className="text-sm text-muted-foreground">Manage API keys for programmatic access to Zarax.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Create New API Key</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input placeholder="Key label (e.g. Production, CI/CD)" value={label} onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()} className="flex-1" />
            <Button onClick={handleCreate} disabled={!label.trim() || create.isPending}>
              <Plus className="h-4 w-4 mr-2" />{create.isPending ? "Creating..." : "Create Key"}
            </Button>
          </div>
          {newKey && (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-4 space-y-2">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">⚠ Copy this key now — it will not be shown again.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background rounded px-2 py-1 border overflow-hidden text-ellipsis">
                  {showKey ? newKey : "•".repeat(40)}
                </code>
                <Button variant="ghost" size="icon" onClick={() => setShowKey(v => !v)}>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                <Button variant="ghost" size="icon" onClick={copyKey}><Copy className="h-4 w-4" /></Button>
                {copied && <span className="text-xs text-green-600">Copied!</span>}
              </div>
              <Button variant="outline" size="sm" onClick={() => setNewKey(null)}>Dismiss</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Active API Keys</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="p-4 space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>}
          {keys && keys.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Key className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No API keys yet. Create one above.</p>
            </div>
          )}
          {keys && keys.length > 0 && (
            <div className="divide-y">
              {keys.map(k => (
                <div key={k.id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{k.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">{k.keyPrefix}••••••••</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:block text-right">
                      <p className="text-xs text-muted-foreground">Created {fmtDate(k.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">{k.lastUsedAt ? "Used " + fmtDate(k.lastUsedAt) : "Never used"}</p>
                    </div>
                    <Badge variant="outline" className="text-xs hidden sm:flex">{k.scopes.join(", ")}</Badge>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                      disabled={revoke.isPending} onClick={() => revoke.mutate(k.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}