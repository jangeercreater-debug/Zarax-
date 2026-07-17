import type { AgentFormValues } from './agent-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate text-right font-medium">{value}</span>
    </div>
  );
}

export function LiveConfigPreview({ values }: { values: AgentFormValues }) {
  return (
    <Card className="sticky top-20">
      <CardHeader>
        <CardTitle className="text-base">Live preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row label="LLM" value={`${values.provider ?? 'anthropic'} · ${values.model || 'default'}`} />
        <Row label="Temperature" value={String(values.temperature ?? 0.7)} />
        <Row label="Max tokens" value={String(values.maxTokens ?? 1024)} />
        <Row label="Response style" value={values.responseStyle ?? 'balanced'} />
        <Row label="Interrupts" value={values.interruptSensitivity ?? 'medium'} />
        <Separator />
        <Row label="Voice" value={values.voiceId || 'Default'} />
        <Row label="STT model" value={values.sttModel || 'Default'} />
        <Separator />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Knowledge base</span>
          <Badge variant={values.ragEnabled ? 'success' : 'secondary'}>
            {values.ragEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tools</span>
          <span className="font-medium">{values.enabledTools?.length ?? 0} enabled</span>
        </div>
        <Separator />
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Welcome message</p>
          <p className="line-clamp-2 text-sm italic">
            {values.welcomeMessage || 'No welcome message set.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
