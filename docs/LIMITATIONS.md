# Límites conocidos

Este proyecto es deliberadamente honesto sobre lo que puede y no puede hacer. Si tu fallo está en esta lista, no esperes que la extensión lo arregle.

## 1. El portal Wayland destruye el stream

**Qué se ve:** el picker aparece, eliges pantalla, el indicador de compartir parpadea y desaparece. La consola puede mostrar `NotAllowedError`, `AbortError` o `Attempt to postMessage on disconnected port`.

**Por qué no se puede arreglar desde JavaScript:** el track que Firefox entrega a la página ya está muerto o no recibe frames. La causa está en `xdg-desktop-portal`, el backend del compositor o PipeWire. Una extensión no puede resucitar el nodo de PipeWire.

**Qué hacer:** actualizar el portal/backend, probar `force_shm`, usar X11/XWayland o cambiar de navegador. Ver [DIAGNOSIS.md](DIAGNOSIS.md).

## 2. OOM en reuniones largas

**Qué se ve:** tras 30–50 minutos compartiendo, Firefox consume cada vez más memoria y puede morir.

**Por qué no se puede arreglar desde JavaScript:** es un problema del proceso GMP/OpenH264 (bug 2081652). La extensión no controla la memoria del encoder.

**Qué hacer:** cortar y reiniciar la compartición, usar Chromium/Edge para sesiones largas, seguir el bug.

## 3. Audio de sistema o de pestaña

**Qué se ve:** el vídeo se comparte, pero el audio del sistema/pestaña no.

**Por qué no se puede arreglar desde JavaScript:** Firefox no implementa captura de audio en `getDisplayMedia` (bug 1541425). `getDisplayMedia({audio:true})` no devuelve una pista de audio.

**Qué hacer:** usar Chromium/Edge, o un workaround de PipeWire con `module-remap-source` del monitor del sink como micrófono virtual. Ver [AUDIO.md](AUDIO.md).

## 4. Llamadas 1:1

**Qué se ve:** no hay opción de compartir, o falla en una llamada desde el chat.

**Por qué no se puede arreglar:** Microsoft documenta que Firefox no soporta “Calling” (audio, vídeo, sharing), solo “Meetings”. Es una decisión de producto, no una capacidad del navegador.

**Qué hacer:** usar una reunión programada/canal, Edge/Chrome o la app de escritorio.

## 5. Iframes cross-origin sin `allow="display-capture"`

**Qué se ve:** `NotAllowedError` aunque el shim esté inyectado.

**Por qué no se puede arreglar:** la Permissions Policy del iframe lo impide. Firefox no soporta el header HTTP `Permissions-Policy` (bug 1531012), solo el atributo `allow` del iframe. Si el sitio embebido no lo declara, la captura se rechaza.

**Qué hacer:** reportar al sitio; usar una ventana de nivel superior.

## 6. `getDisplayMedia` ausente

**Qué se ve:** `TypeError: navigator.mediaDevices.getDisplayMedia is not a function`.

**Por qué:** Firefox <66, build endurecido, pref `media.getdisplaymedia.enabled=false` o contexto no seguro.

**Qué hacer:** actualizar Firefox, revisar prefs, usar HTTPS.

## 7. Teams cambia sus constraints

**Qué se ve:** la extensión deja de tener efecto tras una actualización de Teams.

**Por qué:** parcheamos APIs estándar, pero Teams puede cambiar la forma de pedir la captura. Es mantenimiento continuo.

**Qué hacer:** abrir un issue con el informe del popup y la versión del cliente.

## 8. UA spoof no es una solución

Puede hacer que Teams tome rutas de Chromium que Firefox no implementa (`navigator.userAgentData`, `MediaStreamTrackProcessor`, `chromeMediaSource`) y empeorar el fallo. No lo usamos.

## 9. La extensión no sustituye al doctor

Si el fallo es de portal, la extensión solo puede decirte “el track murió”. El doctor y los logs del portal son los que identifican la causa real.
