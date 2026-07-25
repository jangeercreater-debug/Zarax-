"use client";
import { Bot, Phone, MessageSquare, FileText } from "lucide-react";
import { useStats } from "@/hooks/use-stats";
import { useAgents } from "@/hooks/use-agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

function StatCard({ title, value, sub, icon: Icon, loading }: {
  title: string; value: string | number; sub: string; icon: React.ElementType; loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useStats();
  const { data: agents } = useAgents();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your Zarax AI Voice Agent platform overview.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Calls" value={stats?.totalCalls ?? "—"} sub={"Last 30 days: " + (stats?.recentCalls ?? "—")} icon={Phone} loading={isLoading} />
        <StatCard title="Active Calls" value={stats?.activeCalls ?? "—"} sub="Currently in progress" icon={MessageSquare} loading={isLoading} />
        <StatCard title="Active Agents" value={stats?.activeAgents ?? "—"} sub={(stats?.totalAgents ?? "—") + " total agents"} icon={Bot} loading={isLoading} />
        <StatCard title="Documents" value={stats?.totalDocuments ?? "—"} sub="Knowledge base" icon={FileText} loading={isLoading} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground py-8 text-center">
              {stats?.totalCalls === 0 ? "No calls yet. Create an agent and make your first call." : "Activity timeline coming soon."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Your Agents</CardTitle></CardHeader>
          <CardContent>
            {!agents && <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>}
            {agents && agents.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No agents yet.</p>}
            {agents && agents.length > 0 && (
              <div className="space-y-2">
                {agents.slice(0,5).map(agent => (
                  <div key={agent.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{agent.name}</span>
                    </div>
                    <Badge variant={agent.isActive ? "default" : "secondary"}>{agent.isActive ? "Active" : "Draft"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}