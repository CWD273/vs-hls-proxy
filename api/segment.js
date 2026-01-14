// api/segment.js (Vercel - Segment Proxy)
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Parse query params
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  
  if (!url) {
    return new Response('Missing url parameter', { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  try {
    const decodedUrl = decodeURIComponent(url);
    
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': decodedUrl.split('/').slice(0, 3).join('/'),
      }
    });
    
    if (!response.ok) {
      throw new Error(`Segment fetch failed: ${response.status}`);
    }
    
    // Get content type
    const contentType = response.headers.get('content-type') || 'video/mp2t';
    
    // Stream the segment
    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
      }
    });
    
  } catch (error) {
    console.error('Segment fetch error:', error);
    return new Response(
      JSON.stringify({
        error: 'Segment fetch failed',
        message: error.message
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}
