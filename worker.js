export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (request.method === 'POST') {
      const { mood } = await request.json();
      
      const prompt = {
        messages: [
          { role: 'system', content: 'You are a music expert. Return only a JSON array of songs, each with title, artist, genre, and year properties.' },
          { role: 'user', content: `Generate 12 songs that match this mood: ${mood}. Format as JSON array.` }
        ]
      };

      try {
        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', prompt);
        const songs = JSON.parse(response.response);
        
        return new Response(JSON.stringify(songs), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to generate songs' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    return fetch(request);
  }
};
