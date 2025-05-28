
"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createInstanceFormSchema, createInstanceApiSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest } from '@/types/nodepass';
import { PlusCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig } from '@/hooks/use-api-key';

type CreateInstanceFormValues = z.infer<typeof createInstanceFormSchema>;

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInstanceDialog({ open, onOpenChange }: CreateInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeApiConfig, getApiRootUrl, getToken } = useApiConfig();

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: 'server',
      tunnelAddress: '',
      targetAddress: '',
      logLevel: 'info',
      tlsMode: '0', // Default for server
      certPath: '',
      keyPath: '',
    },
  });

  // Reset form when dialog opens/closes or activeApiConfig changes
  React.useEffect(() => {
    if (open) {
      form.reset({
        instanceType: 'server',
        tunnelAddress: '',
        targetAddress: '',
        logLevel: 'info',
        tlsMode: '0',
        certPath: '',
        keyPath: '',
      });
    }
  }, [open, form, activeApiConfig]);


  const instanceType = form.watch("instanceType");
  const tlsMode = form.watch("tlsMode");

  const createInstanceMutation = useMutation({
    mutationFn: (data: CreateInstanceRequest) => {
      if (!activeApiConfig) throw new Error("没有活动的 API 配置。");
      const apiRootUrl = getApiRootUrl(activeApiConfig.id);
      const token = getToken(activeApiConfig.id);
      if (!apiRootUrl || !token) throw new Error("API 配置不可用。");
      // Validate with API schema before sending
      const validatedApiData = createInstanceApiSchema.parse(data);
      return nodePassApi.createInstance(validatedApiData, apiRootUrl, token);
    },
    onSuccess: () => {
      toast({
        title: '实例已创建',
        description: '新实例已成功创建。',
      });
      queryClient.invalidateQueries({ queryKey: ['instances', activeApiConfig?.id] });
      form.reset();
      onOpenChange(false); // Close dialog on success
    },
    onError: (error: any) => {
      toast({
        title: '创建实例出错',
        description: error.message || '发生未知错误。',
        variant: 'destructive',
      });
    },
  });

  function buildUrl(values: CreateInstanceFormValues): string {
    let url = `${values.instanceType}://${values.tunnelAddress}/${values.targetAddress}?log=${values.logLevel}`;
    if (values.instanceType === 'server') {
      if (values.tlsMode) {
        url += `&tls=${values.tlsMode}`;
        if (values.tlsMode === '2') {
          url += `&crt=${values.certPath || '/path/to/your/cert.pem'}&key=${values.keyPath || '/path/to/your/key.pem'}`;
        }
      }
    }
    return url;
  }

  function onSubmit(values: CreateInstanceFormValues) {
    const constructedUrl = buildUrl(values);
    createInstanceMutation.mutate({ url: constructedUrl });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <PlusCircle className="mr-2 h-6 w-6 text-primary" />
            创建新实例
          </DialogTitle>
          <DialogDescription>
            提供实例的详细信息以进行配置 (将在当前活动的API配置: {activeApiConfig?.name || 'N/A'} 中创建)。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="instanceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实例类型</FormLabel>
                  <Select onValueChange={(value) => {
                      field.onChange(value);
                      if (value === "client") {
                          form.setValue("tlsMode", undefined);
                          form.setValue("certPath", undefined);
                          form.setValue("keyPath", undefined);
                      } else {
                          form.setValue("tlsMode", "0"); // Default for server
                      }
                  }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择实例类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="server">服务器 (Server)</SelectItem>
                      <SelectItem value="client">客户端 (Client)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tunnelAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>隧道地址</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={instanceType === "server" ? "服务器监听的控制通道地址, 例如: 0.0.0.0:10101" : "要连接的 NodePass 服务器隧道地址, 例如: your.server.com:10101"} 
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {instanceType === "server"
                      ? "服务器模式下，这是服务器监听客户端控制连接的地址 (例如 '0.0.0.0:10101' 或 '[::]:10101')。"
                      : "客户端模式下，这是要连接的 NodePass 服务器的隧道端点地址 (例如 'server.example.com:10101')。"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>目标地址</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={instanceType === "server" ? "服务器监听的流量转发地址, 例如: 0.0.0.0:8080" : "本地流量转发地址, 例如: 127.0.0.1:8000"} 
                      {...field} 
                    />
                  </FormControl>
                   <FormDescription>
                    {instanceType === "server"
                      ? "服务器模式下，这是服务器监听用于隧道传输的传入TCP/UDP流量的地址 (例如 '0.0.0.0:8080')。"
                      : "客户端模式下，这是接收到的流量将被转发到的本地地址 (例如 '127.0.0.1:8000' 或 'localhost:3000')。"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="logLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>日志级别</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择日志级别" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="debug">Debug</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warn">Warn</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="fatal">Fatal</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {instanceType === 'server' && (
              <>
                <FormField
                  control={form.control}
                  name="tlsMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>TLS 模式 (仅服务器)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择 TLS 模式" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">0: 无 TLS (明文)</SelectItem>
                          <SelectItem value="1">1: 自签名证书</SelectItem>
                          <SelectItem value="2">2: 自定义证书</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {tlsMode === '2' && (
                  <>
                    <FormField
                      control={form.control}
                      name="certPath"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>证书路径 (TLS 模式 2)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="例如: /path/to/your/cert.pem" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="keyPath"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>密钥路径 (TLS 模式 2)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="例如: /path/to/your/key.pem" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </>
            )}
          </form>
        </Form>
        <DialogFooter className="pt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={createInstanceMutation.isPending}>
              取消
            </Button>
          </DialogClose>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={createInstanceMutation.isPending || !activeApiConfig}>
            {createInstanceMutation.isPending ? '创建中...' : '创建实例'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
