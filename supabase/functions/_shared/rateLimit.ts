// Shared rate-limit helper for edge functions
// Returns { allowed, retryAfter, response429 } where response429 is a ready Response if blocked.
export function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

export async function checkRateLimit(
  supabase: any,
  bucket: string,
  max: number,
  windowSeconds: number,
  blockSeconds: number
): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      _bucket: bucket,
      _max: max,
      _window_seconds: windowSeconds,
      _block_seconds: blockSeconds,
    });
    if (error) {
      console.error('[RATE-LIMIT] rpc error', bucket, error);
      return { allowed: true, retryAfter: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { allowed: !!row?.allowed, retryAfter: row?.retry_after_seconds ?? 0 };
  } catch (e) {
    console.error('[RATE-LIMIT] exception', bucket, e);
    return { allowed: true, retryAfter: 0 };
  }
}

export function rateLimitResponse(retryAfter: number, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: 'rate_limited', retry_after_seconds: retryAfter }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    }
  );
}
