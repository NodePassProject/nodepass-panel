
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, Server, Smartphone, RefreshCw } from 'lucide-react';
import { InstanceStatusBadge } from '@/components/nodepass/InstanceStatusBadge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

interface InstanceWithApiName extends Instance {
  apiName: string;
  apiId: string;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'server' | 'client';
  apiName: string;
}

interface Connection {
  from: string; // client instance id
  to: string;   // server instance id
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
}

// Helper function to parse tunnel_addr from NodePass URL string
function parseTunnelAddr(urlString: string): string | null {
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1) return null;

  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  
  const pathSeparatorIndex = restOfString.indexOf('/');
  const querySeparatorIndex = restOfString.indexOf('?');

  let endOfTunnelAddr = -1;

  if (pathSeparatorIndex !== -1 && querySeparatorIndex !== -1) {
    endOfTunnelAddr = Math.min(pathSeparatorIndex, querySeparatorIndex);
  } else if (pathSeparatorIndex !== -1) {
    endOfTunnelAddr = pathSeparatorIndex;
  } else if (querySeparatorIndex !== -1) {
    endOfTunnelAddr = querySeparatorIndex;
  }

  if (endOfTunnelAddr !== -1) {
    return restOfString.substring(0, endOfTunnelAddr);
  }
  return restOfString;
}


