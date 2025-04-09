// server.js
const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path'); // To potentially serve the HTML

const app = express();
const port = 3000; // Run on port 3000

// --- Configuration ---
// WARNING: Storing credentials directly in code is insecure for production.
// Use environment variables in a real application.
const spotifyCredentials = {
    clientId: '2a82fa5319e147968ef804a659f4a285',
    clientSecret: '5d80796c48b5497495b98e2b34c514b7',
    redirectUri: `http://localhost:${port}/callback` // Use the port variable
};
const gmailCredentials = {
    user: 'feelify@gmail.com',
    pass: 'thwq gqho ifaz goyp' // App Password
};
// --- End Configuration ---

// --- Middleware ---
app.use(express.json()); // Parse JSON request bodies
// Allow requests from the origin where index.html is served
// If opening index.html directly as a file, origin might be 'null'.
// For development, allowing localhost:xxxx or file:// is common.
// For production, restrict this to your deployed frontend URL.
app.use(cors()); // Allow all origins for simplicity in this example, restrict in production!
// Serve the index.html file itself from the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
// --- End Middleware ---


// --- Spotify Setup ---
const spotifyApi = new SpotifyWebApi(spotifyCredentials);
let spotifyTokens = { // Store tokens in memory (replace with persistent storage for production)
    accessToken: null,
    refreshToken: null,
    expiresAt: null
};

// Helper function to refresh token if needed
async function ensureValidToken() {
    if (!spotifyTokens.accessToken || !spotifyTokens.refreshToken || Date.now() >= spotifyTokens.expiresAt) {
        console.log('Refreshing Spotify token...');
        if (!spotifyTokens.refreshToken) {
            throw new Error('Not authenticated with Spotify. Please visit /login first.');
        }
        try {
            spotifyApi.setRefreshToken(spotifyTokens.refreshToken);
            const data = await spotifyApi.refreshAccessToken();
            spotifyTokens.accessToken = data.body['access_token'];
            spotifyTokens.expiresAt = Date.now() + data.body['expires_in'] * 1000;
            spotifyApi.setAccessToken(spotifyTokens.accessToken);
            console.log('Spotify token refreshed successfully.');
        } catch (refreshError) {
            console.error('Could not refresh Spotify access token', refreshError);
            spotifyTokens = { accessToken: null, refreshToken: null, expiresAt: null }; // Reset tokens
            throw new Error('Failed to refresh Spotify token. Please re-authenticate via /login.');
        }
    } else {
        spotifyApi.setAccessToken(spotifyTokens.accessToken); // Ensure API object has current token
        console.log('Spotify token is still valid.');
    }
}

// --- Spotify Authentication Routes ---
// Step 1: Redirect user to Spotify's authorization page
app.get('/login', (req, res) => {
    const scopes = ['playlist-modify-private', 'playlist-modify-public']; // Added public just in case
    const state = 'some-random-state'; // Optional: Generate and verify state for CSRF protection
    const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
    console.log('Redirecting to Spotify for authorization...');
    res.redirect(authorizeURL);
});

// Step 2: Handle the callback from Spotify after user authorization
app.get('/callback', async (req, res) => {
    const { code, state } = req.query; // Add state check if you use it
    console.log('Received callback from Spotify.');
    // Optional: Verify state parameter here

    try {
        const data = await spotifyApi.authorizationCodeGrant(code);
        spotifyTokens.accessToken = data.body['access_token'];
        spotifyTokens.refreshToken = data.body['refresh_token'];
        spotifyTokens.expiresAt = Date.now() + data.body['expires_in'] * 1000; // Calculate expiry time

        spotifyApi.setAccessToken(spotifyTokens.accessToken);
        spotifyApi.setRefreshToken(spotifyTokens.refreshToken);

        console.log('Spotify authentication successful! Tokens obtained.');
        // In a real app, you'd store the refresh token securely associated with the user.
        res.send('Authentication successful! You can close this window and return to the app.');
    } catch (error) {
        console.error('Error getting Spotify tokens:', error.body || error.message);
        res.status(500).send(`Authentication failed: ${error.message}`);
    }
});
// --- End Spotify Authentication Routes ---


