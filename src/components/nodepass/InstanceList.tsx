
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
import { nodePassApi, getApiBaseUrl } from '@/lib/api';
import { useApiKey } from '@/hooks/use-api-key';
import { Skeleton } from '@/components/ui/skeleton';

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
  const { apiKey } = useApiKey();

  const [selectedInstanceForDetails, setSelectedInstanceForDetails] = useState<Instance | null>(null);
  const [selectedInstanceForDelete, setSelectedInstanceForDelete] = useState<Instance | null>(null);
  const [selectedInstanceForOptimize, setSelectedInstanceForOptimize] = useState<Instance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: instances, isLoading: isLoadingInstances, error: instancesError } = useQuery<Instance[], Error>({
    queryKey: ['instances', apiKey],
    queryFn: () => {
      if (!apiKey) throw new Error("API key is not available.");
      return nodePassApi.getInstances(apiKey);
    },
    enabled: !!apiKey,
    refetchInterval: 15000, // Poll for updates every 15 seconds
  });

  // Real-time event handling (simplified due to EventSource auth limitations)
  // This effect primarily demonstrates where SSE logic would go.
  // True SSE might require server changes for API key auth via query param.
  useEffect(() => {
    if (!apiKey) return;

    const eventsUrl = `${getApiBaseUrl()}/events`; // Potentially add ?apiKey=${apiKey} if server supports
    // console.log(`Attempting to connect to EventSource: ${eventsUrl} (API key would be in header if possible)`);
    // For now, actual EventSource connection is commented out due to header auth limitations.
    // Updates are primarily driven by query refetching and mutations.

    /*
    const eventSource = new EventSource(eventsUrl); // This won't send X-API-Key header

    eventSource.onmessage = (event) => {
      console.log("SSE Event Received:", event.data);
      try {
        const parsedData = JSON.parse(event.data);
        // Example: if (parsedData.type === 'instance_updated') { queryClient.invalidateQueries(['instances']); }
        // This part needs robust logic based on actual event structure.
        queryClient.invalidateQueries({ queryKey: ['instances'] });
        toast({ title: "Instance Update", description: "An instance was updated." });
      } catch (e) {
        console.error("Failed to parse SSE event data:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      // eventSource.close(); // May want to retry or handle differently
    };
    
    return () => {
      eventSource.close();
    };
    */
  }, [apiKey, queryClient, toast]);


  const updateInstanceMutation = useMutation({
    mutationFn: ({ instanceId, action }: { instanceId: string, action: UpdateInstanceRequest['action']}) => {
      if (!apiKey) throw new Error("API key is not available.");
      return nodePassApi.updateInstance(instanceId, { action }, apiKey);
    },
    onSuccess: (data) => {
      toast({
        title: 'Instance Updated',
        description: `Instance ${data.id} status changed to ${data.status}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['instances'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error Updating Instance',
        description: error.message || 'An unknown error occurred.',
        variant: 'destructive',
      });
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: (instanceId: string) => {
      if (!apiKey) throw new Error("API key is not available.");
      return nodePassApi.deleteInstance(instanceId, apiKey);
    },
    onSuccess: (_, instanceId) => {
      toast({
        title: 'Instance Deleted',
        description: `Instance ${instanceId} has been deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      setSelectedInstanceForDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error Deleting Instance',
        description: error.message || 'An unknown error occurred.',
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

  return (
    <Card className="shadow-lg mt-6">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <CardTitle className="text-xl">Instance Overview</CardTitle>
          <p className="text-sm text-muted-foreground">Manage and monitor your NodePass instances.</p>
        </div>
        <div className="relative mt-4 sm:mt-0 w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search instances..."
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
            Error loading instances: {instancesError.message}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="text-center whitespace-nowrap"><ArrowDown className="inline mr-1 h-4 w-4"/>TCP Rx/Tx</TableHead>
                <TableHead className="text-center whitespace-nowrap"><ArrowUp className="inline mr-1 h-4 w-4"/>UDP Rx/Tx</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                        {instance.type}
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
                          <span className="sr-only">View Details</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedInstanceForOptimize(instance)}>
                          <Wand2 className="h-4 w-4" />
                          <span className="sr-only">Optimize</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setSelectedInstanceForDelete(instance)}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24">
                    {searchTerm ? "No instances found matching your search." : "No instances available."}
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
