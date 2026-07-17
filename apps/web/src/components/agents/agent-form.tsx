'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { Agent } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const PROVIDERS = [
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'groq', label: 'Groq' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
] as const;

export const agentFormSchema = z.object({
  name: z.string().min(1, 'Give the agent a name.').max(200),
  systemPrompt: z.string().max(20_000).optional(),
  provider: z.enum(['anthropic', 'groq', 'openai', 'gemini']).optional(),
  model: z.string().max(200).optional(),
  ragEnabled: z.boolean().optional(),
  maxToolIterations: z.coerce.number().int().min(1).max(20).optional(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;

export function agentToFormValues(agent: Agent): AgentFormValues {
  return {
    name: agent.name,
    systemPrompt: agent.config.systemPrompt ?? '',
    provider: agent.config.provider,
    model: agent.config.model ?? '',
    ragEnabled: agent.config.ragEnabled ?? false,
    maxToolIterations: agent.config.maxToolIterations ?? 5,
  };
}

interface AgentFormProps {
  defaultValues?: AgentFormValues;
  onSubmit: (values: AgentFormValues) => void;
  isSubmitting: boolean;
  submitLabel: string;
}

export function AgentForm({ defaultValues, onSubmit, isSubmitting, submitLabel }: AgentFormProps) {
  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: defaultValues ?? {
      name: '',
      systemPrompt: '',
      model: '',
      ragEnabled: false,
      maxToolIterations: 5,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
          name="systemPrompt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>System prompt</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="You are a friendly support agent for Acme Corp. Keep answers concise…"
                  className="min-h-[160px]"
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

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
