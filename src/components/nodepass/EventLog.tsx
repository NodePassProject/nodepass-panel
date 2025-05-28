
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss, ChevronRight, ChevronDown, Server, Smartphone } from 'lucide-react';
import type { Instance, InstanceEvent } from '@/types/nodepass';
import { getEventsUrl } from '@/lib/api'; 
import { InstanceStatusBadge } from './InstanceStatusBadge';

interface EventLogProps {
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
}

export function EventLog({ apiId, apiRoot, apiToken, apiName }: EventLogProps) {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEvents([]); 
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!apiId || !apiRoot || !apiToken || !apiName) {
      setEvents([{ type: 'log', data: `API 配置无效，事件流禁用。`, timestamp: new Date().toISOString() }]);
      return;
    }

    // Use the proxy
    const actualApiEventsUrl = getEventsUrl(apiRoot); 
    const proxyEventSourceUrl = `/api/events-proxy?targetUrl=${encodeURIComponent(actualApiEventsUrl)}&token=${encodeURIComponent(apiToken)}`;
    
    setEvents([{ type: 'log', data: `正在通过代理 ${proxyEventSourceUrl.split('?')[0]} 初始化事件流...`, timestamp: new Date().toISOString() }]);
    
    const newEventSource = new EventSource(proxyEventSourceUrl); 
    eventSourceRef.current = newEventSource;
    const currentEffectEventSource = newEventSource; // Capture for closure

    newEventSource.onopen = () => {
      if (eventSourceRef.current !== currentEffectEventSource) return; // Stale closure
      const existingMessages = events.filter(e => e.type === 'log' && !e.data.startsWith("正在通过代理"));
      setEvents([
        { type: 'log', data: `事件流已通过代理连接。等待事件... (目标: ${actualApiEventsUrl})`, timestamp: new Date().toISOString() },
        ...existingMessages
      ].slice(0,100)); // Keep max 100 events
    };

    newEventSource.addEventListener('instance', (event) => {
      if (eventSourceRef.current !== currentEffectEventSource) return;
      console.log('SSE "instance" event received from server:', event.data);
      try {
        const serverEventPayload = JSON.parse(event.data as string);
        let frontendEventType: InstanceEvent['type'];
        let frontendEventData: any = serverEventPayload; // Default to full payload for details
        let instanceDetailsPayload: Instance | undefined = serverEventPayload.instance;

        switch (serverEventPayload.type) {
          case 'initial':
          case 'create': // Changed from 'instance_created'
          case 'update': // Changed from 'instance_updated'
          case 'delete': // Changed from 'instance_deleted'
            frontendEventType = serverEventPayload.type;
            frontendEventData = instanceDetailsPayload || {}; // Use instance for primary data if available
            break;
          case 'log':
            frontendEventType = 'log';
            if (serverEventPayload.instance && serverEventPayload.logs) {
                 frontendEventData = `[${serverEventPayload.instance.id.substring(0,8)}] ${serverEventPayload.logs}`;
            } else {
                frontendEventData = serverEventPayload.logs || `[实例ID: ${instanceDetailsPayload?.id?.substring(0,8) || 'N/A'}] 未知日志内容`;
            }
            break;
          case 'shutdown':
            frontendEventType = 'log'; // Treat shutdown as a log message for UI
            frontendEventData = "主控服务即将关闭。事件流已停止。";
            if (eventSourceRef.current) eventSourceRef.current.close();
            break;
          default:
            console.warn("未知服务器事件类型:", serverEventPayload.type, serverEventPayload);
            frontendEventType = 'log'; 
            frontendEventData = `未知事件 ${serverEventPayload.type}: ${JSON.stringify(serverEventPayload.data || serverEventPayload.instance || serverEventPayload)}`;
            break;
        }

        const newEventToLog: InstanceEvent = {
          type: frontendEventType,
          data: frontendEventData, 
          instanceDetails: instanceDetailsPayload,
          timestamp: serverEventPayload.time || new Date().toISOString(),
        };
        setEvents((prevEvents) => [newEventToLog, ...prevEvents.slice(0, 99)]);
      } catch (error) {
        console.error("无法解析事件数据:", error, "原始数据:", event.data);
        const errorEventToLog: InstanceEvent = { type: 'log', data: `解析事件错误: ${event.data}`, timestamp: new Date().toISOString() };
        setEvents((prevEvents) => [errorEventToLog, ...prevEvents.slice(0, 99)]);
      }
    });
    
    newEventSource.onmessage = (event) => { // Fallback for unnamed events
        if (eventSourceRef.current !== currentEffectEventSource) return;
        console.log("收到通用 SSE 消息 (非 'instance' 事件):", event.data);
        const genericEvent: InstanceEvent = {
          type: 'log', 
          data: `通用消息: ${event.data}`,
          timestamp: new Date().toISOString()
        };
        setEvents((prevEvents) => [genericEvent, ...prevEvents.slice(0, 99)]);
    };

    newEventSource.onerror = (event: Event) => { 
      if (eventSourceRef.current !== currentEffectEventSource && currentEffectEventSource.readyState !== EventSource.CLOSED) return; 

      const rs = currentEffectEventSource.readyState;
      let uiErrorMessage: string;

      if (rs === EventSource.CONNECTING) { // 0
        uiErrorMessage = `EventSource (代理) 连接出错。检查网络、代理 (${proxyEventSourceUrl.split('?')[0]}) 及目标服务器 (${actualApiEventsUrl}) 日志。`;
      } else if (rs === EventSource.CLOSED) { // 2
        uiErrorMessage = `EventSource (代理) 连接已关闭。检查代理 (${proxyEventSourceUrl.split('?')[0]}) 及目标服务器 (${actualApiEventsUrl}) 日志。`;
      } else { // 1 (OPEN) - unusual to get error in OPEN state unless server sends error then closes
        uiErrorMessage = `EventSource (代理) 未知连接错误 (状态: ${rs})。检查代理及目标服务器日志。`;
      }
      
      console.error(uiErrorMessage); // Log the determined UI message to console as well for consistency
      
      const errorEventLog: InstanceEvent = { type: 'log', data: uiErrorMessage, timestamp: new Date().toISOString() };
      setEvents((prevEvents) => {
        // Avoid duplicate error messages if they are the same as the last one
        if (prevEvents.length > 0 && prevEvents[0].data === uiErrorMessage && prevEvents[0].type === 'log') {
          return prevEvents; 
        }
        return [errorEventLog, ...prevEvents.slice(0, 99)];
      });

      // The official doc suggests a timeout and retry, but EventSource does this automatically by default.
      // If automatic retry isn't working, manual retry could be added here, but it's usually not needed.
    };

    return () => {
      if (currentEffectEventSource) {
        currentEffectEventSource.close();
      }
      // Ensure the ref is cleared only if it's the one we set up in this effect
      if (eventSourceRef.current === currentEffectEventSource) {
         eventSourceRef.current = null;
      }
    };
  }, [apiId, apiRoot, apiToken, apiName]); // Dependencies


  const getBadgeTextAndVariant = (type: InstanceEvent['type']): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'accent' } => {
    switch (type) {
      case 'initial': return { text: '初始', variant: 'default' };
      case 'create': return { text: '创建', variant: 'default' }; // Use 'default' (primary) for creation
      case 'update': return { text: '更新', variant: 'secondary' };
      case 'delete': return { text: '删除', variant: 'destructive' };
      case 'log': return { text: '日志', variant: 'outline' };
      default: return { text: String(type), variant: 'outline'};
    }
  }
  
  const isExpandable = (event: InstanceEvent): boolean => {
    if (event.instanceDetails) return true;
    if (event.type === 'log' && typeof event.data === 'string' && event.data.length > 100) return true;
    // Check if data is an object and not null, and not already covered by instanceDetails
    if (event.type !== 'log' && typeof event.data === 'object' && event.data !== null && !event.instanceDetails) return true;
    return false;
  };

  return (
    <Card className="shadow-lg mt-6">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Rss className="mr-2 h-5 w-5 text-primary" />
          实时事件日志
        </CardTitle>
        <CardDescription>
          NodePass 实例实时更新 (API: {apiName || 'N/A'}，通过代理连接)。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 w-full rounded-md border p-3 bg-muted/20 text-xs" ref={scrollAreaRef}>
          {events.length === 0 && <p className="text-sm text-muted-foreground">无事件。</p>}
          {events.map((event, index) => {
            const isExpanded = expandedIndex === index;
            const { text: badgeText, variant: badgeVariant } = getBadgeTextAndVariant(event.type);
            const instance = event.instanceDetails;
            const canExpand = isExpandable(event);

            return (
              <div key={index} className="py-1.5 border-b border-border/30 last:border-b-0 last:pb-0 first:pt-0">
                <div 
                  className="flex items-start space-x-2" 
                  onClick={() => canExpand && setExpandedIndex(isExpanded ? null : index)}
                  role={canExpand ? "button" : undefined}
                  tabIndex={canExpand ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (canExpand && (e.key === 'Enter' || e.key === ' ')) {
                      setExpandedIndex(isExpanded ? null : index);
                    }
                  }}
                  style={canExpand ? { cursor: 'pointer' } : {}}
                >
                  <div className="flex items-center shrink-0 w-6 h-[1.125rem]">
                    {canExpand && (
                      isExpanded ? <ChevronDown className="h-4 w-4 " /> : <ChevronRight className="h-4 w-4 " />
                    )}
                  </div>
                  <Badge variant={badgeVariant} className="py-0.5 px-1.5 shadow-sm whitespace-nowrap">
                    {badgeText}
                  </Badge>
                  <div className="flex-grow min-w-0">
                    {event.type !== 'log' && instance ? (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight">
                        <span className="font-mono text-foreground/90">ID: {instance.id.substring(0, 8)}</span>
                        <Badge
                          variant={instance.type === 'server' ? 'default' : 'accent'}
                          className="px-1.5 py-0.5 text-xs whitespace-nowrap items-center"
                        >
                          {instance.type === 'server' ? <Server size={12} className="mr-1" /> : <Smartphone size={12} className="mr-1" />}
                          {instance.type === 'server' ? '服务器' : '客户端'}
                        </Badge>
                        <InstanceStatusBadge status={instance.status} />
                        <span className="font-mono truncate text-foreground/70" title={instance.url}>URL: {instance.url.length > 30 ? instance.url.substring(0, 27) + '...' : instance.url}</span>
                      </div>
                    ) : (
                      <p className="font-mono break-all whitespace-pre-wrap text-foreground/90 leading-relaxed">
                        {typeof event.data === 'string' && (isExpanded || !canExpand || event.data.length <= 70) ? event.data : `${String(event.data).substring(0, 70)}...`}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap ml-auto pl-2 self-start">
                    {new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                {isExpanded && canExpand && (
                  <div className="mt-2 ml-8 pl-4 border-l-2 border-muted/50 py-2 bg-background/30 rounded-r-md">
                    {instance ? (
                      <pre className="text-xs p-2 rounded-md overflow-x-auto bg-muted/40">
                        {JSON.stringify(instance, null, 2)}
                      </pre>
                    ) : event.type === 'log' && typeof event.data === 'string' ? (
                      <p className="font-mono break-all whitespace-pre-wrap text-foreground/90 leading-relaxed text-xs">
                        {event.data}
                      </p>
                    ) : typeof event.data === 'object' && event.data !== null ? (
                       <pre className="text-xs p-2 rounded-md overflow-x-auto bg-muted/40">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    ) : (
                       <p className="text-xs text-muted-foreground italic">无详情。</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
