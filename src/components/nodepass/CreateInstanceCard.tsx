
"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { createInstanceSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest } from '@/types/nodepass';
import { PlusCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig } from '@/hooks/use-api-key';


export function CreateInstanceCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getApiRootUrl, getToken } = useApiConfig();

  const form = useForm<z.infer<typeof createInstanceSchema>>({
    resolver: zodResolver(createInstanceSchema),
    defaultValues: {
      url: '',
    },
  });

  const createInstanceMutation = useMutation({
    mutationFn: (data: CreateInstanceRequest) => {
      const apiRootUrl = getApiRootUrl();
      const token = getToken();
      if (!apiRootUrl || !token) throw new Error("API 配置不可用。");
      return nodePassApi.createInstance(data, apiRootUrl, token);
    },
    onSuccess: () => {
      toast({
        title: '实例已创建',
        description: '新实例已成功创建。',
      });
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: '创建实例出错',
        description: error.message || '发生未知错误。',
        variant: 'destructive',
      });
    },
  });

  function onSubmit(values: z.infer<typeof createInstanceSchema>) {
    createInstanceMutation.mutate(values);
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <PlusCircle className="mr-2 h-6 w-6 text-primary" />
          创建新实例
        </CardTitle>
        <CardDescription>
          提供命令 URL以设置新的 NodePass 实例。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="instance-url">实例命令 URL</FormLabel>
                  <FormControl>
                    <Input
                      id="instance-url"
                      placeholder="例如：server://0.0.0.0:8080/example.com:80?tls=0"
                      {...field}
                      className="text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full sm:w-auto" disabled={createInstanceMutation.isPending}>
              {createInstanceMutation.isPending ? '创建中...' : '创建实例'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
