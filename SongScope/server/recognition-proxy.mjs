import http from "node:http";

const PORT = Number(process.env.PORT || 3210);
const AUDD_TOKEN = (process.env.AUDD_API_TOKEN || "").trim();

if (!AUDD_TOKEN) {
  console.error("Falta AUDD_API_TOKEN. Define la variable de entorno antes de iniciar.");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url !== "/recognize" || req.method !== "POST") {
    writeJson(res, 404, { status: "error", error: "Not found" });
    return;
  }

  try {
    const body = await readJson(req);
    const { base64Audio, mimeType } = body;
    if (!base64Audio) {
      writeJson(res, 400, { status: "error", error: "base64Audio requerido" });
      return;
    }

    const file = base64ToFile(base64Audio, mimeType || "audio/webm");
    const formData = new FormData();
    formData.append("api_token", AUDD_TOKEN);
    formData.append("file", file);
    formData.append("return", "apple_music,spotify,deezer");

    const response = await fetch("https://api.audd.io/", {
      method: "POST",
      body: formData
    });

    const payload = await response.json();
    writeJson(res, response.ok ? 200 : 502, payload);
  } catch (error) {
    writeJson(res, 500, { status: "error", error: String(error.message || error) });
  }
});

server.listen(PORT, () => {
  console.log(`SongScope recognition proxy listening on http://localhost:${PORT}`);
});

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("JSON invalido"));
      }
    });
    req.on("error", reject);
  });
}

function base64ToFile(base64Data, mimeType) {
  const extension = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mp4")
      ? "m4a"
      : "webm";
  const bytes = Buffer.from(base64Data, "base64");
  return new File([bytes], `sample.${extension}`, { type: mimeType });
}
