// Shared rate-limit helper for edge functions
// Fails CLOSED: if the RPC errors, callers must block (503) — never silently allow.
export function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  unavailable?: boolean;
}

export async function checkRateLimit(
  supabase: any,
  bucket: string,
  max: number,
  windowSeconds: number,
  blockSeconds: number
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      _bucket: bucket,
      _max: max,
      _window_seconds: windowSeconds,
      _block_seconds: blockSeconds,
    });
    if (error) {
      console.error('[RATE-LIMIT] unavailable', bucket, error);
      return { allowed: false, retryAfter: 60, unavailable: true };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      console.error('[RATE-LIMIT] unavailable (empty row)', bucket);
      return { allowed: false, retryAfter: 60, unavailable: true };
    }
    return { allowed: !!row.allowed, retryAfter: row.retry_after_seconds ?? 0 };
  } catch (e) {
    console.error('[RATE-LIMIT] unavailable (exception)', bucket, e);
    return { allowed: false, retryAfter: 60, unavailable: true };
  }
}

export function rateLimitResponse(
  retryAfterOrResult: number | RateLimitResult,
  corsHeaders: Record<string, string>
): Response {
  const result: RateLimitResult =
    typeof retryAfterOrResult === 'number'
      ? { allowed: false, retryAfter: retryAfterOrResult }
      : retryAfterOrResult;

  if (result.unavailable) {
    return new Response(
      JSON.stringify({ error: 'rate_limit_unavailable', retry_after_seconds: result.retryAfter }),
      {
        status: 503,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(result.retryAfter),
        },
      }
    );
  }

  return new Response(
    JSON.stringify({ error: 'rate_limited', retry_after_seconds: result.retryAfter }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter),
      },
    }
  );
}