export default function TopologyPage() {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl: getApiRootUrlById, getToken: getTokenById } = useApiConfig();
  const [allInstances, setAllInstances] = useState<InstanceWithApiName[]>([]);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<Map<string, string>>(new Map());

  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [connections, setConnections] = useState<Connection[]>([]);

  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  const calculateLayout = useCallback(() => {
    if (allInstances.length === 0 || !svgContainerRef.current) return;

    const newPositions = new Map<string, NodePosition>();
    const svgRect = svgContainerRef.current.getBoundingClientRect();

    allInstances.forEach(inst => {
      const el = nodeRefs.current.get(inst.id);
      if (el) {
        // Calculate position relative to the svgContainerRef
        const elRect = el.getBoundingClientRect();
        newPositions.set(inst.id, {
          id: inst.id,
          type: inst.type,
          x: (el.offsetLeft + el.offsetWidth / 2) - svgContainerRef.current!.scrollLeft,
          y: (el.offsetTop + el.offsetHeight / 2) - svgContainerRef.current!.scrollTop,
          width: el.offsetWidth,
          height: el.offsetHeight,
          apiName: inst.apiName,
        });
      }
    });
    setNodePositions(newPositions);

    // Calculate connections
    const newConnections: Connection[] = [];
    const clientInstances = allInstances.filter(inst => inst.type === 'client');
    const serverInstances = allInstances.filter(inst => inst.type === 'server');

    clientInstances.forEach(client => {
      const clientTunnelAddr = parseTunnelAddr(client.url);
      const clientPos = newPositions.get(client.id);

      if (clientTunnelAddr && clientPos) {
        serverInstances.forEach(server => {
          const serverTunnelAddr = parseTunnelAddr(server.url);
          const serverPos = newPositions.get(server.id);
          
          // Check if server's listening address matches client's target tunnel address
          if (serverTunnelAddr && clientTunnelAddr === serverTunnelAddr && serverPos) {
            newConnections.push({ 
              from: client.id, 
              to: server.id,
              fromPos: { x: clientPos.x, y: clientPos.y },
              toPos: { x: serverPos.x, y: serverPos.y }
            });
          }
        });
      }
    });
    setConnections(newConnections);
  }, [allInstances]);


  useEffect(() => {
    const fetchAllInstances = async () => {
      if (isLoadingApiConfig || apiConfigsList.length === 0) {
        setIsLoadingInstances(false);
        if (!isLoadingApiConfig && apiConfigsList.length === 0) {
            setFetchErrors(prev => new Map(prev).set("global", "没有配置任何 API 连接。"));
        }
        return;
      }

      setIsLoadingInstances(true);
      setFetchErrors(new Map());
      let combinedInstances: InstanceWithApiName[] = [];
      let currentErrors = new Map<string, string>();

      for (const config of apiConfigsList) {
        const apiRoot = getApiRootUrlById(config.id);
        const token = getTokenById(config.id);

        if (!apiRoot || !token) {
          currentErrors.set(config.id, `API 配置 "${config.name}" 不完整或无效。`);
          continue;
        }

        try {
          const data = await nodePassApi.getInstances(apiRoot, token);
          combinedInstances.push(...data.map(inst => ({ ...inst, apiName: config.name, apiId: config.id })));
        } catch (err: any) {
          console.error(`加载实例失败，来自 API "${config.name}":`, err);
          currentErrors.set(config.id, `从 "${config.name}" 加载实例失败: ${err.message}`);
        }
      }
      
      setAllInstances(combinedInstances);
      setFetchErrors(currentErrors);
      setIsLoadingInstances(false);
    };
    fetchAllInstances();
  }, [apiConfigsList, isLoadingApiConfig, getApiRootUrlById, getTokenById]);

  useEffect(() => {
    if (allInstances.length > 0) {
      const handleResize = () => {
        // Using a timeout to ensure DOM has settled after resize
        setTimeout(calculateLayout, 150);
      };
      const timer = setTimeout(calculateLayout, 150); 

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        clearTimeout(timer);
      };
    }
  }, [allInstances, calculateLayout]);


  if (isLoadingApiConfig || isLoadingInstances) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">加载拓扑信息中...</p>
      </div>
    );
  }

  const globalError = fetchErrors.get("global");
  if (globalError) {
     return (
      <div className="container mx-auto px-4 py-8 text-center">
        <div className="text-destructive-foreground bg-destructive p-4 rounded-md inline-flex items-center">
          <AlertTriangle className="h-6 w-6 mr-2" />
          {globalError}
        </div>
        <Button onClick={() => router.push('/connections')} className="mt-4">前往连接管理</Button>
      </div>
    );
  }
  
  if (allInstances.length === 0 && !isLoadingInstances && fetchErrors.size === 0 && apiConfigsList.length > 0) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">所有已配置的 API 连接下均无实例可供显示拓扑。</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col h-[calc(100vh-6rem)]"> {/* Full height */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">实例连接拓扑图</h1>
         <Button variant="outline" onClick={calculateLayout} disabled={isLoadingInstances}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingInstances ? 'animate-spin' : ''}`} />
          刷新布局
        </Button>
      </div>
      <p className="text-muted-foreground text-sm mb-2">
        展示所有已配置 API 服务下的客户端与服务器实例间的连接关系 (基于 URL 推断)。
      </p>
      {fetchErrors.size > 0 && !globalError && (
        <div className="mb-4 space-y-2">
          {Array.from(fetchErrors.entries()).map(([apiId, errorMsg]) => (
            <div key={apiId} className="text-destructive-foreground bg-destructive p-3 rounded-md text-sm flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 shrink-0" />
              {errorMsg}
            </div>
          ))}
        </div>
      )}
      <div 
        ref={svgContainerRef}
        className="relative border p-4 rounded-lg shadow-lg flex-grow bg-muted/20 overflow-auto" // flex-grow to take available space
      >
        <svg width="100%" height="100%" className="absolute top-0 left-0 pointer-events-none z-0" style={{minWidth: '800px', minHeight: '600px'}}> {/* Ensure SVG is large enough */}
          {connections.map((conn, index) => (
            <line
              key={`conn-${index}-${conn.from}-${conn.to}`}
              x1={conn.fromPos.x}
              y1={conn.fromPos.y}
              x2={conn.toPos.x}
              y2={conn.toPos.y}
              stroke="hsl(var(--primary))"
              strokeWidth="1.5"
              markerEnd="url(#arrowhead)"
            />
          ))}
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                  refX="9" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"> 
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
            </marker>
          </defs>
        </svg>

        <div className="relative z-10 flex flex-wrap gap-6 p-4 items-start"> {/* Container for all nodes */}
          {allInstances.map(instance => (
            <div
              key={instance.id}
              id={`node-${instance.id}`}
              ref={el => { if(el) nodeRefs.current.set(instance.id, el); else nodeRefs.current.delete(instance.id); }}
              className="p-3 border rounded-md shadow-sm bg-card hover:shadow-md transition-shadow cursor-default break-words w-52 flex flex-col space-y-1"
              title={`ID: ${instance.id}\nURL: ${instance.url}\n来源 API: ${instance.apiName}\n类型: ${instance.type}`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm truncate">
                  {instance.type === 'server' ? 
                    <Server className="inline h-4 w-4 mr-1 text-blue-500"/> : 
                    <Smartphone className="inline h-4 w-4 mr-1 text-green-500"/>}
                  {instance.id.substring(0,8)}...
                </p>
                <InstanceStatusBadge status={instance.status} />
              </div>
              <Badge variant="secondary" className="text-xs self-start px-1.5 py-0.5">{instance.apiName}</Badge>
              <p className="text-xs text-muted-foreground truncate" title={instance.url}>
                {instance.type === 'client' ? `客户端连接到: ${parseTunnelAddr(instance.url) || 'N/A'}` : `服务器监听: ${parseTunnelAddr(instance.url) || 'N/A'}`}
              </p>
            </div>
          ))}
          {allInstances.length === 0 && fetchErrors.size === 0 && !isLoadingInstances && (
             <p className="text-muted-foreground w-full text-center py-10">在所有配置的API中均未找到实例。</p>
          )}
        </div>
      </div>
    </div>
  );
}

    