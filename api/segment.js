// api/segment.js (Vercel - Segment Proxy)
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

export default async function handler(req, res) {
  const { url } = req.query;
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (!url) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const decodedUrl = decodeURIComponent(url);
    const response = await fetchWithHeaders(decodedUrl);
    
    // Get content type
    const contentType = response.headers.get('content-type') || 'video/mp2t';
    
    // Stream the segment
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // For edge runtime, we can stream directly
    const buffer = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));
    
  } catch (error) {
    console.error('Segment fetch error:', error);
    return res.status(500).json({
      error: 'Segment fetch failed',
      message: error.message
    });
  }
}

export const config = {
  runtime: 'edge', // Edge runtime for best streaming performance
};
