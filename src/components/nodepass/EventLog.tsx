
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss } from 'lucide-react';
import type { InstanceEvent } from '@/types/nodepass';
import { getEventsUrl } from '@/lib/api';

interface EventLogProps {
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null; // apiToken is kept for potential future use or if server supports query token
  apiName: string | null;
}

export function EventLog({ apiId, apiRoot, apiToken, apiName }: EventLogProps) {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!apiId || !apiRoot) {
      const reason = !apiId ? "API 连接未激活" : "活动 API 配置的 URL 无效";
      setEvents([{ type: 'log', data: `${reason}。事件流（直接连接）已禁用。`, timestamp: new Date().toISOString() }]);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }
    
    // Get the direct NodePass API events URL
    const directEventsUrl = getEventsUrl(apiRoot); 

    const initialMessage = `正在直接初始化事件流到 ${directEventsUrl}... (注意：EventSource 无法发送 X-API-Key 进行认证，如果服务器需要，可能会失败)`;
    
    setEvents([{ type: 'log', data: initialMessage, timestamp: new Date().toISOString() }]);
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Attempt direct connection. Token is not used in URL for direct EventSource.
    const newEventSource = new EventSource(directEventsUrl);
    eventSourceRef.current = newEventSource;

    newEventSource.onopen = () => {
      setEvents((prevEvents) => [{ type: 'log', data: `事件流已直接连接。等待事件... (目标: ${directEventsUrl})`, timestamp: new Date().toISOString() }, ...prevEvents.filter(e => e.data !== initialMessage).slice(0,99)]);
    };

    newEventSource.addEventListener('instance', (event) => {
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
            frontendEventData = `[实例ID: ${serverEventPayload.instance?.id || 'N/A'}] ${serverEventPayload.logs}`;
            break;
          default:
            console.warn("未知服务器事件类型 (direct):", serverEventPayload.type, serverEventPayload);
            frontendEventType = 'log'; 
            frontendEventData = `未知事件 ${serverEventPayload.type}: ${JSON.stringify(serverEventPayload.data || serverEventPayload)}`;
            break;
        }

        const newEventToLog: InstanceEvent = {
          type: frontendEventType,
          data: frontendEventData,
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
        // This handles messages without an "event:" field, or "event: message"
        console.log("收到通用 SSE 消息 (非 'instance' 事件, direct):", event.data);
        const genericEvent: InstanceEvent = {
          type: 'log',
          data: `通用消息: ${event.data}`,
          timestamp: new Date().toISOString()
        };
        setEvents((prevEvents) => [genericEvent, ...prevEvents.slice(0, 99)]);
    };

    newEventSource.onerror = (event: Event) => { 
      console.error(
        `EventSource 错误 (客户端). ReadyState: ${newEventSource.readyState}. ` +
        `直接连接到: ${directEventsUrl}. ` +
        `客户端事件对象 (如下所示) 通常缺乏详细信息。` +
        `如果这是认证错误，请注意 EventSource 无法发送 X-API-Key 头。` +
        `请检查 NodePass API 服务器 (${directEventsUrl}) 的日志以了解根本原因。`,
        event // Log the raw event object for any potential clues
      );
      let errorMessage = 'EventSource 连接错误。';
      if (newEventSource.readyState === EventSource.CLOSED) {
        errorMessage = 'EventSource 连接已关闭。可能由于服务器端认证失败或网络问题。';
      } else if (newEventSource.readyState === EventSource.CONNECTING) {
        // Don't log repetitive "connecting" errors if it's just retrying
        return; 
      }

      const errorEventLog: InstanceEvent = { type: 'log', data: errorMessage, timestamp: new Date().toISOString() };
      setEvents((prevEvents) => {
        // Avoid duplicate error messages if they are the same
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
  }, [apiId, apiRoot, apiName]); // apiToken removed from deps as it's not used for direct EventSource URL

  const getBadgeText = (type: InstanceEvent['type']): string => {
    if (type.includes('created')) return '已创建';
    if (type.includes('updated')) return '已更新';
    if (type.includes('deleted')) return '已删除';
    return '日志';
  }

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
        <ScrollArea className="h-64 w-full rounded-md border p-4">
          {events.length === 0 && <p className="text-sm text-muted-foreground">暂无事件。</p>}
          {events.map((event, index) => (
            <div key={index} className="mb-2 pb-2 border-b last:border-b-0 last:mb-0 text-xs">
              <div className="flex justify-between items-center">
                <Badge variant={
                    event.type.includes('created') ? 'default' :
                    event.type.includes('updated') ? 'secondary' :
                    event.type.includes('deleted') ? 'destructive' : 'outline'
                } className="capitalize text-xs py-0.5 px-1.5">
                  {getBadgeText(event.type)}
                </Badge>
                <span className="text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString('zh-CN')}</span>
              </div>
              <p className="mt-1 font-mono break-all whitespace-pre-wrap">{typeof event.data === 'object' ? JSON.stringify(event.data, null, 2) : String(event.data)}</p>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
