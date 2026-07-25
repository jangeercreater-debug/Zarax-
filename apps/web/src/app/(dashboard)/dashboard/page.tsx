"use client";
import { Bot, Phone, MessageSquare, Zap } from "lucide-react";
import { useAgents } from "@/hooks/use-agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
function StatCard({ title, value, description, icon: Icon, loading }: { title: string; value: string | number; description: string; icon: React.ElementType; loading?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
export default function DashboardPage() {
  const { data: agents, isLoading } = useAgents();
  const activeAgents = agents?.filter((a) => a.isActive).length ?? 0;
  const totalAgents = agents?.length ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome to Zarax — your AI Voice Agent platform.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Agents" value={activeAgents} description={totalAgents + " total agents"} icon={Bot} loading={isLoading} />
        <StatCard title="Total Calls" value="—" description="All time" icon={Phone} />
        <StatCard title="Conversations" value="—" description="Last 30 days" icon={MessageSquare} />
        <StatCard title="Avg Response" value="—" description="Time to first response" icon={Zap} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground py-8 text-center">No recent activity yet.</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Your Agents</CardTitle></CardHeader>
          <CardContent>
            {isLoading && <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>}
            {agents && agents.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No agents yet. Create your first agent.</p>}
            {agents && agents.length > 0 && <div className="space-y-2">{agents.slice(0,5).map(agent => (<div key={agent.id} className="flex items-center justify-between rounded-md border px-3 py-2"><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">{agent.name}</span></div><span className={"text-xs px-2 py-0.5 rounded-full " + (agent.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>{agent.isActive ? "Active" : "Draft"}</span></div>))}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
