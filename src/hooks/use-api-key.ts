
"use client";

import { useState, useEffect, useCallback } from 'react';

const API_CONFIG_STORAGE_KEY = 'nodepass_api_config';

export interface ApiConfig {
  apiUrl: string;
  token: string;
  prefixPath: string | null;
}

export function useApiConfig() {
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedConfig = localStorage.getItem(API_CONFIG_STORAGE_KEY);
      if (storedConfig) {
        setApiConfig(JSON.parse(storedConfig));
      }
    } catch (error) {
      console.warn("无法从 localStorage 加载 API 配置:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveApiConfig = useCallback((newConfig: ApiConfig) => {
    try {
      localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
      setApiConfig(newConfig);
    } catch (error) {
      console.error("无法将 API 配置保存到 localStorage:", error);
    }
  }, []);

  const clearApiConfig = useCallback(() => {
    try {
      localStorage.removeItem(API_CONFIG_STORAGE_KEY);
      setApiConfig(null);
    } catch (error) {
      console.error("无法从 localStorage 清除 API 配置:", error);
    }
  }, []);

  const getApiRootUrl = useCallback((): string | null => {
    if (!apiConfig?.apiUrl) return null;
    const { apiUrl, prefixPath } = apiConfig;
    let base = apiUrl.replace(/\/+$/, ''); // 移除末尾斜杠
    if (prefixPath && prefixPath.trim() !== '') {
      base += `/${prefixPath.replace(/^\/+|\/+$/g, '').trim()}`; // 添加并清理prefixPath
    }
    return base;
  }, [apiConfig]);

  const getToken = useCallback((): string | null => {
    return apiConfig?.token || null;
  }, [apiConfig]);

  return { apiConfig, saveApiConfig, clearApiConfig, isLoading, getApiRootUrl, getToken };
}
