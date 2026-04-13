const SERVICE_URLS = {
  spotify: "https://api.spotify.com/v1",
  youtubeMusic: "https://music.youtube.com",
  demus: "https://demus.com",
  appleMusic: "https://api.music.apple.com/v1",
  deezer: "https://api.deezer.com"
};

export async function addTrackToPlatform({ platform, authToken, track }) {
  if (!SERVICE_URLS[platform]) {
    throw new Error(`Plataforma no soportada: ${platform}`);
  }

  if (!authToken) {
    throw new Error(`Falta token OAuth para ${platform}`);
  }

  switch (platform) {
    case "spotify":
      return addToSpotify(authToken, track);
    case "youtubeMusic":
    case "demus":
    case "appleMusic":
    case "deezer":
      return {
        status: "pending",
        message: `Integracion ${platform} pendiente de implementar`
      };
    default:
      return { status: "unsupported" };
  }
}

async function addToSpotify(authToken, track) {
  const playlistId = await getOrCreateSongScopePlaylist(authToken);
  const uri = `spotify:track:${track.spotifyId}`;

  const response = await fetch(
    `${SERVICE_URLS.spotify}/playlists/${playlistId}/tracks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        uris: [uri]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status}`);
  }

  return { status: "ok", platform: "spotify" };
}

async function getOrCreateSongScopePlaylist() {
  return "TODO_PLAYLIST_ID";
}
