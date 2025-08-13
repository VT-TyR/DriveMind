'use client';

import { BotMessageSquare, ServerOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useOperatingMode } from '@/contexts/operating-mode-context';

export default function OperatingModeSwitch() {
  const { mode, setMode } = useOperatingMode();
  const isAiAssisted = mode === 'ai-assisted';

  const handleToggle = (checked: boolean) => {
    setMode(checked ? 'ai-assisted' : 'local');
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 group-data-[collapsible=icon]:p-2">
      <div className="flex items-center justify-between group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
        <Label
          htmlFor="operating-mode"
          className="flex cursor-pointer items-center gap-2 group-data-[collapsible=icon]:flex-col"
        >
          {isAiAssisted ? (
            <BotMessageSquare className="size-5 text-primary" />
          ) : (
            <ServerOff className="size-5 text-muted-foreground" />
          )}
          <div className="flex flex-col text-left group-data-[collapsible=icon]:hidden">
            <span className="font-medium">
              {isAiAssisted ? 'AI-Assisted' : 'Local-Only'}
            </span>
            <span className="text-xs text-muted-foreground">Mode</span>
          </div>
        </Label>
        <Switch
          id="operating-mode"
          checked={isAiAssisted}
          onCheckedChange={handleToggle}
        />
      </div>
    </div>
  );
}
