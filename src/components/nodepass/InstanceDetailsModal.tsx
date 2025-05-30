
"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Instance } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { ArrowDownCircle, ArrowUpCircle, Server, Smartphone, Fingerprint, Cable } from 'lucide-react';

interface InstanceDetailsModalProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


export function InstanceDetailsModal({ instance, open, onOpenChange }: InstanceDetailsModalProps) {
  if (!instance) return null;

  const detailItems = [
    { label: "ID", value: instance.id, icon: <Fingerprint className="h-4 w-4 text-muted-foreground" /> },
    { 
      label: "类型", 
      value: (
        <Badge variant={instance.type === 'server' ? 'default' : 'accent'} className="capitalize whitespace-nowrap">
          {instance.type === 'server' ? <Server className="h-3 w-3 mr-1" /> : <Smartphone className="h-3 w-3 mr-1" />}
          {instance.type === 'server' ? '服务器' : '客户端'}
        </Badge>
      ), 
      icon: instance.type === 'server' ? <Server className="h-4 w-4 text-muted-foreground" /> : <Smartphone className="h-4 w-4 text-muted-foreground" /> 
    },
    { label: "状态", value: <InstanceStatusBadge status={instance.status} />, icon: <Cable className="h-4 w-4 text-muted-foreground" /> },
    { label: "URL", value: <span className="break-all text-sm">{instance.url}</span>, fullWidth: true },
    { label: "TCP 接收", value: formatBytes(instance.tcprx), icon: <ArrowDownCircle className="h-4 w-4 text-blue-500" /> },
    { label: "TCP 发送", value: formatBytes(instance.tcptx), icon: <ArrowUpCircle className="h-4 w-4 text-green-500" /> },
    { label: "UDP 接收", value: formatBytes(instance.udprx), icon: <ArrowDownCircle className="h-4 w-4 text-blue-500" /> },
    { label: "UDP 发送", value: formatBytes(instance.udptx), icon: <ArrowUpCircle className="h-4 w-4 text-green-500" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">实例详情</DialogTitle>
          <DialogDescription>
            实例 <span className="font-semibold">{instance.id}</span> 详情。
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          {detailItems.map((item, index) => (
            <div key={index} className={`flex ${item.fullWidth ? 'flex-col' : 'items-center justify-between'} py-2 border-b last:border-b-0`}>
              <div className="flex items-center">
                {item.icon && <span className="mr-2">{item.icon}</span>}
                <span className="text-sm font-medium text-muted-foreground">{item.label}:</span>
              </div>
              <div className={`text-sm ${item.fullWidth ? 'mt-1' : ''}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
