
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss, ChevronRight, ChevronDown, Server, Smartphone } from 'lucide-react';
import type { Instance } from '@/types/nodepass'; // Ensure Instance is imported
import { getEventsUrl } from '@/lib/api';
import { InstanceStatusBadge } from './InstanceStatusBadge';

// Define InstanceEvent directly in this file if it's not globally defined or correctly imported
// For consistency, ensure this matches the definition in src/types/nodepass.ts
export interface InstanceEvent {
  type: 'initial' | 'create' | 'update' | 'delete' | 'log' | 'shutdown' | 'error'; // Added 'error' for UI errors
  data: any;
  instanceDetails?: Instance;
  timestamp: string;
}


interface EventLogProps {
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
}

export function EventLog({ apiId, apiRoot, apiToken, apiName }: EventLogProps) {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const processSseMessage = useCallback((messageBlock: string) => {
    let eventType = 'message'; // Default event type
    let eventDataLine = '';

    const lines = messageBlock.split('\n');
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        eventDataLine = line.substring('data:'.length).trim();
      }
    }

    if (eventType === 'instance' && eventDataLine) {
      try {
        const serverEventPayload = JSON.parse(eventDataLine);
        let frontendEventType: InstanceEvent['type'];
        let frontendEventData: any = serverEventPayload;
        let instanceDetailsPayload: Instance | undefined = serverEventPayload.instance;

        switch (serverEventPayload.type) {
          case 'initial':
          case 'create':
          case 'update':
          case 'delete':
            frontendEventType = serverEventPayload.type;
            frontendEventData = instanceDetailsPayload || {}; // Store instance object in data
            break;
          case 'log':
            frontendEventType = 'log';
            // Logs from server might be in serverEventPayload.logs
            frontendEventData = serverEventPayload.logs || `日志事件，但缺少 .logs 字段: ${JSON.stringify(serverEventPayload)}`;
            break;
          case 'shutdown':
            frontendEventType = 'shutdown';
            frontendEventData = "主控服务即将关闭。事件流已停止。";
            if (abortControllerRef.current) {
              abortControllerRef.current.abort(); // Stop further processing/reconnection
            }
            break;
          default:
            console.warn("未知服务器事件类型 (fetch):", serverEventPayload.type, serverEventPayload);
            frontendEventType = 'log'; // Treat as a log for now
            frontendEventData = `未知事件 ${serverEventPayload.type}: ${JSON.stringify(serverEventPayload.data || serverEventPayload.instance || serverEventPayload)}`;
            break;
        }

        const newEventToLog: InstanceEvent = {
          type: frontendEventType,
          data: frontendEventData,
          instanceDetails: instanceDetailsPayload, // Also store instance separately if available
          timestamp: serverEventPayload.time || new Date().toISOString(),
        };
        setEvents((prevEvents) => [newEventToLog, ...prevEvents.slice(0, 99)]);
      } catch (error) {
        console.error("无法解析事件数据 (fetch):", error, "原始数据:", eventDataLine);
        const errorEventToLog: InstanceEvent = { type: 'log', data: `解析事件错误 (fetch): ${eventDataLine}`, timestamp: new Date().toISOString() };
        setEvents((prevEvents) => [errorEventToLog, ...prevEvents.slice(0, 99)]);
      }
    } else if (eventDataLine) {
      console.log("收到通用 SSE 消息 (fetch, 非 'instance' 事件):", eventDataLine);
      const genericEvent: InstanceEvent = {
        type: 'log',
        data: `通用消息 (fetch): ${eventDataLine}`,
        timestamp: new Date().toISOString()
      };
      setEvents((prevEvents) => [genericEvent, ...prevEvents.slice(0, 99)]);
    }
  }, []);


  const connectWithFetch = useCallback(async () => {
    if (!apiId || !apiRoot || !apiToken || !apiName) {
      setEvents([{ type: 'log', data: `API 配置无效，事件流 (fetch) 禁用。`, timestamp: new Date().toISOString() }]);
      setIsConnected(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort(); // Abort previous connection
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const eventsUrl = getEventsUrl(apiRoot);
    setEvents([{ type: 'log', data: `正在初始化事件流 (fetch) 到 ${eventsUrl} (携带 X-API-Key)...`, timestamp: new Date().toISOString() }]);
    setIsConnected(false);

    try {
      const response = await fetch(eventsUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': apiToken,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP 错误: ${response.status} ${response.statusText}. Details: ${errorText.substring(0, 200)}`);
      }

      if (!response.body) {
        throw new Error("响应体为空，无法读取事件流。");
      }
      
      setIsConnected(true);
      setEvents(prev => [{ type: 'log', data: `事件流 (fetch) 已连接。等待事件... (目标: ${eventsUrl})`, timestamp: new Date().toISOString() }, ...prev.filter(e => !e.data.startsWith('正在初始化'))]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (signal.aborted || done) {
          console.log(`事件流 (fetch) ${signal.aborted ? '已中止' : '已关闭 (done)'}。`);
          setIsConnected(false);
          if (!signal.aborted) { // Only reconnect if not intentionally aborted
            reconnectTimeoutRef.current = setTimeout(() => connectWithFetch(), 5000);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const messageBlocks = buffer.split('\n\n'); // SSE messages are separated by double newlines
        buffer = messageBlocks.pop() || ''; // Keep the last incomplete message block

        for (const block of messageBlocks) {
          if (block.trim() !== '') {
            processSseMessage(block);
          }
        }
      }
    } catch (error: any) {
      if (signal.aborted) {
        console.log('SSE 连接 (fetch) 已由客户端中止。');
        setEvents(prev => [{ type: 'log', data: `SSE 连接 (fetch) 已中止。`, timestamp: new Date().toISOString() }, ...prev]);
      } else {
        let specificHint = '';
        if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
          specificHint = ' 这通常是由CORS策略阻止跨域请求，或网络连接问题引起的。请检查目标服务器是否配置了正确的CORS头部 (例如 Access-Control-Allow-Origin) 以允许来自您应用源的请求，并确认网络通畅。';
        }
        const errorMessage = `SSE 连接 (fetch) 错误: ${error.message || '未知错误'}${specificHint} (目标: ${eventsUrl})。5秒后尝试重连...`;
        console.error(errorMessage, error); // Log the original error object for more details
        setEvents(prev => [{ type: 'log', data: errorMessage, timestamp: new Date().toISOString() }, ...prev]);
        reconnectTimeoutRef.current = setTimeout(() => connectWithFetch(), 5000);
      }
      setIsConnected(false);
    }
  }, [apiId, apiRoot, apiToken, apiName, processSseMessage]);

  useEffect(() => {
    connectWithFetch();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
       setEvents(prev => [{ type: 'log', data: `事件流 (fetch) 已断开。`, timestamp: new Date().toISOString() }, ...prev.slice(0,99)]);
       setIsConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiId]); // Re-run connectWithFetch if apiId changes, connectWithFetch itself has other deps

  const getBadgeTextAndVariant = (type: InstanceEvent['type']): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'accent' } => {
    switch (type) {
      case 'initial': return { text: '初始', variant: 'default' };
      case 'create': return { text: '创建', variant: 'default' }; // Greenish/Default
      case 'update': return { text: '更新', variant: 'secondary' }; // Bluish/Secondary
      case 'delete': return { text: '删除', variant: 'destructive' }; // Reddish
      case 'log': return { text: '日志', variant: 'outline' }; // Neutral/Outline
      case 'shutdown': return { text: '关闭', variant: 'destructive'};
      case 'error': return { text: '错误', variant: 'destructive'}; // For UI errors
      default: return { text: String(type), variant: 'outline'};
    }
  };

  const isExpandable = (event: InstanceEvent): boolean => {
    if (event.instanceDetails) return true;
    if (event.type === 'log' && typeof event.data === 'string' && event.data.length > 100) return true; // Expand long log messages
    if (['initial', 'create', 'update', 'delete'].includes(event.type) && typeof event.data === 'object' && event.data !== null && !event.instanceDetails) return true; // If data is object but not yet in instanceDetails
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
          NodePass 实例实时更新 (API: {apiName || 'N/A'}，通过 Fetch API 连接)。
          状态: <span className={`font-semibold ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
            {isConnected ? '已连接' : '未连接'}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 w-full rounded-md border p-3 bg-muted/20 text-xs" ref={scrollAreaRef}>
          {events.length === 0 && <p className="text-sm text-muted-foreground">无事件。</p>}
          {events.map((event, index) => {
            const isExpanded = expandedIndex === index;
            const { text: badgeText, variant: badgeVariant } = getBadgeTextAndVariant(event.type);
            const instance = event.instanceDetails; // Use the separate instanceDetails field
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
                        <span className="font-mono text-foreground/90">ID: {instance.id.substring(0, 8)}...</span>
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
