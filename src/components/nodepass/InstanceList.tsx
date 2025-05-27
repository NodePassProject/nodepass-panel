
"use client";

import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Eye, Trash2, Wand2, ArrowDown, ArrowUp, Server, Smartphone, Search } from 'lucide-react';
import type { Instance, UpdateInstanceRequest } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { InstanceControls } from './InstanceControls';
import { DeleteInstanceDialog } from './DeleteInstanceDialog';
import { InstanceDetailsModal } from './InstanceDetailsModal';
import { OptimizeInstanceDialog } from './OptimizeInstanceDialog';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi, getEventsUrl } from '@/lib/api';
import { useApiConfig } from '@/hooks/use-api-key';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge'; // Added import for Badge

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}


export function InstanceList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getApiRootUrl, getToken, apiConfig } = useApiConfig();

  const [selectedInstanceForDetails, setSelectedInstanceForDetails] = useState<Instance | null>(null);
  const [selectedInstanceForDelete, setSelectedInstanceForDelete] = useState<Instance | null>(null);
  const [selectedInstanceForOptimize, setSelectedInstanceForOptimize] = useState<Instance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const apiRootUrl = getApiRootUrl();
  const token = getToken();

  const { data: instances, isLoading: isLoadingInstances, error: instancesError } = useQuery<Instance[], Error>({
    queryKey: ['instances', apiRootUrl, token],
    queryFn: () => {
      if (!apiRootUrl || !token) throw new Error("API 配置不可用。");
      return nodePassApi.getInstances(apiRootUrl, token);
    },
    enabled: !!apiRootUrl && !!token,
    refetchInterval: 15000, 
  });

  useEffect(() => {
    if (!apiRootUrl || !token) return;

    const sseUrl = getEventsUrl(apiRootUrl, token);
    // Actual EventSource connection logic would go here if SSE authentication is handled.
    // For now, updates are primarily driven by query refetching and mutations.
    /*
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      console.log("SSE Event Received:", event.data);
      try {
        const parsedData = JSON.parse(event.data);
        queryClient.invalidateQueries({ queryKey: ['instances'] });
        toast({ title: "实例更新", description: "一个实例已更新。" });
      } catch (e) {
        console.error("无法解析 SSE 事件数据:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource 失败:", err);
    };
    
    return () => {
      eventSource.close();
    };
    */
  }, [apiRootUrl, token, queryClient, toast]);


  const updateInstanceMutation = useMutation({
    mutationFn: ({ instanceId, action }: { instanceId: string, action: UpdateInstanceRequest['action']}) => {
      if (!apiRootUrl || !token) throw new Error("API 配置不可用。");
      return nodePassApi.updateInstance(instanceId, { action }, apiRootUrl, token);
    },
    onSuccess: (data) => {
      toast({
        title: '实例已更新',
        description: `实例 ${data.id} 状态已更改为 ${data.status}。`,
      });
      queryClient.invalidateQueries({ queryKey: ['instances', apiRootUrl, token] });
    },
    onError: (error: any) => {
      toast({
        title: '更新实例出错',
        description: error.message || '发生未知错误。',
        variant: 'destructive',
      });
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: (instanceId: string) => {
      if (!apiRootUrl || !token) throw new Error("API 配置不可用。");
      return nodePassApi.deleteInstance(instanceId, apiRootUrl, token);
    },
    onSuccess: (_, instanceId) => {
      toast({
        title: '实例已删除',
        description: `实例 ${instanceId} 已删除。`,
      });
      queryClient.invalidateQueries({ queryKey: ['instances', apiRootUrl, token] });
      setSelectedInstanceForDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: '删除实例出错',
        description: error.message || '发生未知错误。',
        variant: 'destructive',
      });
    },
  });

  const filteredInstances = instances?.filter(instance =>
    instance.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instance.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instance.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderSkeletons = () => (
    Array.from({ length: 3 }).map((_, i) => (
      <TableRow key={`skeleton-${i}`}>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      </TableRow>
    ))
  );

  if (!apiConfig && !isLoadingInstances) { // Check if apiConfig is missing and not loading
     return null; // Or some placeholder indicating API config is needed
  }

  return (
    <Card className="shadow-lg mt-6">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <CardTitle className="text-xl">实例概览</CardTitle>
          <p className="text-sm text-muted-foreground">管理和监控您的 NodePass 实例。</p>
        </div>
        <div className="relative mt-4 sm:mt-0 w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索实例..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 w-full"
          />
        </div>
      </CardHeader>
      <CardContent>
        {instancesError && (
          <div className="text-destructive-foreground bg-destructive p-4 rounded-md flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            加载实例错误: {instancesError.message}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="text-center whitespace-nowrap"><ArrowDown className="inline mr-1 h-4 w-4"/>TCP Rx/Tx</TableHead>
                <TableHead className="text-center whitespace-nowrap"><ArrowUp className="inline mr-1 h-4 w-4"/>UDP Rx/Tx</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingInstances && !instancesError ? renderSkeletons() :
                filteredInstances && filteredInstances.length > 0 ? (
                filteredInstances.map((instance) => (
                  <TableRow key={instance.id}>
                    <TableCell className="font-medium truncate max-w-xs">{instance.id}</TableCell>
                    <TableCell>
                      <Badge variant={instance.type === 'server' ? 'outline' : 'secondary'} className="capitalize items-center">
                        {instance.type === 'server' ? <Server className="h-3 w-3 mr-1" /> : <Smartphone className="h-3 w-3 mr-1" />}
                        {instance.type === 'server' ? '服务器' : '客户端'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <InstanceStatusBadge status={instance.status} />
                    </TableCell>
                    <TableCell className="truncate max-w-sm text-xs font-mono">{instance.url}</TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">
                      {formatBytes(instance.tcprx)} / {formatBytes(instance.tcptx)}
                    </TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">
                      {formatBytes(instance.udprx)} / {formatBytes(instance.udptx)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center space-x-1">
                        <InstanceControls 
                            instance={instance} 
                            onAction={(id, action) => updateInstanceMutation.mutate({ instanceId: id, action })}
                            isLoading={updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedInstanceForDetails(instance)}>
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">查看详情</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedInstanceForOptimize(instance)}>
                          <Wand2 className="h-4 w-4" />
                          <span className="sr-only">优化</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setSelectedInstanceForDelete(instance)}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">删除</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24">
                    {searchTerm ? "未找到与您搜索匹配的实例。" : apiConfig ? "无可用实例。" : "请先配置API。"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <InstanceDetailsModal
        instance={selectedInstanceForDetails}
        open={!!selectedInstanceForDetails}
        onOpenChange={(open) => !open && setSelectedInstanceForDetails(null)}
      />
      <DeleteInstanceDialog
        instance={selectedInstanceForDelete}
        open={!!selectedInstanceForDelete}
        onOpenChange={(open) => !open && setSelectedInstanceForDelete(null)}
        onConfirmDelete={(id) => deleteInstanceMutation.mutate(id)}
        isLoading={deleteInstanceMutation.isPending}
      />
      <OptimizeInstanceDialog
        instance={selectedInstanceForOptimize}
        open={!!selectedInstanceForOptimize}
        onOpenChange={(open) => !open && setSelectedInstanceForOptimize(null)}
      />
    </Card>
  );
}
