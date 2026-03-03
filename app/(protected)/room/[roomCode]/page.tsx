import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function RoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Room: {roomCode}</h1>
        <p className="text-[var(--color-text-muted)]">
          Room functionality coming in Milestone 2
        </p>
      </div>
    </div>
  );
}
