
"use client";

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { ApiKeyDialog } from '@/components/nodepass/ApiKeyDialog';
import { CreateInstanceCard } from '@/components/nodepass/CreateInstanceCard';
import { InstanceList } from '@/components/nodepass/InstanceList';
import { EventLog } from '@/components/nodepass/EventLog';
import { useApiKey } from '@/hooks/use-api-key';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';


export default function HomePage() {
  const { apiKey, saveApiKey, clearApiKey, isLoading: isLoadingApiKey } = useApiKey();
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);

  useEffect(() => {
    if (!isLoadingApiKey && !apiKey) {
      setIsApiKeyDialogOpen(true);
    }
  }, [apiKey, isLoadingApiKey]);

  const handleSaveApiKey = (newApiKey: string) => {
    saveApiKey(newApiKey);
    setIsApiKeyDialogOpen(false);
  };
  
  const handleOpenApiKeyDialog = () => {
    setIsApiKeyDialogOpen(true);
  };

  const handleLogout = () => {
    clearApiKey();
    setIsApiKeyDialogOpen(true); // Prompt for API key again
  };

  if (isLoadingApiKey) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header onApiKeySettingsClick={handleOpenApiKeyDialog} hasApiKey={!!apiKey} onLogoutClick={handleLogout} />
        <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">Loading API Key...</p>
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header onApiKeySettingsClick={handleOpenApiKeyDialog} hasApiKey={!!apiKey} onLogoutClick={handleLogout} />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {apiKey ? (
          <div className="space-y-8">
            <CreateInstanceCard />
            <InstanceList />
            <EventLog />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-[calc(100vh-10rem)]">
            <h2 className="text-2xl font-semibold mb-4">API Key Required</h2>
            <p className="text-muted-foreground mb-6">
              Please configure your NodePass API key to manage instances.
            </p>
            <Button onClick={() => setIsApiKeyDialogOpen(true)} size="lg">
              Configure API Key
            </Button>
          </div>
        )}
      </main>
      <ApiKeyDialog
        open={isApiKeyDialogOpen}
        onOpenChange={setIsApiKeyDialogOpen}
        onSave={handleSaveApiKey}
        currentApiKey={apiKey}
      />
      <footer className="py-6 text-center text-sm text-muted-foreground border-t">
        NodePass Manager &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
