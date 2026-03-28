'use client';
import React, { createContext, useContext, useState } from 'react';

interface ThinkingState {
  isThinking: boolean;
  currentQuestion: string;
}

interface UIContextType {
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isSidebarOpen: boolean) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within an UIProvider');
  }
  return context;
};

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <UIContext.Provider value={{ 
      isLoading, 
      setIsLoading,
      isSidebarOpen,
      setIsSidebarOpen,
    }}>
      {children}
    </UIContext.Provider>
  );
};