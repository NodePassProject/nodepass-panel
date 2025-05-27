
"use client";

import React, { useEffect } from 'react';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { modifyInstanceConfigSchema } from '@/zod-schemas/nodepass';
import type { Instance, ModifyInstanceConfigRequest } from '@/types/nodepass';
import { Pencil } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig } from '@/hooks/use-api-key';

interface ModifyInstanceDialogProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModifyInstanceDialog({ instance, open, onOpenChange }: ModifyInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getApiRootUrl, getToken } = useApiConfig();

  const form = useForm<z.infer<typeof modifyInstanceConfigSchema>>({
    resolver: zodResolver(modifyInstanceConfigSchema),
    defaultValues: {
      url: '',
    },
  });

  useEffect(() => {
    if (instance && open) {
      form.reset({
        url: instance.url,
      });
    }
  }, [instance, open, form]);

  const modifyInstanceMutation = useMutation({
    mutationFn: (data: { instanceId: string; config: ModifyInstanceConfigRequest }) => {
      const apiRootUrl = getApiRootUrl();
      const token = getToken();
      if (!apiRootUrl || !token) throw new Error("API 配置不可用。");
      if (!data.instanceId) throw new Error("实例 ID 未提供。");
      return nodePassApi.modifyInstanceConfig(data.instanceId, data.config, apiRootUrl, token);
    },
    onSuccess: (updatedInstance) => {
      toast({
        title: '实例已修改',
        description: `实例 ${updatedInstance.id} 的配置已成功更新。`,
      });
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: '修改实例配置出错',
        description: error.message || '发生未知错误。',
        variant: 'destructive',
      });
    },
  });

  function onSubmit(values: z.infer<typeof modifyInstanceConfigSchema>) {
    if (instance) {
      modifyInstanceMutation.mutate({ instanceId: instance.id, config: values });
    }
  }

  if (!instance) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Pencil className="mr-2 h-5 w-5 text-primary" />
            修改实例配置
          </DialogTitle>
          <DialogDescription>
            修改实例 <span className="font-semibold">{instance.id}</span> 的 URL。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="instance-url-modify">实例命令 URL</FormLabel>
                  <FormControl>
                    <Input
                      id="instance-url-modify"
                      placeholder="例如：server://0.0.0.0:8080/example.com:80?tls=0"
                      {...field}
                      className="text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={modifyInstanceMutation.isPending}>
                取消
              </Button>
              <Button type="submit" disabled={modifyInstanceMutation.isPending}>
                {modifyInstanceMutation.isPending ? '保存中...' : '保存更改'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
