export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    if (request.method === 'POST') {
      const { mood } = await request.json();
      
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': request.headers.get('Origin'),
            'X-Title': 'Feelify'
          },
          body: JSON.stringify({
            model: 'nvidia/llama-3.1-nemotron-nano-8b-v1:free',
            messages: [{
              role: 'system',
              content: 'You are a music expert. Return ONLY a JSON array of songs, each with title, artist, genre, and year properties. No other text.'
            }, {
              role: 'user',
              content: `Generate 12 songs that match this mood: ${mood}. Format as a valid JSON array like this: [{"title":"Song Name","artist":"Artist Name","genre":"Genre","year":"Year"}]`
            }]
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to get suggestions');
        }

        const content = data.choices[0].message.content;
        const jsonMatch = content.match(/\[([\s\S]*?)\]/); 
        const songs = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        
        return new Response(JSON.stringify(songs), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ 
          error: error.message || 'Failed to generate songs'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
};
