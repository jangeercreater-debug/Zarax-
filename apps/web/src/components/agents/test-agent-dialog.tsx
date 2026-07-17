'use client';

import { useState } from 'react';
import { Bot, Send, User } from 'lucide-react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useTestAgent } from '@/hooks/use-agents';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface TestMessage {
  role: 'user' | 'agent';
  text: string;
}

interface TestAgentDialogProps {
  agentId: string;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TestAgentDialog({ agentId, agentName, open, onOpenChange }: TestAgentDialogProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const testAgent = useTestAgent(agentId);

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');

    testAgent.mutate(text, {
      onSuccess: (result) => {
        setMessages((prev) => [...prev, { role: 'agent', text: result.response }]);
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Test message failed', { description: message });
      },
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setMessages([]); // fresh transcript each time the dialog opens
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test &ldquo;{agentName}&rdquo;</DialogTitle>
          <DialogDescription>
            Sends each message through the real pipeline (tool calls, knowledge base, cost tracking) —
            nothing here is saved or reaches a real caller.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Send a message to start testing this agent&rsquo;s configuration.
            </p>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex items-start gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background border'
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
          {testAgent.isPending && (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Bot className="h-4 w-4" />
              </div>
              <Skeleton className="h-8 w-32" />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message to test…"
            disabled={testAgent.isPending}
          />
          <Button onClick={handleSend} disabled={testAgent.isPending || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
