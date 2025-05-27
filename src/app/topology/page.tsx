
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, Network } from 'lucide-react';
import { InstanceStatusBadge } from '@/components/nodepass/InstanceStatusBadge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'server' | 'client';
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

  // Get the part after "scheme://"
  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  
  // Find the first occurrence of '/' or '?'
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
  // If no '/' or '?', the rest of the string is the tunnel_addr
  return restOfString;
}


export default function TopologyPage() {
  const router = useRouter();
  const { activeApiConfig, getApiRootUrl, getToken, isLoading: isLoadingApiConfig } = useApiConfig();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [connections, setConnections] = useState<Connection[]>([]);

  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const svgContainerRef = useRef<HTMLDivElement | null>(null); // Changed to Div for relative positioning

  const calculateLayout = useCallback(() => {
    if (instances.length === 0 || !svgContainerRef.current) return;

    const serverNodes: Instance[] = instances.filter(inst => inst.type === 'server');
    const clientNodes: Instance[] = instances.filter(inst => inst.type === 'client');
    
    const newPositions = new Map<string, NodePosition>();
    const svgRect = svgContainerRef.current.getBoundingClientRect();

    // Calculate positions for server nodes
    serverNodes.forEach(inst => {
      const el = nodeRefs.current.get(`server-${inst.id}`);
      if (el) {
        const elRect = el.getBoundingClientRect();
        newPositions.set(inst.id, {
          id: inst.id,
          type: 'server',
          x: el.offsetLeft + el.offsetWidth / 2, // relative to parent
          y: el.offsetTop + el.offsetHeight / 2,  // relative to parent
          width: el.offsetWidth,
          height: el.offsetHeight,
        });
      }
    });

    // Calculate positions for client nodes
    clientNodes.forEach(inst => {
      const el = nodeRefs.current.get(`client-${inst.id}`);
       if (el) {
        const elRect = el.getBoundingClientRect();
        newPositions.set(inst.id, {
          id: inst.id,
          type: 'client',
          x: el.offsetLeft + el.offsetWidth / 2, // relative to parent
          y: el.offsetTop + el.offsetHeight / 2,  // relative to parent
          width: el.offsetWidth,
          height: el.offsetHeight,
        });
      }
    });
    setNodePositions(newPositions);

    // Calculate connections
    const newConnections: Connection[] = [];
    clientNodes.forEach(client => {
      const clientTunnelAddr = parseTunnelAddr(client.url);
      const clientPos = newPositions.get(client.id);

      if (clientTunnelAddr && clientPos) {
        serverNodes.forEach(server => {
          const serverTunnelAddr = parseTunnelAddr(server.url);
          const serverPos = newPositions.get(server.id);
          
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
  }, [instances]);


  useEffect(() => {
    const fetchInstances = async () => {
      const apiRoot = getApiRootUrl();
      const token = getToken();

      if (!activeApiConfig || !apiRoot || !token) {
        if (!isLoadingApiConfig) { // Only set error if config loading is done
            setError("请先选择或添加一个有效的 API 连接。");
            setInstances([]);
        }
        setIsLoadingInstances(false);
        return;
      }

      setIsLoadingInstances(true);
      setError(null);
      try {
        const data = await nodePassApi.getInstances(apiRoot, token);
        setInstances(data);
      } catch (err: any) {
        setError(`加载实例失败: ${err.message}`);
        setInstances([]);
      } finally {
        setIsLoadingInstances(false);
      }
    };
    if(!isLoadingApiConfig){ // Ensure API config is loaded before fetching instances
        fetchInstances();
    }
  }, [activeApiConfig, getApiRootUrl, getToken, isLoadingApiConfig]);

  useEffect(() => {
    // Recalculate layout when instances change or on window resize
    if (instances.length > 0) {
      // Debounce or throttle resize handler for performance
      const handleResize = () => {
        calculateLayout();
      };
      // Initial calculation
      const timer = setTimeout(calculateLayout, 150); // give DOM time to settle

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        clearTimeout(timer);
      };
    }
  }, [instances, calculateLayout]);


  if (isLoadingApiConfig || isLoadingInstances) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">加载拓扑信息中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <div className="text-destructive-foreground bg-destructive p-4 rounded-md inline-flex items-center">
          <AlertTriangle className="h-6 w-6 mr-2" />
          {error}
        </div>
        { !activeApiConfig && 
          <Button onClick={() => router.push('/connections')} className="mt-4">前往连接管理</Button>
        }
      </div>
    );
  }
  
  if (!activeApiConfig && !isLoadingApiConfig) {
     return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground mb-4">请先激活一个 API 连接以查看拓扑。</p>
        <Button onClick={() => router.push('/connections')}>前往连接管理</Button>
      </div>
    );
  }
  
  if (instances.length === 0 && !isLoadingInstances) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">当前 API 连接下没有实例可供显示拓扑。</p>
      </div>
    );
  }
  
  const serverInstances = instances.filter(inst => inst.type === 'server');
  const clientInstances = instances.filter(inst => inst.type === 'client');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">实例连接拓扑图</h1>
         <Button variant="outline" onClick={calculateLayout}>
          刷新布局
        </Button>
      </div>
      <p className="text-muted-foreground text-center mb-8">
        展示当前活动 API 配置下的客户端与服务器实例间的连接关系 (基于 URL 推断)。
      </p>
      <div 
        ref={svgContainerRef}
        className="relative border p-4 rounded-lg shadow-lg min-h-[600px] bg-muted/20 overflow-auto"
      >
        <svg width="100%" height="100%" className="absolute top-0 left-0 pointer-events-none z-0" style={{minHeight: '600px'}}>
          {connections.map((conn, index) => (
            <line
              key={`conn-${index}`}
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
                  refX="9" refY="3.5" orient="auto-start-reverse"> 
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
            </marker>
          </defs>
        </svg>

        <div className="flex flex-col md:flex-row justify-around items-start h-full relative z-10">
          {/* Server Instances Column */}
          <div className="w-full md:w-2/5 lg:w-1/3 space-y-3 p-2">
            <h2 className="text-xl font-semibold text-center mb-4 sticky top-0 bg-muted/20 py-2 z-20 backdrop-blur-sm">服务器实例</h2>
            {serverInstances.map(instance => (
              <div
                key={instance.id}
                id={`node-server-${instance.id}`}
                ref={el => nodeRefs.current.set(`server-${instance.id}`, el)}
                className="p-3 border rounded-md shadow-sm bg-card hover:shadow-lg transition-shadow cursor-pointer break-words"
                title={`ID: ${instance.id}\nURL: ${instance.url}`}
              >
                <p className="font-semibold text-sm truncate">ID: {instance.id.substring(0,8)}...</p>
                <p className="text-xs text-muted-foreground truncate">URL: {instance.url}</p>
                <div className="mt-1 flex justify-between items-center">
                  <InstanceStatusBadge status={instance.status} />
                   <span className="text-xs text-muted-foreground">{parseTunnelAddr(instance.url)}</span>
                </div>
              </div>
            ))}
            {serverInstances.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">无服务器实例</p>}
          </div>

          {/* Client Instances Column */}
          <div className="w-full md:w-2/5 lg:w-1/3 space-y-3 p-2 mt-8 md:mt-0">
             <h2 className="text-xl font-semibold text-center mb-4 sticky top-0 bg-muted/20 py-2 z-20 backdrop-blur-sm">客户端实例</h2>
            {clientInstances.map(instance => (
              <div
                key={instance.id}
                id={`node-client-${instance.id}`}
                ref={el => nodeRefs.current.set(`client-${instance.id}`, el)}
                className="p-3 border rounded-md shadow-sm bg-card hover:shadow-lg transition-shadow cursor-pointer break-words"
                title={`ID: ${instance.id}\nURL: ${instance.url}\nConnects to: ${parseTunnelAddr(instance.url) || 'N/A'}`}
              >
                <p className="font-semibold text-sm truncate">ID: {instance.id.substring(0,8)}...</p>
                 <p className="text-xs text-muted-foreground truncate">URL: {instance.url}</p>
                 <div className="mt-1 flex justify-between items-center">
                  <InstanceStatusBadge status={instance.status} />
                  <span className="text-xs text-muted-foreground"> -&gt; {parseTunnelAddr(instance.url)}</span>
                </div>
              </div>
            ))}
            {clientInstances.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">无客户端实例</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

