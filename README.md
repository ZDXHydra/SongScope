# SongScope

Extension WebExtension para reconocer musica reproducida en el navegador o capturada por microfono, y guardarla en plataformas musicales.

## Objetivo del MVP

- Reconocer una pista desde dos fuentes:
  - Audio de pestana (video, pelicula, streaming).
  - Microfono del equipo.
- Mostrar resultado unificado (titulo, artista, album, ids por plataforma).
- Guardar la pista en servicios conectados por OAuth (Spotify primero).

## Arquitectura propuesta

1. **Extension (este repo)**
   - `src/popup`: UI y acciones del usuario.
   - `src/background.js`: orquestacion de reconocimiento y guardado.
   - `src/lib/recognitionClient.js`: cliente HTTP al backend de fingerprinting.
   - `src/lib/platformAdapters.js`: conectores para Spotify, YouTube Music, Demus, Apple Music, Deezer.

2. **Backend de reconocimiento (siguiente repo/servicio)**
   - API `POST /v1/recognize`.
   - Fingerprinting de audio (ej. AudD, ACRCloud, ShazamKit server-side, etc.).
   - Normalizacion de metadata y mapeo de IDs por plataforma.

3. **Backend OAuth (puede unirse al backend de reconocimiento)**
   - Flujo OAuth por plataforma.
   - Almacenamiento seguro de refresh tokens.
   - Endpoints para alta de canciones/listas.

## Compatibilidad real por navegador

- **Chromium (Chrome/Edge/Brave/Opera)**: mejor soporte para captura de audio de pestana.
- **Firefox**: posible, pero con diferencias en APIs y permisos.
- **Safari**: soporte de extensiones existe, pero algunas APIs multimedia cambian y puede requerir adaptacion especifica en Xcode.

Conclusión: la estrategia recomendada es un **core compartido** + capas por navegador.

## Estado actual del scaffold

- Estructura base lista.
- Flujo de mensajes popup -> background listo.
- Cliente de reconocimiento conectado a proxy local seguro.
- Adaptador Spotify iniciado (falta implementacion completa de playlist y OAuth en extension/backend).
- Resto de plataformas marcadas como pendientes.

## Reconocimiento en la nube (sin token en cliente)

El `api_token` de AudD no debe ir en la extension (seria visible para cualquiera).  
Por eso SongScope debe usar un proxy en la nube:

1. Despliega `server/recognition-proxy.mjs` en tu proveedor cloud (Render, Railway, Fly, etc.).
2. Configura variable de entorno segura:
   - `AUDD_API_TOKEN=tu_token_privado`
3. Publica el endpoint HTTPS:
   - `https://TU-DOMINIO/recognize`
4. Actualiza `src/lib/recognitionClient.js` en `PROXY_ENDPOINT` con ese dominio.

La extension ya esta preparada para no pedir token al usuario final.

Importante: si tu token se expuso, revocalo y genera uno nuevo en [dashboard.audd.io](https://dashboard.audd.io).

## Siguientes pasos recomendados

1. Implementar captura real:
   - Pestana: `tabCapture`/`getDisplayMedia` segun navegador.
   - Microfono: `getUserMedia` + corte en chunks.
2. Levantar backend de reconocimiento y conectar `DEFAULT_ENDPOINT`.
3. Implementar OAuth completo (Spotify primero).
4. Crear empaquetado por navegador:
   - Chromium: zip de extension.
   - Firefox: `web-ext`.
   - Safari: conversion con herramientas de Apple.
