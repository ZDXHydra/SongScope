const PROXY_BASE_URL = "https://songscope-recognition.onrender.com";
const PROXY_ENDPOINTS = [
  `${PROXY_BASE_URL}/recognize`,
  `${PROXY_BASE_URL}/recognize/`
];

export async function recognizeAudioChunk({
  source,
  base64Audio,
  mimeType = "audio/webm"
}) {
  const requestBody = JSON.stringify({
    source,
    mimeType,
    base64Audio
  });

  const response = await fetchWithEndpointFallback(requestBody);

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error("Motor de reconocimiento no disponible en la nube.");
    }
    throw new Error(`Recognition API error: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== "success") {
    const apiMessage =
      payload.error?.error_message ||
      payload.error?.message ||
      payload.error ||
      "Respuesta invalida del servicio";
    throw new Error(`Error del servicio de reconocimiento: ${apiMessage}`);
  }

  if (!payload.result) {
    throw new Error(
      `No se pudo reconocer audio desde ${source}. Prueba con mas volumen o un fragmento mas limpio.`
    );
  }

  return payload.result;
}

async function fetchWithEndpointFallback(requestBody) {
  let lastResponse = null;
  for (const endpoint of PROXY_ENDPOINTS) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: requestBody
    });

    if (response.status !== 404) {
      return response;
    }
    lastResponse = response;
  }

  if (lastResponse) {
    throw new Error(
      "El endpoint cloud no existe (404). Revisa URL y redeploy del proxy."
    );
  }
  throw new Error("No se pudo contactar con el servicio cloud.");
}
