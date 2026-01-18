import type { FC } from 'react';

export const CanvasApp: FC = () => {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Canvas UI Builder</h1>
        <p className="mt-2 text-muted-foreground">Ready to build</p>
      </div>
    </div>
  );
};
