// api/stream.js (Vercel - Main HLS Proxy)
const TOKEN_SERVICE_URL = process.env.TOKEN_SERVICE_URL || 'https://tokenstream-leapcell-cwd2735402-shrvqo30.leapcell.dev';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Parse query params
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  
  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Missing id parameter' }), 
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    // Get stream configuration
    const configUrl = new URL('/list.json', req.url);
    const configResponse = await fetch(configUrl.toString());
    
    if (!configResponse.ok) {
      throw new Error('Failed to load stream configuration');
    }
    
    const config = await configResponse.json();
    const stream = config.streams?.find(s => s.id === id);
    
    if (!stream) {
      return new Response(
        JSON.stringify({ error: 'Stream not found' }), 
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get tokenized URL from Leapcell service
    let tokenUrl;
    try {
      const tokenResponse = await fetch(`${TOKEN_SERVICE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: stream.url, 
          streamId: id,
          forceRefresh: false 
        })
      });
      
      if (!tokenResponse.ok) {
        throw new Error(`Token service returned ${tokenResponse.status}`);
      }
      
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.success) {
        throw new Error(tokenData.error || 'Token fetch failed');
      }
      
      tokenUrl = tokenData.tokenUrl;
    } catch (error) {
      console.error('Token fetch error:', error);
      return new Response(
        JSON.stringify({
          error: 'Stream temporarily unavailable',
          message: 'Token service error',
          details: error.message
        }), 
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Fetch the M3U8 playlist
    const playlistResponse = await fetch(tokenUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': tokenUrl.split('/').slice(0, 3).join('/'),
      }
    });
    
    if (!playlistResponse.ok) {
      throw new Error(`Playlist fetch failed: ${playlistResponse.status}`);
    }
    
    const playlist = await playlistResponse.text();
    
    // Proxy the playlist
    const baseUrl = new URL(req.url).origin;
    const lines = playlist.split('\n');
    const proxiedLines = lines.map(line => {
      // Skip comments and empty lines
      if (line.startsWith('#') || line.trim() === '') {
        return line;
      }
      
      // Build absolute URL for segment
      let segmentUrl;
      if (line.startsWith('http')) {
        segmentUrl = line;
      } else {
        const baseParts = tokenUrl.split('/');
        baseParts.pop();
        segmentUrl = baseParts.join('/') + '/' + line;
      }
      
      // Return proxied URL
      const encoded = encodeURIComponent(segmentUrl);
      return `${baseUrl}/api/segment?url=${encoded}&id=${id}`;
    });
    
    const proxiedPlaylist = proxiedLines.join('\n');
    
    return new Response(proxiedPlaylist, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
    
  } catch (error) {
    console.error('Stream proxy error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to proxy stream',
        message: error.message,
        stack: error.stack
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}
