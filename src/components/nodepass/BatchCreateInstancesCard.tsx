
"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { batchCreateInstancesSchema, createInstanceSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest } from '@/types/nodepass';
import { Layers } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig } from '@/hooks/use-api-key';

export function BatchCreateInstancesCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeApiConfig, getApiRootUrl, getToken } = useApiConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof batchCreateInstancesSchema>>({
    resolver: zodResolver(batchCreateInstancesSchema),
    defaultValues: {
      urls: '',
    },
  });

  const createInstanceMutation = useMutation({
    mutationFn: (data: CreateInstanceRequest) => {
      if (!activeApiConfig) throw new Error("没有活动的 API 配置。");
      const apiRootUrl = getApiRootUrl(activeApiConfig.id);
      const token = getToken(activeApiConfig.id);
      if (!apiRootUrl || !token) throw new Error("API 配置不可用。");
      return nodePassApi.createInstance(data, apiRootUrl, token);
    },
  });

  async function onSubmit(values: z.infer<typeof batchCreateInstancesSchema>) {
    if (!activeApiConfig) {
      toast({
        title: '操作失败',
        description: '没有活动的 API 配置，无法创建实例。',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    const urls = values.urls.split('\n').map(url => url.trim()).filter(url => url.length > 0);
    let successfulCreations = 0;
    let failedCreations = 0;

    if (urls.length === 0) {
      toast({
        title: '没有提供 URL',
        description: '请输入至少一个实例 URL。',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }

    for (const url of urls) {
      try {
        createInstanceSchema.parse({ url }); 
        await createInstanceMutation.mutateAsync({ url });
        successfulCreations++;
        toast({
          title: '实例创建成功',
          description: `URL: ${url}`,
        });
      } catch (error: any) {
        failedCreations++;
        let description = '发生未知错误。';
        if (error instanceof z.ZodError) {
          description = `URL "${url}" 无效: ${error.errors.map(e => e.message).join(', ')}`;
        } else if (error.message) {
          description = `创建 "${url}" 出错: ${error.message}`;
        }
        toast({
          title: '实例创建失败',
          description: description,
          variant: 'destructive',
        });
      }
    }

    if (successfulCreations > 0) {
      queryClient.invalidateQueries({ queryKey: ['instances', activeApiConfig.id] });
    }
    
    toast({
        title: '批量创建完成',
        description: `成功: ${successfulCreations}, 失败: ${failedCreations}.`,
    });

    if (successfulCreations > 0 && failedCreations === 0) {
        form.reset(); 
    }
    setIsSubmitting(false);
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Layers className="mr-2 h-6 w-6 text-primary" />
          批量创建实例
        </CardTitle>
        <CardDescription>
          在文本框中每行输入一个实例 URL，批量创建到当前活动的API配置: {activeApiConfig?.name || 'N/A'}。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="urls"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="instance-urls-batch">实例命令 URL (每行一个)</FormLabel>
                  <FormControl>
                    <Textarea
                      id="instance-urls-batch"
                      placeholder="server://0.0.0.0:8081/example.com:81?tls=0\nclient://server.example.com:10101/127.0.0.1:8001?log=info"
                      {...field}
                      className="text-sm min-h-[100px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting || !activeApiConfig}>
              {isSubmitting ? '创建中...' : '批量创建实例'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
