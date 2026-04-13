const trackTitle = document.getElementById("track-title");
const trackArtist = document.getElementById("track-artist");
const trackCover = document.getElementById("track-cover");
const trackCoverPlaceholder = document.getElementById("track-cover-placeholder");
const statusEl = document.getElementById("status");
const identifyBtn = document.getElementById("identify");
const modeTabBtn = document.getElementById("mode-tab");
const modeMicBtn = document.getElementById("mode-mic");
const modeTabLabel = document.getElementById("mode-tab-label");
const modeMicLabel = document.getElementById("mode-mic-label");
const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
const sectionListen = document.getElementById("section-listen");
const sectionHistory = document.getElementById("section-history");
const sectionPlatforms = document.getElementById("section-platforms");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");
const clearHistoryBtn = document.getElementById("clear-history");
const permissionOverlay = document.getElementById("permission-overlay");
const grantPermissionsBtn = document.getElementById("grant-permissions");
const permissionStatus = document.getElementById("permission-status");
const toggleSettingsBtn = document.getElementById("toggle-settings");
const settingsPanel = document.getElementById("settings-panel");
const languageTrigger = document.getElementById("language-trigger");
const languageMenu = document.getElementById("language-menu");
const identifyLabel = document.getElementById("identify-label");
const historyTab = document.querySelector('[data-tab="history"]');
const platformsTab = document.querySelector('[data-tab="platforms"]');
const listenTab = document.querySelector('[data-tab="listen"]');
const recognitionEngineLabel = document.getElementById("recognition-engine-label");
const recognitionEngineValue = document.getElementById("recognition-engine-value");
const languageLabel = document.getElementById("language-label");
const permissionsTitle = document.getElementById("permissions-title");
const permissionsDescription = document.getElementById("permissions-description");
const permissionsMic = document.getElementById("permissions-mic");
const permissionsTab = document.getElementById("permissions-tab");
const ext = globalThis.browser ?? globalThis.chrome;
let activeMode = "tab";
let recognitionHistory = [];
let uiLanguage = "es";
let selectedLanguageCode = "auto";

identifyBtn.addEventListener("click", async () => {
  await runRecognition(activeMode);
});

modeTabBtn.addEventListener("click", () => {
  activeMode = "tab";
  modeTabBtn.classList.add("active");
  modeMicBtn.classList.remove("active");
});

modeMicBtn.addEventListener("click", () => {
  activeMode = "mic";
  modeMicBtn.classList.add("active");
  modeTabBtn.classList.remove("active");
});

toggleSettingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activateTab(button.dataset.tab);
  });
});
clearHistoryBtn.addEventListener("click", async () => {
  await clearHistory();
});

grantPermissionsBtn.addEventListener("click", async () => {
  await requestInitialPermissions();
});

languageTrigger.addEventListener("click", () => {
  languageMenu.classList.toggle("hidden");
});
document.addEventListener("click", (event) => {
  const target = event.target;
  if (
    target instanceof Node &&
    !languageMenu.classList.contains("hidden") &&
    !languageMenu.contains(target) &&
    target !== languageTrigger
  ) {
    languageMenu.classList.add("hidden");
  }
});

