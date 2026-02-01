import { User } from 'lucide-react';

import { SectionDivider, SectionHeader } from '../components';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const AccountSettings: FC = () => {
  return (
    <div>
      <SectionHeader title="Account">Manage your account settings</SectionHeader>

      <div className="rounded-lg border border-border/40 p-4 bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary/80" />
          </div>
          <div>
            <div className="font-medium text-base">Guest User</div>
            <div className="text-sm text-muted-foreground/80">Not signed in</div>
          </div>
        </div>
        <Button variant="outline" className="w-full mt-4" size="sm">
          Sign In
        </Button>
      </div>

      <SectionDivider />

      <SectionHeader title="API Keys">Manage your API credentials</SectionHeader>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-muted-foreground/90">Anthropic API Key</label>
          <Input type="password" placeholder="sk-ant-..." className="mt-1.5 h-8 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground/90">OpenAI API Key</label>
          <Input type="password" placeholder="sk-..." className="mt-1.5 h-8 text-sm" />
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;
