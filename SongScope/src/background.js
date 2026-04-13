import { recognizeAudioChunk } from "./lib/recognitionClient.js";
import { addTrackToPlatform } from "./lib/platformAdapters.js";

const ext = globalThis.browser ?? globalThis.chrome;

const state = {
  lastTrack: null
};

ext.runtime.onMessage.addListener(async (message) => {
  try {
    switch (message.type) {
      case "RECOGNIZE_FROM_MIC":
        return recognizeFromMic(message.payload);
      case "RECOGNIZE_FROM_TAB":
        return recognizeFromTab(message.payload);
      case "ADD_TRACK_TO_PLATFORM":
        return saveTrack(message.payload);
      case "GET_LAST_TRACK":
        return { track: state.lastTrack };
      default:
        return { error: "UNKNOWN_ACTION" };
    }
  } catch (error) {
    return { error: error.message || "Error inesperado" };
  }
});

async function recognizeFromMic(payload) {
  const result = await recognizeAudioChunk({
    source: "microphone",
    base64Audio: payload.base64Audio,
    mimeType: payload.mimeType
  });

  state.lastTrack = normalizeTrackResult(result);
  return { track: state.lastTrack };
}

async function recognizeFromTab(payload) {
  const result = await recognizeAudioChunk({
    source: "tab",
    base64Audio: payload.base64Audio,
    mimeType: payload.mimeType
  });

  state.lastTrack = normalizeTrackResult(result);
  return { track: state.lastTrack };
}

async function saveTrack(payload) {
  if (!state.lastTrack) {
    throw new Error("No hay track reconocido");
  }

  return addTrackToPlatform({
    platform: payload.platform,
    authToken: payload.authToken,
    track: state.lastTrack
  });
}

function normalizeTrackResult(rawResult) {
  const artworkFromSpotify = rawResult?.spotify?.album?.images?.[0]?.url || "";
  const appleArtworkTemplate = rawResult?.apple_music?.artwork?.url || "";
  const artworkFromApple = appleArtworkTemplate
    ? appleArtworkTemplate.replace("{w}", "300").replace("{h}", "300")
    : "";

  return {
    title: rawResult?.title || "Desconocido",
    artist: rawResult?.artist || "Desconocido",
    album: rawResult?.album || "",
    spotifyId: rawResult?.spotify?.id || "",
    artworkUrl: artworkFromSpotify || artworkFromApple
  };
}