async function refreshTrack() {
  try {
    const stored = await ext.storage.local.get([
      "permissions_granted",
      "recognition_history",
      "app_language"
    ]);

    recognitionHistory = Array.isArray(stored.recognition_history)
      ? stored.recognition_history
      : [];
    renderHistory();

    selectedLanguageCode = stored.app_language || "auto";
    uiLanguage = selectedLanguageCode === "auto" ? detectBrowserLanguage() : selectedLanguageCode;
    await populateLanguageSelect(selectedLanguageCode);
    applyTranslations();

    const result = await ext.runtime.sendMessage({ type: "GET_LAST_TRACK" });
    if (result.track) {
      renderTrack(result.track);
    }

    updatePermissionUi(Boolean(stored.permissions_granted));
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderTrack(track) {
  trackTitle.textContent = track.title;
  trackArtist.textContent = `${track.artist}${track.album ? ` - ${track.album}` : ""}`;
  if (track.artworkUrl) {
    trackCover.src = track.artworkUrl;
    trackCover.classList.remove("hidden");
    trackCoverPlaceholder.classList.add("hidden");
  } else {
    trackCover.removeAttribute("src");
    trackCover.classList.add("hidden");
    trackCoverPlaceholder.classList.remove("hidden");
  }
}

async function runRecognition(source) {
  try {
    const permissionState = await ext.storage.local.get("permissions_granted");
    if (!permissionState.permissions_granted) {
      throw new Error("Primero concede permisos para usar la extension.");
    }
    identifyBtn.disabled = true;
    setStatus(
      source === "mic"
        ? "Grabando desde microfono..."
        : "Capturando audio de pestana..."
    );

    const stream = await getSourceStream(source);
    const playback = source === "tab" ? startLocalTabPlayback(stream) : null;
    let recordedBlob;
    try {
      recordedBlob = await recordAudioForSeconds(stream, 12);
    } finally {
      stopLocalTabPlayback(playback);
      stopStream(stream);
    }

    const base64Audio = await blobToBase64(recordedBlob);
    const payload = {
      base64Audio,
      mimeType: recordedBlob.type || "audio/webm"
    };

    setStatus("Reconociendo pista...");
    const result = await ext.runtime.sendMessage({
      type: source === "mic" ? "RECOGNIZE_FROM_MIC" : "RECOGNIZE_FROM_TAB",
      payload
    });

    if (result?.error) {
      throw new Error(result.error);
    }

    renderTrack(result.track);
    await saveTrackToHistory(result.track);
    setStatus("Pista reconocida.");
  } catch (error) {
    setStatus(error.message || "Error durante reconocimiento", true);
  } finally {
    identifyBtn.disabled = false;
  }
}

async function getSourceStream(source) {
  if (source === "mic") {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
  }

  if (ext.tabCapture?.capture) {
    return captureTabAudioChrome();
  }

  return navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true
  });
}

function recordAudioForSeconds(stream, seconds) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const mimeType = getBestRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
      : new MediaRecorder(stream, { audioBitsPerSecond: 128000 });

    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => reject(new Error("No se pudo grabar el audio"));
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };

    recorder.start();
    setTimeout(() => recorder.stop(), seconds * 1000);
  });
}

function getBestRecorderMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result || "";
      const base64Part = String(result).split(",")[1];
      if (!base64Part) {
        reject(new Error("No se pudo convertir audio"));
        return;
      }
      resolve(base64Part);
    };
    reader.onerror = () => reject(new Error("Error leyendo audio"));
    reader.readAsDataURL(blob);
  });
}

function stopStream(stream) {
  stream.getTracks().forEach((track) => track.stop());
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ff9fb4" : "";
}

async function requestInitialPermissions() {
  try {
    grantPermissionsBtn.disabled = true;
    permissionStatus.textContent = "Solicitando permiso de extension para pestana...";

    const tabPermissionGranted = await requestTabCapturePermission();
    if (!tabPermissionGranted) {
      throw new Error("No se concedio permiso tabCapture de la extension.");
    }

    permissionStatus.textContent = "Solicitando microfono en Chrome...";

    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });
    stopStream(micStream);

    permissionStatus.textContent = "Permisos listos.";

    await ext.storage.local.set({ permissions_granted: true });
    updatePermissionUi(true);
    setStatus("Permisos concedidos. Ya puedes identificar musica.");
  } catch (error) {
    permissionStatus.textContent = "No se completaron permisos. Intenta de nuevo.";
    setStatus(error.message || "Permisos denegados", true);
  } finally {
    grantPermissionsBtn.disabled = false;
  }
}

function updatePermissionUi(granted) {
  permissionOverlay.classList.toggle("hidden", granted);
  identifyBtn.disabled = !granted;
}

