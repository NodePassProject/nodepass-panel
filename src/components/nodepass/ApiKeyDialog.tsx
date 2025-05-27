
"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound } from 'lucide-react';
import type { ApiConfig } from '@/hooks/use-api-key'; // Renamed from use-api-key to use-api-config effectively

interface ApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: ApiConfig) => void;
  currentConfig?: ApiConfig | null;
}

export function ApiConfigDialog({ open, onOpenChange, onSave, currentConfig }: ApiConfigDialogProps) {
  const [apiUrlInput, setApiUrlInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [prefixPathInput, setPrefixPathInput] = useState('');

  useEffect(() => {
    if (open) {
      setApiUrlInput(currentConfig?.apiUrl || '');
      setTokenInput(currentConfig?.token || '');
      setPrefixPathInput(currentConfig?.prefixPath || '');
    }
  }, [open, currentConfig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiUrlInput.trim() && tokenInput.trim()) {
      onSave({
        apiUrl: apiUrlInput.trim(),
        token: tokenInput.trim(),
        prefixPath: prefixPathInput.trim() || null,
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <KeyRound className="mr-2 h-5 w-5 text-primary" />
              API 配置
            </DialogTitle>
            <DialogDescription>
              输入您的 NodePass API URL、令牌和可选的前缀路径。这些信息将存储在您的浏览器本地。
              API 端点版本固定为 v1 (例如: {apiUrl}{prefixPath}/v1/*)。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="api-url">API 接口地址</Label>
              <Input
                id="api-url"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="例如: http://localhost:3000 或 http://[2a12::1]:3134"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="token">令牌</Label>
              <Input
                id="token"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="输入您的令牌"
                type="password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prefix-path">前缀路径 (可选)</Label>
              <Input
                id="prefix-path"
                value={prefixPathInput}
                onChange={(e) => setPrefixPathInput(e.target.value)}
                placeholder="例如: api"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={!apiUrlInput.trim() || !tokenInput.trim()}>保存配置</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
