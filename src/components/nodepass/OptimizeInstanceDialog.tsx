
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
        title: '建议已准备好',
        description: 'AI 已提供优化配置。',
      });
    } catch (error: any) {
      toast({
        title: '获取建议出错',
        description: error.message || '未知错误。',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSuggestion(false);
    }
  }

  const handleCopyToClipboard = () => {
    if (suggestedConfig) {
      navigator.clipboard.writeText(suggestedConfig);
      toast({ title: "已复制！" });
    }
  };

  if (!instance) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Wand2 className="mr-2 h-5 w-5 text-primary" />
            AI 优化建议
          </DialogTitle>
          <DialogDescription>
            获取实例 <span className="font-semibold">{instance.id}</span> 的 AI 优化 URL 配置建议。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="instanceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实例类型</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择实例类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="client">客户端</SelectItem>
                      <SelectItem value="server">服务器</SelectItem>
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
                  <FormLabel>性能特征</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="例：低延迟、高吞吐、游戏稳定连接"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoadingSuggestion}>
              {isLoadingSuggestion ? '获取建议中...' : '获取建议'}
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
            <Label className="text-base font-semibold">建议配置：</Label>
            <div className="mt-2 p-3 bg-muted rounded-md text-sm relative">
              <pre className="whitespace-pre-wrap break-all font-mono">{suggestedConfig}</pre>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyToClipboard}
                className="absolute top-2 right-2 h-7 w-7"
                aria-label="复制"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
         <DialogFooter className="sm:justify-start mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