function activateTab(tabId) {
  tabButtons.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabId);
  });
  sectionListen.classList.toggle("hidden", tabId !== "listen");
  sectionHistory.classList.toggle("hidden", tabId !== "history");
  sectionPlatforms.classList.toggle("hidden", tabId !== "platforms");
}

async function saveTrackToHistory(track) {
  const item = {
    ...track,
    recognizedAt: new Date().toISOString()
  };
  recognitionHistory = [item, ...recognitionHistory].slice(0, 30);
  await ext.storage.local.set({ recognition_history: recognitionHistory });
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";
  historyEmpty.classList.toggle("hidden", recognitionHistory.length > 0);
  clearHistoryBtn.disabled = recognitionHistory.length === 0;

  recognitionHistory.forEach((item) => {
    const node = document.createElement("div");
    node.className = "history-item";
    const date = new Date(item.recognizedAt);
    const when = Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString();
    node.innerHTML = `
      <div class="history-row">
        <img class="history-cover" src="${escapeHtml(item.artworkUrl || "")}" alt="cover" ${item.artworkUrl ? "" : "style='display:none'"} />
        <div>
          <div><strong>${escapeHtml(item.title || "Desconocido")}</strong></div>
          <div class="muted">${escapeHtml(item.artist || "Desconocido")}${item.album ? ` - ${escapeHtml(item.album)}` : ""}</div>
          <div class="muted">${escapeHtml(when)}</div>
        </div>
      </div>
    `;
    historyList.appendChild(node);
  });
}

async function populateLanguageSelect(storedLanguage) {
  const languages = getLanguageOptions();
  const selected = storedLanguage || "auto";
  selectedLanguageCode = languages.some((item) => item.code === selected) ? selected : "auto";
  renderLanguageMenu();
}

