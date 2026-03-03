import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HomeClient from './HomeClient';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return (
    <HomeClient
      user={{
        id: user.id,
        email: user.email || '',
      }}
      profile={profile}
    />
  );
}
