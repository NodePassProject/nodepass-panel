
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss } from 'lucide-react';
import type { Instance, InstanceEvent } from '@/types/nodepass';
import { getEventsUrl } from '@/lib/api';
import { InstanceStatusBadge } from './InstanceStatusBadge'; // Import for colored status

interface EventLogProps {
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
}

export function EventLog({ apiId, apiRoot, apiToken, apiName }: EventLogProps) {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let currentEventSource: EventSource | null = null;

    if (!apiId || !apiRoot || !apiToken) {
      const reason = !apiId ? "API 连接未激活" : "活动 API 配置的 URL 或令牌无效";
      setEvents([{ type: 'log', data: `${reason}。事件流（直接连接）已禁用。`, timestamp: new Date().toISOString() }]);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }
    
    const directEventsUrl = getEventsUrl(apiRoot); 

    const initialMessage = `正在直接初始化事件流到 ${directEventsUrl}... (注意：EventSource 无法发送 X-API-Key 进行认证，如果服务器需要，可能会失败)`;
    
    setEvents([{ type: 'log', data: initialMessage, timestamp: new Date().toISOString() }]);
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const newEventSource = new EventSource(directEventsUrl);
    eventSourceRef.current = newEventSource;
    currentEventSource = newEventSource;


    newEventSource.onopen = () => {
      if (currentEventSource !== newEventSource) return; 
      setEvents((prevEvents) => [{ type: 'log', data: `事件流已直接连接。等待事件... (目标: ${directEventsUrl})`, timestamp: new Date().toISOString() }, ...prevEvents.filter(e => e.data !== initialMessage && e.data !== `事件流已直接连接。等待事件... (目标: ${directEventsUrl})`).slice(0,99)]);
    };

    newEventSource.addEventListener('instance', (event) => {
      if (currentEventSource !== newEventSource) return; 
      console.log('SSE "instance" event received from server (direct):', event.data);
      try {
        const serverEventPayload = JSON.parse(event.data as string);
        let frontendEventType: InstanceEvent['type'];
        let frontendEventData: any;

        switch (serverEventPayload.type) {
          case 'initial':
            frontendEventType = 'instance_created';
            frontendEventData = serverEventPayload.instance;
            break;
          case 'update':
            frontendEventType = 'instance_updated';
            frontendEventData = serverEventPayload.instance;
            break;
          case 'delete':
            frontendEventType = 'instance_deleted';
            frontendEventData = serverEventPayload.instance;
            break;
          case 'log':
            frontendEventType = 'log';
            // For log events, data might be just the log string, or an object with logs and instance
            frontendEventData = serverEventPayload.logs || `[实例ID: ${serverEventPayload.instance?.id?.substring(0,8) || 'N/A'}] 未知日志内容`;
            if (serverEventPayload.instance && serverEventPayload.logs) {
                 frontendEventData = `[${serverEventPayload.instance.id.substring(0,8)}] ${serverEventPayload.logs}`;
            }
            break;
          default:
            console.warn("未知服务器事件类型 (direct):", serverEventPayload.type, serverEventPayload);
            frontendEventType = 'log'; 
            frontendEventData = `未知事件 ${serverEventPayload.type}: ${JSON.stringify(serverEventPayload.data || serverEventPayload.instance || serverEventPayload)}`;
            break;
        }

        const newEventToLog: InstanceEvent = {
          type: frontendEventType,
          data: frontendEventData, // This will be instance object or log string
          instanceDetails: (frontendEventType !== 'log' && serverEventPayload.instance) ? serverEventPayload.instance : undefined,
          timestamp: serverEventPayload.time || new Date().toISOString(),
        };
        setEvents((prevEvents) => [newEventToLog, ...prevEvents.slice(0, 99)]);
      } catch (error) {
        console.error("无法解析事件数据 (direct):", error, "原始数据:", event.data);
        const errorEventToLog: InstanceEvent = { type: 'log', data: `解析事件错误: ${event.data}`, timestamp: new Date().toISOString() };
        setEvents((prevEvents) => [errorEventToLog, ...prevEvents.slice(0, 99)]);
      }
    });
    
    newEventSource.onmessage = (event) => {
        if (currentEventSource !== newEventSource) return;
        console.log("收到通用 SSE 消息 (非 'instance' 事件, direct):", event.data);
        const genericEvent: InstanceEvent = {
          type: 'log',
          data: `通用消息: ${event.data}`,
          timestamp: new Date().toISOString()
        };
        setEvents((prevEvents) => [genericEvent, ...prevEvents.slice(0, 99)]);
    };

    newEventSource.onerror = (event: Event) => { 
      if (currentEventSource !== newEventSource) return; 
      console.error(
        `EventSource 错误 (客户端). ReadyState: ${newEventSource.readyState}. ` +
        `直接连接到: ${directEventsUrl}. ` +
        `客户端事件对象 (如下所示) 通常缺乏详细信息。` +
        `如果这是认证错误，请注意 EventSource 无法发送 X-API-Key 头。` +
        `请检查 NodePass API 服务器 (${directEventsUrl}) 的日志以了解根本原因。`,
        event 
      );
      let errorMessage = 'EventSource 连接错误。';
      if (newEventSource.readyState === EventSource.CLOSED) {
        errorMessage = 'EventSource 连接已关闭。可能由于服务器端认证失败或网络问题。';
      } else if (newEventSource.readyState === EventSource.CONNECTING) {
        return; 
      }

      const errorEventLog: InstanceEvent = { type: 'log', data: errorMessage, timestamp: new Date().toISOString() };
      setEvents((prevEvents) => {
        if (prevEvents.length > 0 && prevEvents[0].data === errorMessage && prevEvents[0].type === 'log') {
          return prevEvents;
        }
        return [errorEventLog, ...prevEvents.slice(0, 99)];
      });
    };

    return () => {
      if (newEventSource) {
        newEventSource.close();
      }
      eventSourceRef.current = null;
    };
  }, [apiId, apiRoot, apiToken, apiName]);

  const getBadgeTextAndVariant = (type: InstanceEvent['type']): { text: string; variant: BadgeProps['variant'] } => {
    if (type.includes('created')) return { text: '已创建', variant: 'default' };
    if (type.includes('updated')) return { text: '已更新', variant: 'secondary' };
    if (type.includes('deleted')) return { text: '已删除', variant: 'destructive' };
    return { text: '日志', variant: 'outline' };
  }

  type BadgeProps = React.ComponentProps<typeof Badge>;


  return (
    <Card className="shadow-lg mt-6">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          <Rss className="mr-2 h-5 w-5 text-primary" />
          实时事件日志
        </CardTitle>
        <CardDescription>
          来自 NodePass 实例的实时更新 (API: {apiName || 'N/A'}，直接连接)。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 w-full rounded-md border p-3 bg-muted/20 text-xs">
          {events.length === 0 && <p className="text-sm text-muted-foreground">暂无事件。</p>}
          {events.map((event, index) => {
            const { text: badgeText, variant: badgeVariant } = getBadgeTextAndVariant(event.type);
            const instance = event.instanceDetails as Instance | undefined;

            return (
              <div key={index} className="flex items-start space-x-2 py-1.5 border-b border-border/30 last:border-b-0 last:pb-0 first:pt-0">
                <Badge variant={badgeVariant} className="capitalize py-0.5 px-1.5 shadow-sm whitespace-nowrap mt-0.5">
                  {badgeText}
                </Badge>
                <div className="flex-grow min-w-0">
                  {event.type !== 'log' && instance ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono text-foreground/90">ID: {instance.id.substring(0, 8)}</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="capitalize">{instance.type}</span>
                      <span className="text-muted-foreground">|</span>
                      <InstanceStatusBadge status={instance.status} />
                       <span className="text-muted-foreground">|</span>
                      <span className="font-mono truncate text-foreground/70" title={instance.url}>URL: {instance.url.length > 40 ? instance.url.substring(0, 37) + '...' : instance.url}</span>
                    </div>
                  ) : (
                    <p className="font-mono break-all whitespace-pre-wrap text-foreground/90 leading-relaxed">
                      {String(event.data)}
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground whitespace-nowrap ml-auto pl-2 mt-0.5">
                  {new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

    