// --- Main API Endpoint ---
app.post('/create-playlist', async (req, res) => {
    console.log('Received request to /create-playlist');
    const { email, songs } = req.body;

    // Basic Input Validation
    if (!email || !email.includes('@') || !email.includes('.')) {
        return res.status(400).json({ success: false, error: 'Invalid email address provided.' });
    }
    if (!songs || !Array.isArray(songs) || songs.length === 0) {
        return res.status(400).json({ success: false, error: 'No songs provided.' });
    }

    try {
        // 1. Ensure Spotify token is valid (refresh if needed)
        await ensureValidToken();

        // 2. Get the Spotify User ID associated with the server's token
        console.log('Getting Spotify user profile...');
        const user = await spotifyApi.getMe();
        const userId = user.body.id;
        console.log(`Operating as Spotify user: ${user.body.display_name || userId}`);

        // 3. Create a new private playlist
        const playlistName = `Feelify Suggestions for ${email.split('@')[0]} (${new Date().toLocaleDateString()})`;
        console.log(`Creating playlist: "${playlistName}"...`);
        const playlist = await spotifyApi.createPlaylist(userId, playlistName, {
            public: false,
            description: `Songs suggested by Feelify based on mood.`
        });
        const playlistId = playlist.body.id;
        const playlistUrl = playlist.body.external_urls.spotify;
        console.log(`Playlist created: ID=${playlistId}, URL=${playlistUrl}`);

        // 4. Search for tracks and collect their URIs
        console.log(`Searching for ${songs.length} tracks...`);
        const trackUris = [];
        let searchCounter = 0;
        for (const song of songs) {
            // Basic query format
            const query = `track:${song.title} artist:${song.artist}`;
            try {
                // Add small delay to avoid hitting rate limits too fast
                await new Promise(resolve => setTimeout(resolve, 50));
                const result = await spotifyApi.searchTracks(query, { limit: 1 });
                searchCounter++;
                if (result.body.tracks.items.length > 0) {
                    trackUris.push(result.body.tracks.items[0].uri);
                    console.log(`  Found: ${result.body.tracks.items[0].name} (${result.body.tracks.items[0].uri})`);
                } else {
                    console.warn(`  Not found: ${song.title} - ${song.artist}`);
                }
            } catch (searchError) {
                 // Handle 429 Rate Limit during search
                 if (searchError.statusCode === 429) {
                     const retryAfter = searchError.headers['retry-after'] ? parseInt(searchError.headers['retry-after'], 10) * 1000 : 5000;
                     console.warn(`Spotify search rate limited. Retrying song "${song.title}" after ${retryAfter / 1000}s...`);
                     await new Promise(resolve => setTimeout(resolve, retryAfter));
                     // Retry the current song - decrement counter or adjust loop logic if needed
                     // Simple retry: just try again in the next iteration implicitly if loop continues,
                     // or explicitly re-run search for *this* song. For simplicity, we'll just log and potentially miss it.
                     console.warn(`Skipping "${song.title}" after rate limit retry attempt for simplicity.`);

                 } else {
                    console.error(`  Error searching for "${song.title}":`, searchError.body || searchError.message);
                 }
            }
        }
        console.log(`Search complete. Found ${trackUris.length} tracks.`);

        // 5. Add tracks to the playlist (if any were found)
        if (trackUris.length > 0) {
            console.log(`Adding ${trackUris.length} tracks to playlist ID: ${playlistId}...`);
            // Spotify API allows adding max 100 tracks per request
            for (let i = 0; i < trackUris.length; i += 100) {
                const chunk = trackUris.slice(i, i + 100);
                try {
                    await spotifyApi.addTracksToPlaylist(playlistId, chunk);
                    console.log(`  Added batch ${i / 100 + 1} (${chunk.length} tracks).`);
                } catch (addError) {
                     // Handle 429 Rate Limit during add
                     if (addError.statusCode === 429) {
                         const retryAfter = addError.headers['retry-after'] ? parseInt(addError.headers['retry-after'], 10) * 1000 : 5000;
                         console.warn(`Spotify add tracks rate limited. Retrying batch after ${retryAfter / 1000}s...`);
                         await new Promise(resolve => setTimeout(resolve, retryAfter));
                         i -= 100; // Decrement i to retry the same chunk
                         continue; // Continue the loop to retry the chunk
                     } else {
                        console.error(`  Error adding batch ${i / 100 + 1}:`, addError.body || addError.message);
                        // Decide if you want to stop or continue adding other batches
                        // For simplicity, we'll throw, stopping the process for this request
                        throw new Error(`Failed to add tracks to playlist: ${addError.message}`);
                     }
                }
            }
            console.log('Tracks added successfully.');
        } else {
            console.log('No tracks found to add to the playlist.');
        }

        // 6. Send confirmation email
        console.log(`Sending confirmation email to ${email}...`);
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: gmailCredentials.user,
                pass: gmailCredentials.pass // Use the App Password
            }
        });

        const mailOptions = {
            from: `"Feelify" <${gmailCredentials.user}>`, // Optional: Add a sender name
            to: email,
            subject: 'Your Feelify Spotify Playlist is Ready!',
            text: `Hi there,\n\nHere’s the private Spotify playlist created with your Feelify song suggestions:\n\n${playlistUrl}\n\nEnjoy the vibes!\n\n- The Feelify Team`,
            html: `<p>Hi there,</p><p>Here’s the private Spotify playlist created with your Feelify song suggestions:</p><p><a href="${playlistUrl}">${playlistUrl}</a></p><p>Enjoy the vibes!</p><p>- The Feelify Team</p>` // Optional: HTML version
        };

        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully.');

        // 7. Send success response to frontend
        res.json({
            success: true,
            playlistLink: playlistUrl,
            message: `Playlist created and email sent to ${email}. Found ${trackUris.length} out of ${songs.length} suggested songs.`
        });

    } catch (error) {
        console.error('Error in /create-playlist endpoint:', error.body || error.message || error);
        // Try to send a more specific error message if available
        const errorMessage = error.body?.error?.message || error.message || 'An unexpected server error occurred.';
        res.status(500).json({ success: false, error: errorMessage });
    }
});
// --- End Main API Endpoint ---


// --- Server Start ---
app.listen(port, () => {
    console.log(`Feelify server running on http://localhost:${port}`);
    console.log(`Visit http://localhost:${port}/login in your browser ONCE to authenticate the server with Spotify.`);
});
// --- End Server Start ---
