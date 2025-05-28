
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Rss } from 'lucide-react';
import type { Instance, InstanceEvent } from '@/types/nodepass'; // Make sure Instance is imported
import { getEventsUrl } from '@/lib/api';

interface EventLogProps {
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
}

function formatBytesForLog(bytes: number | undefined, decimals = 1) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return 'N/A';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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
    
    // Clear previous events and show initialization message
    setEvents([{ type: 'log', data: initialMessage, timestamp: new Date().toISOString() }]);
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const newEventSource = new EventSource(directEventsUrl);
    eventSourceRef.current = newEventSource;
    currentEventSource = newEventSource;


    newEventSource.onopen = () => {
      if (currentEventSource !== newEventSource) return; // Stale event source
      setEvents((prevEvents) => [{ type: 'log', data: `事件流已直接连接。等待事件... (目标: ${directEventsUrl})`, timestamp: new Date().toISOString() }, ...prevEvents.filter(e => e.data !== initialMessage).slice(0,99)]);
    };

    newEventSource.addEventListener('instance', (event) => {
      if (currentEventSource !== newEventSource) return; // Stale event source
      console.log('SSE "instance" event received from server (direct):', event.data);
      try {
        const serverEventPayload = JSON.parse(event.data as string);
        let frontendEventType: InstanceEvent['type'];
        let frontendEventData: any;

        // The 'data' property in our frontend InstanceEvent will hold the 'instance' object from the server
        // or the 'logs' string.
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
            frontendEventData = serverEventPayload.instance; // Server sends the instance that was deleted
            break;
          case 'log':
            frontendEventType = 'log';
            frontendEventData = `[实例ID: ${serverEventPayload.instance?.id?.substring(0,8) || 'N/A'}] ${serverEventPayload.logs}`;
            break;
          default:
            console.warn("未知服务器事件类型 (direct):", serverEventPayload.type, serverEventPayload);
            frontendEventType = 'log'; 
            frontendEventData = `未知事件 ${serverEventPayload.type}: ${JSON.stringify(serverEventPayload.data || serverEventPayload.instance || serverEventPayload)}`;
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
        if (currentEventSource !== newEventSource) return; // Stale event source
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
      if (currentEventSource !== newEventSource) return; // Stale event source
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
        // Don't log repetitive "connecting" errors if it's just retrying
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
  }, [apiId, apiRoot, apiToken, apiName]); // Added apiToken and apiName to deps for completeness, though direct EventSource doesn't use token in URL.

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
        <ScrollArea className="h-72 w-full rounded-md border p-4 bg-muted/20">
          {events.length === 0 && <p className="text-sm text-muted-foreground">暂无事件。</p>}
          {events.map((event, index) => (
            <div key={index} className="mb-3 pb-3 border-b border-border/30 last:border-b-0 last:mb-0 text-xs">
              <div className="flex justify-between items-center mb-1">
                <Badge variant={
                    event.type.includes('created') ? 'default' :
                    event.type.includes('updated') ? 'secondary' :
                    event.type.includes('deleted') ? 'destructive' : 'outline'
                } className="capitalize text-xs py-0.5 px-1.5 shadow-sm">
                  {getBadgeText(event.type)}
                </Badge>
                <span className="text-muted-foreground text-xs">{new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
              {typeof event.data === 'object' && event.data !== null && 
               (event.type === 'instance_created' || event.type === 'instance_updated' || event.type === 'instance_deleted') ? (
                <div className="p-2.5 mt-1.5 bg-card/80 rounded-md font-mono text-[0.7rem] leading-relaxed shadow-sm border border-border/50">
                  <p><span className="font-semibold text-foreground/80">实例 ID:</span> {event.data.id}</p>
                  <p><span className="font-semibold text-foreground/80">类型:</span> <span className="capitalize">{event.data.type}</span></p>
                  <p><span className="font-semibold text-foreground/80">状态:</span> <span className="capitalize">{event.data.status}</span></p>
                  <p className="break-all"><span className="font-semibold text-foreground/80">URL:</span> {event.data.url}</p>
                  {(event.data as Instance).tcprx !== undefined && (
                    <p>
                      <span className="font-semibold text-foreground/80">流量 (TCP Rx/Tx, UDP Rx/Tx):</span>
                      {` ${formatBytesForLog((event.data as Instance).tcprx)}/${formatBytesForLog((event.data as Instance).tcptx)}, ${formatBytesForLog((event.data as Instance).udprx)}/${formatBytesForLog((event.data as Instance).udptx)}`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1.5 font-mono break-all whitespace-pre-wrap text-foreground/90 text-[0.7rem] leading-relaxed p-1.5 bg-background/30 rounded-sm">
                  {String(event.data)}
                </p>
              )}
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

