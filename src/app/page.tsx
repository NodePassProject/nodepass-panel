
"use client";

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog'; // Renamed component, path kept for now
import { CreateInstanceCard } from '@/components/nodepass/CreateInstanceCard';
import { InstanceList } from '@/components/nodepass/InstanceList';
import { EventLog } from '@/components/nodepass/EventLog';
import { useApiConfig, type ApiConfig } from '@/hooks/use-api-key'; // Changed to useApiConfig
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';


export default function HomePage() {
  const { apiConfig, saveApiConfig, clearApiConfig, isLoading: isLoadingApiConfig } = useApiConfig();
  const [isApiConfigDialogOpen, setIsApiConfigDialogOpen] = useState(false);

  useEffect(() => {
    if (!isLoadingApiConfig && !apiConfig) {
      setIsApiConfigDialogOpen(true);
    }
  }, [apiConfig, isLoadingApiConfig]);

  const handleSaveApiConfig = (newConfig: ApiConfig) => {
    saveApiConfig(newConfig);
    setIsApiConfigDialogOpen(false);
  };
  
  const handleOpenApiConfigDialog = () => {
    setIsApiConfigDialogOpen(true);
  };

  const handleLogout = () => {
    clearApiConfig();
    setIsApiConfigDialogOpen(true); // Prompt for API config again
  };

  if (isLoadingApiConfig) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header onApiConfigSettingsClick={handleOpenApiConfigDialog} hasApiConfig={!!apiConfig} onLogoutClick={handleLogout} />
        <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">加载 API 配置中...</p>
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header onApiConfigSettingsClick={handleOpenApiConfigDialog} hasApiConfig={!!apiConfig} onLogoutClick={handleLogout} />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {apiConfig ? (
          <div className="space-y-8">
            <CreateInstanceCard />
            <InstanceList />
            <EventLog />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-[calc(100vh-10rem)]">
            <h2 className="text-2xl font-semibold mb-4">需要 API 配置</h2>
            <p className="text-muted-foreground mb-6">
              请配置您的 NodePass API 信息以管理实例。
            </p>
            <Button onClick={() => setIsApiConfigDialogOpen(true)} size="lg">
              配置 API 信息
            </Button>
          </div>
        )}
      </main>
      <ApiConfigDialog
        open={isApiConfigDialogOpen}
        onOpenChange={setIsApiConfigDialogOpen}
        onSave={handleSaveApiConfig}
        currentConfig={apiConfig}
      />
      <footer className="py-6 text-center text-sm text-muted-foreground border-t">
        NodePass 管理器 &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
