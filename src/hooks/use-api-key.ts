
"use client";

import { useState, useEffect, useCallback } from 'react';

const API_KEY_STORAGE_KEY = 'nodepass_api_key';

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedApiKey) {
        setApiKey(storedApiKey);
      }
    } catch (error) {
      console.warn("Could not access localStorage for API key:", error);
      // Handle environments where localStorage is not available or restricted
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveApiKey = useCallback((newApiKey: string) => {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, newApiKey);
      setApiKey(newApiKey);
    } catch (error) {
      console.error("Failed to save API key to localStorage:", error);
      // Optionally, notify the user if saving fails
    }
  }, []);

  const clearApiKey = useCallback(() => {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      setApiKey(null);
    } catch (error) {
      console.error("Failed to clear API key from localStorage:", error);
    }
  }, []);

  return { apiKey, saveApiKey, clearApiKey, isLoading };
}
