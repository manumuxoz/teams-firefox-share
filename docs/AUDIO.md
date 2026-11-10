# Audio de sistema o pestaña

Firefox **no implementa captura de audio en `getDisplayMedia`**. No es un bug de Teams ni de la extensión: es una capacidad ausente en Gecko (bug 1541425, abierto). `getDisplayMedia({audio:true})` devuelve solo vídeo, y `systemAudio`/`windowAudio` no existen.

## Opciones

### 1. Usar Chromium/Edge para la reunión

Es la vía más fiable si necesitas compartir audio del sistema. Teams en Chrome/Edge soporta la captura de audio de pestaña/sistema según la plataforma.

### 2. Micrófono virtual con PipeWire

Puedes exponer el monitor del sink como un micrófono virtual y seleccionarlo en Teams como micrófono. No es “audio de pantalla” integrado, pero funciona para compartir música o el audio de una aplicación.

```bash
# Ver los monitores disponibles
pactl list short sources | grep -i monitor

# Crear un source remapeado (ejemplo: monitor de la salida por defecto)
pactl load-module module-remap-source \
  master="$(pactl get-default-sink).monitor" \
  source_name=teams_share_audio \
  source_properties=device.description=TeamsShareAudio
```

En Teams:

1. Configuración → Dispositivos → Micrófono → `TeamsShareAudio`.
2. Comprueba el nivel en la vista previa.
3. Si no aparece, reinicia PipeWire/WirePlumber o vuelve a abrir Teams.

Para eliminar el módulo:

```bash
pactl list short modules | grep remap
pactl unload-module <id>
```

### 3. No usar “compartir audio del sistema” en Firefox

Si Teams ofrece la opción, no esperes que funcione: Firefox la ignora. La extensión no puede cambiarlo porque no hay pista de audio que entregar.

## Referencias

- Bug 1541425: <https://bugzilla.mozilla.org/show_bug.cgi?id=1541425>
- MDN BCD `getDisplayMedia` audio capture: <https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json>
- PipeWire/PulseAudio `module-remap-source`: documentación de `pactl`.
