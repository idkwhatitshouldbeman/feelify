export default {
  async fetch(request, env) {
    // Validate API key is present
    if (!env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({
        error: 'API key not configured',
        detail: 'OpenRouter API key is missing from environment variables'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

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
      try {
        const { mood } = await request.json();
        if (!mood) {
          throw new Error('Mood parameter is required');
        }

        console.log(`Processing request for mood: ${mood}`);
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': request.headers.get('Origin') || 'https://feelify.aarohkandy.workers.dev',
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

        if (!response.ok) {
          const data = await response.json();
          console.error('OpenRouter API error:', data);
          throw new Error(data.error?.message || `API request failed with status ${response.status}`);
        }

        const data = await response.json();
        console.log('OpenRouter API response:', data);

        if (!data.choices?.[0]?.message?.content) {
          throw new Error('Invalid API response format');
        }

        const content = data.choices[0].message.content;
        let songs = [];

        try {
          // First try to parse the entire content as JSON
          songs = JSON.parse(content);
        } catch {
          // If that fails, try to extract JSON array using regex
          const jsonMatch = content.match(/\[([\s\S]*?)\]/); 
          if (!jsonMatch) {
            console.error('Failed to extract JSON from content:', content);
            throw new Error('Could not extract song data from API response');
          }
          songs = JSON.parse(jsonMatch[0]);
        }

        // Validate song data
        if (!Array.isArray(songs) || songs.length === 0) {
          throw new Error('No valid songs returned from API');
        }

        // Ensure each song has required properties
        songs = songs.map(song => ({
          title: song.title || 'Unknown Title',
          artist: song.artist || 'Unknown Artist',
          genre: song.genre || 'Unknown Genre',
          year: song.year || 'Unknown Year'
        }));

        console.log(`Successfully generated ${songs.length} songs`);
        
        return new Response(JSON.stringify(songs), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        console.error('Worker error:', error);
        return new Response(JSON.stringify({ 
          error: error.message || 'Failed to generate songs',
          timestamp: new Date().toISOString(),
          mood: mood
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
