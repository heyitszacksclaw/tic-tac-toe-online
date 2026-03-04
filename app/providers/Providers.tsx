'use client';

import { SoundProvider } from './SoundProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SoundProvider>
      {children}
    </SoundProvider>
  );
}
