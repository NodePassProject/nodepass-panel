
"use client";

import React, { useState } from 'react';
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

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (apiKey: string) => void;
  currentApiKey?: string | null;
}

export function ApiKeyDialog({ open, onOpenChange, onSave, currentApiKey }: ApiKeyDialogProps) {
  const [apiKeyInput, setApiKeyInput] = useState(currentApiKey || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKeyInput.trim()) {
      onSave(apiKeyInput.trim());
      onOpenChange(false);
    }
  };

  React.useEffect(() => {
    if (open) {
        setApiKeyInput(currentApiKey || '');
    }
  }, [open, currentApiKey]);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <KeyRound className="mr-2 h-5 w-5 text-primary" />
              API Key Configuration
            </DialogTitle>
            <DialogDescription>
              Enter your NodePass API key to access the manager. This key will be stored locally in your browser.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="api-key" className="text-right">
                API Key
              </Label>
              <Input
                id="api-key"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="col-span-3"
                placeholder="Enter your API key"
                type="password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!apiKeyInput.trim()}>Save API Key</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
