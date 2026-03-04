import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Simple ping to keep Supabase project active
    const response = await fetch(
      process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/',
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
      }
    );

    return NextResponse.json({
      ok: response.ok,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Keep-alive ping failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Ping failed' },
      { status: 500 }
    );
  }
}