function getLanguageOptions() {
  return [
    { code: "auto", label: "Automatico (navegador)" },
    { code: "ar", label: "Arabe" },
    { code: "bg", label: "Bulgaro" },
    { code: "bn", label: "Bengali" },
    { code: "ca", label: "Catalan" },
    { code: "cs", label: "Checo" },
    { code: "da", label: "Danes" },
    { code: "de", label: "Aleman" },
    { code: "el", label: "Griego" },
    { code: "en", label: "Ingles" },
    { code: "es", label: "Espanol" },
    { code: "et", label: "Estonio" },
    { code: "fa", label: "Persa" },
    { code: "fi", label: "Finlandes" },
    { code: "fil", label: "Filipino" },
    { code: "fr", label: "Frances" },
    { code: "gu", label: "Gujarati" },
    { code: "he", label: "Hebreo" },
    { code: "hi", label: "Hindi" },
    { code: "hr", label: "Croata" },
    { code: "hu", label: "Hungaro" },
    { code: "id", label: "Indonesio" },
    { code: "it", label: "Italiano" },
    { code: "ja", label: "Japones" },
    { code: "kn", label: "Kannada" },
    { code: "ko", label: "Coreano" },
    { code: "lt", label: "Lituano" },
    { code: "lv", label: "Leton" },
    { code: "ml", label: "Malayalam" },
    { code: "mr", label: "Marati" },
    { code: "ms", label: "Malayo" },
    { code: "nl", label: "Neerlandes" },
    { code: "no", label: "Noruego" },
    { code: "pl", label: "Polaco" },
    { code: "pt", label: "Portugues" },
    { code: "ro", label: "Rumano" },
    { code: "ru", label: "Ruso" },
    { code: "sk", label: "Eslovaco" },
    { code: "sl", label: "Esloveno" },
    { code: "sr", label: "Serbio" },
    { code: "sv", label: "Sueco" },
    { code: "sw", label: "Suajili" },
    { code: "ta", label: "Tamil" },
    { code: "te", label: "Telugu" },
    { code: "th", label: "Tailandes" },
    { code: "tr", label: "Turco" },
    { code: "uk", label: "Ucraniano" },
    { code: "ur", label: "Urdu" },
    { code: "vi", label: "Vietnamita" },
    { code: "zh", label: "Chino" }
  ];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function detectBrowserLanguage() {
  const fromBrowser = (navigator.language || "en").split("-")[0].toLowerCase();
  return getLanguageOptions().some((entry) => entry.code === fromBrowser)
    ? fromBrowser
    : "en";
}

function getI18nMessages(lang) {
  const dict = {
    es: {
      listen: "Escuchar",
      history: "Historial",
      platforms: "Plataformas",
      modeTab: "Pestana",
      modeMic: "Microfono",
      identify: "Toca para identificar",
      recognitionEngineLabel: "Motor de reconocimiento",
      recognitionEngineValue: "SongScope Secure Engine (token gestionado en servidor)",
      languageLabel: "Idioma",
      permissionsTitle: "Permisos necesarios",
      permissionsDescription: "Antes de usar SongScope necesitamos permisos para capturar audio.",
      permissionsMic: "Microfono del equipo",
      permissionsTab: "Captura de pestana/pantalla con audio",
      grantPermissions: "Conceder permisos y continuar",
      historyEmpty: "Aun no hay canciones reconocidas.",
      clearHistory: "Limpiar historial",
      clearHistoryConfirm: "¿Seguro que quieres borrar todo el historial?"
    },
    en: {
      listen: "Listen",
      history: "History",
      platforms: "Platforms",
      modeTab: "Tab",
      modeMic: "Microphone",
      identify: "Tap to identify",
      recognitionEngineLabel: "Recognition engine",
      recognitionEngineValue: "SongScope Secure Engine (server-managed token)",
      languageLabel: "Language",
      permissionsTitle: "Required permissions",
      permissionsDescription: "Before using SongScope we need audio capture permissions.",
      permissionsMic: "Device microphone",
      permissionsTab: "Tab/screen capture with audio",
      grantPermissions: "Grant permissions and continue",
      historyEmpty: "No recognized songs yet.",
      clearHistory: "Clear history",
      clearHistoryConfirm: "Are you sure you want to remove all history?"
    },
    fr: {
      listen: "Ecouter",
      history: "Historique",
      platforms: "Plateformes",
      modeTab: "Onglet",
      modeMic: "Microphone",
      identify: "Touchez pour identifier",
      recognitionEngineLabel: "Moteur de reconnaissance",
      recognitionEngineValue: "SongScope Secure Engine (jeton gere cote serveur)",
      languageLabel: "Langue",
      permissionsTitle: "Autorisations requises",
      permissionsDescription: "Avant d'utiliser SongScope, nous avons besoin des autorisations audio.",
      permissionsMic: "Microphone de l'appareil",
      permissionsTab: "Capture d'onglet/ecran avec audio",
      grantPermissions: "Accorder les autorisations",
      historyEmpty: "Aucune chanson reconnue.",
      clearHistory: "Effacer l'historique",
      clearHistoryConfirm: "Voulez-vous vraiment supprimer tout l'historique ?"
    },
    de: {
      listen: "Anhoren",
      history: "Verlauf",
      platforms: "Plattformen",
      modeTab: "Tab",
      modeMic: "Mikrofon",
      identify: "Tippen zum Erkennen",
      recognitionEngineLabel: "Erkennungs-Engine",
      recognitionEngineValue: "SongScope Secure Engine (serverseitig verwaltetes Token)",
      languageLabel: "Sprache",
      permissionsTitle: "Erforderliche Berechtigungen",
      permissionsDescription: "Vor der Nutzung von SongScope werden Audioberechtigungen benotigt.",
      permissionsMic: "Mikrofon des Gerats",
      permissionsTab: "Tab-/Bildschirmaufnahme mit Audio",
      grantPermissions: "Berechtigungen erteilen",
      historyEmpty: "Noch keine erkannten Songs.",
      clearHistory: "Verlauf loschen",
      clearHistoryConfirm: "Mochtest du wirklich den gesamten Verlauf loschen?"
    }
  };

  return dict[lang] || dict.en;
}

function applyTranslations() {
  const t = getI18nMessages(uiLanguage);
  listenTab.textContent = t.listen;
  historyTab.textContent = t.history;
  platformsTab.textContent = t.platforms;
  modeTabLabel.textContent = t.modeTab;
  modeMicLabel.textContent = t.modeMic;
  identifyLabel.textContent = t.identify;
  recognitionEngineLabel.textContent = t.recognitionEngineLabel;
  recognitionEngineValue.textContent = t.recognitionEngineValue;
  languageLabel.textContent = t.languageLabel;
  permissionsTitle.textContent = t.permissionsTitle;
  permissionsDescription.textContent = t.permissionsDescription;
  permissionsMic.textContent = t.permissionsMic;
  permissionsTab.textContent = t.permissionsTab;
  grantPermissionsBtn.textContent = t.grantPermissions;
  historyEmpty.textContent = t.historyEmpty;
  clearHistoryBtn.textContent = t.clearHistory;
  document.documentElement.lang = uiLanguage;
  updateLanguageTriggerLabel();
}

async function clearHistory() {
  const t = getI18nMessages(uiLanguage);
  const confirmed = globalThis.confirm(t.clearHistoryConfirm);
  if (!confirmed) {
    return;
  }

  recognitionHistory = [];
  await ext.storage.local.set({ recognition_history: [] });
  renderHistory();
  setStatus(t.clearHistory);
}

function renderLanguageMenu() {
  const languages = getLanguageOptions();
  languageMenu.innerHTML = "";
  languages.forEach((entry) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `language-item ${entry.code === selectedLanguageCode ? "active" : ""}`;
    item.textContent = `${entry.label} (${entry.code})`;
    item.addEventListener("click", async () => {
      selectedLanguageCode = entry.code;
      uiLanguage = selectedLanguageCode === "auto" ? detectBrowserLanguage() : selectedLanguageCode;
      await ext.storage.local.set({ app_language: selectedLanguageCode });
      languageMenu.classList.add("hidden");
      renderLanguageMenu();
      applyTranslations();
    });
    languageMenu.appendChild(item);
  });
  updateLanguageTriggerLabel();
}

