
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

const API_CONFIGS_LIST_STORAGE_KEY = 'nodepass_api_configs_list';
const ACTIVE_API_CONFIG_ID_STORAGE_KEY = 'nodepass_active_api_config_id';

export interface ApiConfig {
  apiUrl: string;
  token: string;
  prefixPath: string | null;
}

export interface NamedApiConfig extends ApiConfig {
  id: string;
  name: string;
}

export function useApiConfig() {
  const [apiConfigsList, setApiConfigsList] = useState<NamedApiConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedConfigsList = localStorage.getItem(API_CONFIGS_LIST_STORAGE_KEY);
      if (storedConfigsList) {
        setApiConfigsList(JSON.parse(storedConfigsList));
      }
      const storedActiveConfigId = localStorage.getItem(ACTIVE_API_CONFIG_ID_STORAGE_KEY);
      if (storedActiveConfigId) {
        setActiveConfigId(storedActiveConfigId);
      }
    } catch (error) {
      console.warn("无法从 localStorage 加载 API 配置列表:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveApiConfigsList = useCallback((configs: NamedApiConfig[]) => {
    try {
      localStorage.setItem(API_CONFIGS_LIST_STORAGE_KEY, JSON.stringify(configs));
      setApiConfigsList(configs);
    } catch (error) {
      console.error("无法将 API 配置列表保存到 localStorage:", error);
    }
  }, []);

  const saveActiveConfigId = useCallback((id: string | null) => {
    try {
      if (id) {
        localStorage.setItem(ACTIVE_API_CONFIG_ID_STORAGE_KEY, id);
      } else {
        localStorage.removeItem(ACTIVE_API_CONFIG_ID_STORAGE_KEY);
      }
      setActiveConfigId(id);
    } catch (error) {
      console.error("无法将活动 API 配置 ID 保存到 localStorage:", error);
    }
  }, []);

  const addOrUpdateApiConfig = useCallback((config: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    let newId = config.id || uuidv4();
    const newConfigWithId = { ...config, id: newId };
    
    setApiConfigsList(prevList => {
      const existingIndex = prevList.findIndex(c => c.id === newId);
      let newList;
      if (existingIndex > -1) {
        newList = [...prevList];
        newList[existingIndex] = newConfigWithId;
      } else {
        newList = [...prevList, newConfigWithId];
      }
      saveApiConfigsList(newList);
      return newList;
    });
    saveActiveConfigId(newId); // Automatically set the new/updated config as active
    return newConfigWithId;
  }, [saveApiConfigsList, saveActiveConfigId]);

  const deleteApiConfig = useCallback((id: string) => {
    setApiConfigsList(prevList => {
      const newList = prevList.filter(c => c.id !== id);
      saveApiConfigsList(newList);
      return newList;
    });
    if (activeConfigId === id) {
      saveActiveConfigId(null); // Clear active if it was the one deleted
    }
  }, [activeConfigId, saveApiConfigsList, saveActiveConfigId]);

  const clearActiveApiConfig = useCallback(() => {
    saveActiveConfigId(null);
  }, [saveActiveConfigId]);

  const activeApiConfig = useMemo(() => {
    if (!activeConfigId) return null;
    return apiConfigsList.find(c => c.id === activeConfigId) || null;
  }, [apiConfigsList, activeConfigId]);

  const getApiRootUrl = useCallback((): string | null => {
    if (!activeApiConfig?.apiUrl) return null;
    const { apiUrl, prefixPath } = activeApiConfig;
    let base = apiUrl.replace(/\/+$/, ''); 
    if (prefixPath && prefixPath.trim() !== '') {
      base += `/${prefixPath.replace(/^\/+|\/+$/g, '').trim()}`; 
    }
    return base;
  }, [activeApiConfig]);

  const getToken = useCallback((): string | null => {
    return activeApiConfig?.token || null;
  }, [activeApiConfig]);

  return { 
    apiConfigsList,
    activeApiConfig,
    isLoading, 
    addOrUpdateApiConfig,
    deleteApiConfig,
    setActiveApiConfigId: saveActiveConfigId,
    clearActiveApiConfig,
    getApiRootUrl, 
    getToken 
  };
}
