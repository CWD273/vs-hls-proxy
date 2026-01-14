// api/stream.js (Vercel - Main HLS Proxy)
const TOKEN_SERVICE_URL = process.env.TOKEN_SERVICE_URL || 'https://your-app.leapcell.io';

// Load stream config
async function getStreamConfig(id, host) {
  const configUrl = `https://${host}/list.json`;
  const response = await fetch(configUrl);
  const config = await response.json();
  return config.streams?.find(s => s.id === id);
}

// Get token from Leapcell service
async function getToken(streamUrl, streamId, forceRefresh = false) {
  const response = await fetch(`${TOKEN_SERVICE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      url: streamUrl, 
      streamId,
      forceRefresh 
    })
  });
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Token fetch failed');
  }
  
  return data.tokenUrl;
}

// Fetch with browser headers
async function fetchWithHeaders(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': url.split('/').slice(0, 3).join('/'),
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response;
}

// Proxy M3U8 playlist
async function proxyPlaylist(tokenUrl, streamId, proxyBaseUrl) {
  const response = await fetchWithHeaders(tokenUrl);
  const playlist = await response.text();
  
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
    return `${proxyBaseUrl}/api/segment?url=${encoded}&id=${streamId}`;
  });
  
  return proxiedLines.join('\n');
}

export default async function handler(req, res) {
  const { id } = req.query;
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (!id) {
    return res.status(400).json({ error: 'Missing id parameter' });
  }

  try {
    // Get stream configuration
    const stream = await getStreamConfig(id, req.headers.host);
    
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Get tokenized URL from Leapcell service
    let tokenUrl;
    try {
      tokenUrl = await getToken(stream.url, id);
    } catch (error) {
      // On token error, try force refresh once
      console.error('Token fetch failed, attempting refresh:', error.message);
      try {
        tokenUrl = await getToken(stream.url, id, true);
      } catch (retryError) {
        return res.status(503).json({
          error: 'Stream temporarily unavailable',
          message: 'Token service error. Retrying...',
          details: retryError.message
        });
      }
    }
    
    // Fetch and proxy the playlist
    const proxyBaseUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
    const proxiedPlaylist = await proxyPlaylist(tokenUrl, id, proxyBaseUrl);
    
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.status(200).send(proxiedPlaylist);
    
  } catch (error) {
    console.error('Stream proxy error:', error);
    return res.status(500).json({
      error: 'Failed to proxy stream',
      message: error.message
    });
  }
}

export const config = {
  runtime: 'edge', // Use edge runtime for better streaming performance
};
