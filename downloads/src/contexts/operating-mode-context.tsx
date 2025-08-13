'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';

type OperatingMode = 'local' | 'ai-assisted';

interface OperatingModeContextType {
  mode: OperatingMode;
  setMode: (mode: OperatingMode) => void;
  isAiEnabled: boolean;
}

const OperatingModeContext = createContext<OperatingModeContextType | undefined>(
  undefined
);

export const OperatingModeProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [mode, setMode] = useState<OperatingMode>('ai-assisted');
  const isAiEnabled = useMemo(() => mode === 'ai-assisted', [mode]);

  return (
    <OperatingModeContext.Provider value={{ mode, setMode, isAiEnabled }}>
      {children}
    </OperatingModeContext.Provider>
  );
};

export const useOperatingMode = () => {
  const context = useContext(OperatingModeContext);
  if (context === undefined) {
    throw new Error(
      'useOperatingMode must be used within an OperatingModeProvider'
    );
  }
  return context;
};
