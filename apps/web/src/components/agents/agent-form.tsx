'use client';

import { useEffect, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { Agent } from '@/lib/types';
import { CARTESIA_VOICES, DEEPGRAM_MODELS } from '@/lib/voice-catalog';
import { useAgentFeatureFlags, useToolsCatalog } from '@/hooks/use-tools-catalog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToolMultiSelect } from './tool-multiselect';

const PROVIDERS = [
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'groq', label: 'Groq' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
] as const;

const RESPONSE_STYLES = [
  { value: 'concise', label: 'Concise' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detailed', label: 'Detailed' },
] as const;

const INTERRUPT_SENSITIVITIES = [
  { value: 'low', label: 'Low — finishes its thought before yielding' },
  { value: 'medium', label: 'Medium — yields at natural pauses' },
  { value: 'high', label: 'High — yields as soon as the caller starts speaking' },
] as const;

export const agentFormSchema = z.object({
  name: z.string().min(1, 'Give the agent a name.').max(200),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().max(20_000).optional(),
  welcomeMessage: z.string().max(2000).optional(),
  provider: z.enum(['anthropic', 'groq', 'openai', 'gemini']).optional(),
  model: z.string().max(200).optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().int().min(1).max(8192).optional(),
  responseStyle: z.enum(['concise', 'balanced', 'detailed']).optional(),
  interruptSensitivity: z.enum(['low', 'medium', 'high']).optional(),
  voiceId: z.string().optional(),
  sttModel: z.string().optional(),
  ragEnabled: z.boolean().optional(),
  maxToolIterations: z.coerce.number().int().min(1).max(20).optional(),
  enabledTools: z.array(z.string()).optional(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;

export function agentToFormValues(agent: Agent): AgentFormValues {
  return {
    name: agent.name,
    description: agent.config.description ?? '',
    systemPrompt: agent.config.systemPrompt ?? '',
    welcomeMessage: agent.config.welcomeMessage ?? '',
    provider: agent.config.provider,
    model: agent.config.model ?? '',
    temperature: agent.config.temperature ?? 0.7,
    maxTokens: agent.config.maxTokens ?? 1024,
    responseStyle: agent.config.responseStyle ?? 'balanced',
    interruptSensitivity: agent.config.interruptSensitivity ?? 'medium',
    voiceId: agent.config.voiceId ?? '',
    sttModel: agent.config.sttModel ?? '',
    ragEnabled: agent.config.ragEnabled ?? false,
    maxToolIterations: agent.config.maxToolIterations ?? 5,
    enabledTools: agent.config.enabledTools ?? [],
  };
}

interface AgentFormProps {
  defaultValues?: AgentFormValues;
  onSubmit: (values: AgentFormValues) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  isSubmitting: boolean;
  submitLabel: string;
  /** Rendered inline for a "live configuration preview" — receives the current
   * (possibly-unsaved) form values as the user types. */
  renderPreview?: (values: AgentFormValues) => ReactNode;
}

export function AgentForm({
  defaultValues,
  onSubmit,
  onDirtyChange,
  isSubmitting,
  submitLabel,
  renderPreview,
}: AgentFormProps) {
  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: defaultValues ?? {
      name: '',
      description: '',
      systemPrompt: '',
      welcomeMessage: '',
      model: '',
      temperature: 0.7,
      maxTokens: 1024,
      responseStyle: 'balanced',
      interruptSensitivity: 'medium',
      voiceId: '',
      sttModel: '',
      ragEnabled: false,
      maxToolIterations: 5,
      enabledTools: [],
    },
  });

  const { data: tools, isLoading: toolsLoading } = useToolsCatalog();
  const { data: featureFlags } = useAgentFeatureFlags();
  const values = form.watch();

  // Reports dirty state up so the parent page can show an unsaved-changes warning
  // and guard navigation — react-hook-form's formState.isDirty is the source of
  // truth. This must be a side effect (not called during render) since it updates a
  // *different* component's state.
  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Basics</h3>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Support Bot" {...field} />
                    </FormControl>
                    <FormDescription>Shown in your agent list — not visible to callers.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Handles tier-1 support questions for Acme Corp." className="min-h-[70px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="welcomeMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Welcome message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Hi! Thanks for calling Acme Corp — how can I help?"
                        className="min-h-[70px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Spoken first, before the caller says anything.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Behavior</h3>
              <FormField
                control={form.control}
                name="systemPrompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>System prompt</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="You are a friendly support agent for Acme Corp. Keep answers concise…"
                        className="min-h-[160px] font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Defines how the agent behaves. Changing this creates a new version — see version
                      history to roll back.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="responseStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Response style</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RESPONSE_STYLES.map((style) => (
                            <SelectItem key={style.value} value={style.value}>
                              {style.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="interruptSensitivity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interrupt sensitivity</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INTERRUPT_SENSITIVITIES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Language model</h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LLM provider</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Default (Claude)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PROVIDERS.map((provider) => (
                            <SelectItem key={provider.value} value={provider.value}>
                              {provider.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model</FormLabel>
                      <FormControl>
                        <Input placeholder="claude-sonnet-4-5" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Temperature</FormLabel>
                      <span className="text-sm text-muted-foreground">{field.value?.toFixed(1) ?? '0.7'}</span>
                    </div>
                    <FormControl>
                      <Slider
                        min={0}
                        max={2}
                        step={0.1}
                        value={[field.value ?? 0.7]}
                        onValueChange={([v]) => field.onChange(v)}
                      />
                    </FormControl>
                    <FormDescription>Lower is more focused/deterministic; higher is more creative.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxTokens"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max tokens</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={8192} className="max-w-32" {...field} />
                    </FormControl>
                    <FormDescription>Upper bound on response length.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxToolIterations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max tool iterations</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={20} className="max-w-32" {...field} />
                    </FormControl>
                    <FormDescription>Safety limit on tool-call loops within a single turn.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Voice & speech</h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="voiceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Voice (Cartesia)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Default voice" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CARTESIA_VOICES.map((voice) => (
                            <SelectItem key={voice.value} value={voice.value}>
                              {voice.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sttModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Speech recognition (Deepgram)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Default model" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEEPGRAM_MODELS.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Knowledge & tools</h3>
              <FormField
                control={form.control}
                name="ragEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label>Knowledge base retrieval (RAG)</Label>
                      <FormDescription>
                        Let the agent pull context from your knowledge base before answering.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enabledTools"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Enabled tools</FormLabel>
                    <FormControl>
                      <ToolMultiSelect
                        tools={tools}
                        isLoading={toolsLoading}
                        value={field.value ?? []}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {featureFlags && featureFlags.length > 0 && (
              <>
                <Separator />
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">Feature flags</h3>
                  <p className="text-sm text-muted-foreground">
                    Features available to your plan — contact support to enable a flag.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {featureFlags.map((flag) => (
                      <Badge key={flag.key} variant={flag.enabled ? 'success' : 'secondary'}>
                        {flag.label}: {flag.enabled ? 'On' : 'Off'}
                      </Badge>
                    ))}
                  </div>
                </section>
              </>
            )}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : submitLabel}
            </Button>
          </form>
        </Form>
      </div>

      {renderPreview && <div className="lg:col-span-1">{renderPreview(values)}</div>}
    </div>
  );
}
