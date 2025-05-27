
"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import type { Instance } from '@/types/nodepass';

interface InstanceStatusBadgeProps {
  status: Instance['status'];
}

export function InstanceStatusBadge({ status }: InstanceStatusBadgeProps) {
  switch (status) {
    case 'running':
      return (
        <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white">
          <CheckCircle className="mr-1 h-3.5 w-3.5" />
          Running
        </Badge>
      );
    case 'stopped':
      return (
        <Badge variant="secondary" className="bg-gray-500 hover:bg-gray-600 text-white">
          <XCircle className="mr-1 h-3.5 w-3.5" />
          Stopped
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive">
          <AlertTriangle className="mr-1 h-3.5 w-3.5" />
          Error
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <HelpCircle className="mr-1 h-3.5 w-3.5" />
          Unknown
        </Badge>
      );
  }
}
