const PROXY_ENDPOINT = "https://songscope-recognition.onrender.com/recognize";

export async function recognizeAudioChunk({
  source,
  base64Audio,
  mimeType = "audio/webm"
}) {
  const response = await fetch(PROXY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      source,
      mimeType,
      base64Audio
    })
  });

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