function updateLanguageTriggerLabel() {
  const selected = getLanguageOptions().find((entry) => entry.code === selectedLanguageCode);
  languageTrigger.textContent = selected
    ? `${selected.label} (${selected.code})`
    : "Automatico (auto)";
}

function requestTabCapturePermission() {
  if (!ext.permissions?.request) {
    return Promise.resolve(true);
  }

  if (ext.permissions.request.length > 1) {
    return new Promise((resolve) => {
      ext.permissions.request({ permissions: ["tabCapture"] }, (granted) => {
        resolve(Boolean(granted));
      });
    });
  }

  return ext.permissions.request({ permissions: ["tabCapture"] });
}

function captureTabAudioChrome() {
  return new Promise((resolve, reject) => {
    ext.tabCapture.capture(
      {
        audio: true,
        video: false
      },
      (stream) => {
        if (!stream) {
          reject(
            new Error(
              "Chrome no pudo capturar audio de pestana. Verifica que la pestana actual tenga sonido."
            )
          );
          return;
        }
        resolve(stream);
      }
    );
  });
}

function startLocalTabPlayback(stream) {
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) {
    return null;
  }

  const playbackStream = new MediaStream(audioTracks);
  const player = new Audio();
  player.srcObject = playbackStream;
  player.volume = 1;
  player.play().catch(() => {});
  return { player, playbackStream };
}

function stopLocalTabPlayback(playback) {
  if (!playback) {
    return;
  }
  playback.player.pause();
  playback.player.srcObject = null;
}

refreshTrack();
