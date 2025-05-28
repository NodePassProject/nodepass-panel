
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Card used for empty state
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import { PlusCircle, Edit3, Trash2, Power, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AppLayout } from '@/components/layout/AppLayout';

export default function ConnectionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    apiConfigsList,
    activeApiConfig,
    addOrUpdateApiConfig,
    deleteApiConfig,
    setActiveApiConfigId,
    isLoading: isLoadingApiConfig,
  } = useApiConfig();

  const [isApiConfigDialogOpen, setIsApiConfigDialogOpen] = useState(false);
  const [editingApiConfig, setEditingApiConfig] = useState<NamedApiConfig | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<NamedApiConfig | null>(null);


  const handleOpenApiConfigDialog = (configToEdit?: NamedApiConfig | null) => {
    setEditingApiConfig(configToEdit || null);
    setIsApiConfigDialogOpen(true);
  };

  const handleSaveApiConfig = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setEditingApiConfig(null);
    setIsApiConfigDialogOpen(false);
    toast({
      title: configToSave.id ? '连接已更新' : '连接已添加',
      description: `“${savedConfig.name}”已保存。`,
    });
  };

  const handleSetActive = (id: string) => {
    setActiveApiConfigId(id);
    toast({
      title: '活动连接已切换',
      description: `现在已连接到 “${apiConfigsList.find(c => c.id === id)?.name}”。`,
    });
    router.push('/'); 
  };

  const handleDeleteConfirm = () => {
    if (deletingConfig) {
      deleteApiConfig(deletingConfig.id);
      toast({
        title: '连接已删除',
        description: `“${deletingConfig.name}”已被删除。`,
        variant: 'destructive',
      });
      setDeletingConfig(null);
    }
  };
  
  if (isLoadingApiConfig) {
    return (
      <AppLayout>
        <div className="text-center py-10">
          <p>加载 API 连接中...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">API 连接管理</h1>
        <Button onClick={() => handleOpenApiConfigDialog(null)} size="lg">
          <PlusCircle className="mr-2 h-5 w-5" />
          添加新连接
        </Button>
      </div>

      {apiConfigsList.length === 0 ? (
        <Card className="text-center py-10 shadow-lg">
          <CardHeader>
            <CardTitle>没有已保存的连接</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">您还没有添加任何 API 连接。</p>
            <p className="text-muted-foreground">点击上方的“添加新连接”按钮开始。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg shadow-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px] text-center">状态</TableHead>
                <TableHead>连接名称</TableHead>
                <TableHead>API 接口地址</TableHead>
                <TableHead className="w-[150px]">前缀路径</TableHead>
                <TableHead className="text-right w-[280px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiConfigsList.map((config) => (
                <TableRow key={config.id} className={activeApiConfig?.id === config.id ? 'bg-muted/50' : ''}>
                  <TableCell className="text-center">
                    {activeApiConfig?.id === config.id && (
                      <CheckCircle className="h-5 w-5 text-green-500 inline-block" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium break-all">{config.name}</TableCell>
                  <TableCell className="text-xs break-all">{config.apiUrl}</TableCell>
                  <TableCell className="text-xs break-all">{config.prefixPath || '无'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenApiConfigDialog(config)}
                        aria-label={`编辑连接 ${config.name}`}
                      >
                        <Edit3 className="mr-1 h-4 w-4" />
                        编辑
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => setDeletingConfig(config)}
                            aria-label={`删除连接 ${config.name}`}
                            disabled={activeApiConfig?.id === config.id} // Cannot delete active config
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            删除
                          </Button>
                        </AlertDialogTrigger>
                        {deletingConfig && deletingConfig.id === config.id && (
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>确认删除</AlertDialogTitle>
                              <AlertDialogDescription>
                                您确定要删除连接 “{deletingConfig.name}” 吗？此操作无法撤销。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setDeletingConfig(null)}>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleDeleteConfirm}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        )}
                      </AlertDialog>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleSetActive(config.id)}
                        disabled={activeApiConfig?.id === config.id}
                        aria-label={`激活连接 ${config.name}`}
                      >
                        <Power className="mr-1 h-4 w-4" />
                        {activeApiConfig?.id === config.id ? '当前活动' : '设为活动'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ApiConfigDialog
        open={isApiConfigDialogOpen}
        onOpenChange={setIsApiConfigDialogOpen}
        onSave={handleSaveApiConfig}
        currentConfig={editingApiConfig}
        isEditing={!!editingApiConfig}
      />
    </AppLayout>
  );
}
