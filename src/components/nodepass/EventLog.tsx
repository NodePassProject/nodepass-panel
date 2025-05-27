
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss } from 'lucide-react';
import type { InstanceEvent } from '@/types/nodepass';
import { useApiConfig } from '@/hooks/use-api-key';
import { getEventsUrl } from '@/lib/api'; // Import getEventsUrl

export function EventLog() {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const { apiConfig, getApiRootUrl, getToken } = useApiConfig(); 
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiRoot = getApiRootUrl();
    const currentToken = getToken(); // We'll need the token to inform the user, even if we can't send it
    
    if (!apiConfig || !apiRoot) { // Token presence isn't strictly required for the URL itself now
      setEvents([{type: 'log', data: 'API 配置未设置或不完整。事件流已禁用。', timestamp: new Date().toISOString()}]);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }
    
    const directEventsUrl = getEventsUrl(apiRoot); // Get base events URL
    
    setEvents([{type: 'log', data: `正在直接初始化事件流到 ${directEventsUrl}... (注意：EventSource 无法发送 X-API-Key 进行认证，如果服务器需要，可能会失败)`, timestamp: new Date().toISOString()}]);
    
    if (eventSourceRef.current) {
        eventSourceRef.current.close();
    }

    const newEventSource = new EventSource(directEventsUrl); // Connect directly
    eventSourceRef.current = newEventSource;

    newEventSource.onopen = () => {
      setEvents((prevEvents) => [{type: 'log', data: `事件流已直接连接到 ${directEventsUrl}。等待事件... (如果服务器需要 X-API-Key 认证，可能不会收到事件)`, timestamp: new Date().toISOString()}, ...prevEvents.filter(e => !e.data.startsWith('正在直接初始化事件流到'))]);
    };

    newEventSource.onmessage = (event) => {
      try {
        const newEventData = JSON.parse(event.data);
        const newEvent: InstanceEvent = {
            type: newEventData.type || 'log',
            data: newEventData.data || newEventData, 
            timestamp: newEventData.timestamp || new Date().toISOString()
        };
        setEvents((prevEvents) => [newEvent, ...prevEvents.slice(0, 99)]); 
      } catch (error) {
        console.error("无法解析事件数据:", error, "原始数据:", event.data);
        const errorEvent: InstanceEvent = { type: 'log', data: `解析事件错误: ${event.data}`, timestamp: new Date().toISOString() };
        setEvents((prevEvents) => [errorEvent, ...prevEvents.slice(0,99)]);
      }
    };

    newEventSource.onerror = (event: Event) => {
      console.error(
        `EventSource 错误 (客户端). ReadyState: ${newEventSource.readyState}. ` +
        `直接连接到 ${directEventsUrl}. ` +
        `客户端事件对象 (如下所示) 通常缺乏详细信息。` +
        `请检查 NodePass API 服务器日志以了解根本原因 (可能由于 X-API-Key 认证失败)。`,
        event 
      );
      let errorMessage = 'EventSource 连接错误。';
      if (newEventSource.readyState === EventSource.CLOSED) {
        errorMessage = 'EventSource 连接已关闭。可能由于服务器端认证失败或网络问题。';
      } else if (newEventSource.readyState === EventSource.CONNECTING) {
        errorMessage = 'EventSource 正在尝试连接/重新连接...';
      }
      
      const errorEventLog: InstanceEvent = { type: 'log', data: errorMessage, timestamp: new Date().toISOString() };
      setEvents((prevEvents) => {
        if (prevEvents.length > 0 && prevEvents[0].data === errorMessage) {
          return prevEvents;
        }
        return [errorEventLog, ...prevEvents.slice(0,99)];
      });
    };

    return () => {
      if (newEventSource) {
        newEventSource.close();
      }
      eventSourceRef.current = null;
    };

  }, [apiConfig, getApiRootUrl, getToken]); // getToken is included to re-trigger if token changes, for logging purposes.

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
          来自 NodePass 实例的实时更新 (直接连接)。
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
              <p className="mt-1 font-mono break-all">{typeof event.data === 'object' ? JSON.stringify(event.data) : String(event.data)}</p>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
