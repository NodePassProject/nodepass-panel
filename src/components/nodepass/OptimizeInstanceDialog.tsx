
"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { optimizeInstanceSchema } from '@/zod-schemas/nodepass';
import type { Instance } from '@/types/nodepass';
import { suggestInstanceConfiguration, type SuggestInstanceConfigurationInput } from '@/ai/flows/suggest-instance-configuration';
import { Wand2, Copy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface OptimizeInstanceDialogProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OptimizeInstanceDialog({ instance, open, onOpenChange }: OptimizeInstanceDialogProps) {
  const { toast } = useToast();
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [suggestedConfig, setSuggestedConfig] = useState<string | null>(null);

  const form = useForm<z.infer<typeof optimizeInstanceSchema>>({
    resolver: zodResolver(optimizeInstanceSchema),
    defaultValues: {
      instanceType: instance?.type || 'server',
      performanceCharacteristics: '',
    },
  });

  React.useEffect(() => {
    if (instance) {
      form.reset({
        instanceType: instance.type,
        performanceCharacteristics: '',
      });
    }
    setSuggestedConfig(null);
  }, [instance, form, open]);

  async function onSubmit(values: z.infer<typeof optimizeInstanceSchema>) {
    setIsLoadingSuggestion(true);
    setSuggestedConfig(null);
    try {
      const result = await suggestInstanceConfiguration(values as SuggestInstanceConfigurationInput);
      setSuggestedConfig(result.suggestedUrlConfiguration);
      toast({
        title: 'Suggestion Ready',
        description: 'AI has provided an optimized configuration.',
      });
    } catch (error: any) {
      toast({
        title: 'Error Getting Suggestion',
        description: error.message || 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSuggestion(false);
    }
  }

  const handleCopyToClipboard = () => {
    if (suggestedConfig) {
      navigator.clipboard.writeText(suggestedConfig);
      toast({ title: "Copied to clipboard!" });
    }
  };

  if (!instance) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Wand2 className="mr-2 h-5 w-5 text-primary" />
            AI-Powered Optimization
          </DialogTitle>
          <DialogDescription>
            Get an AI-suggested optimized URL configuration for instance <span className="font-semibold">{instance.id}</span>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="instanceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instance Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select instance type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="server">Server</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="performanceCharacteristics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Desired Performance Characteristics</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., low latency, high throughput, stable connection for gaming"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoadingSuggestion}>
              {isLoadingSuggestion ? 'Getting Suggestion...' : 'Get Suggestion'}
            </Button>
          </form>
        </Form>
        {isLoadingSuggestion && (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {suggestedConfig && !isLoadingSuggestion && (
          <div className="mt-6 pt-4 border-t">
            <Label className="text-base font-semibold">Suggested Configuration:</Label>
            <div className="mt-2 p-3 bg-muted rounded-md text-sm relative">
              <pre className="whitespace-pre-wrap break-all font-mono">{suggestedConfig}</pre>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyToClipboard}
                className="absolute top-2 right-2 h-7 w-7"
                aria-label="Copy to clipboard"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
