// api/debug.js - Debug endpoint to test configuration
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const TOKEN_SERVICE_URL = process.env.TOKEN_SERVICE_URL || 'https://tokenstream-leapcell-cwd2735402-shrvqo30.leapcell.dev';
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: {
      tokenServiceUrl: TOKEN_SERVICE_URL,
      hasEnvVar: !!process.env.TOKEN_SERVICE_URL,
    },
    request: {
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
    }
  };

  // Test token service connection
  try {
    const healthResponse = await fetch(`${TOKEN_SERVICE_URL}/health`);
    debugInfo.tokenService = {
      reachable: healthResponse.ok,
      status: healthResponse.status,
      data: healthResponse.ok ? await healthResponse.json() : null
    };
  } catch (error) {
    debugInfo.tokenService = {
      reachable: false,
      error: error.message
    };
  }

  // Test list.json loading
  try {
    const configUrl = new URL('/list.json', req.url);
    const configResponse = await fetch(configUrl.toString());
    debugInfo.listJson = {
      url: configUrl.toString(),
      reachable: configResponse.ok,
      status: configResponse.status,
      data: configResponse.ok ? await configResponse.json() : null
    };
  } catch (error) {
    debugInfo.listJson = {
      reachable: false,
      error: error.message
    };
  }

  return new Response(
    JSON.stringify(debugInfo, null, 2), 
    { 
      status: 200, 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      } 
    }
  );
}
