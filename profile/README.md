# Perfil dedicado

Un perfil separado evita mezclar las prefs de Teams con la navegación normal. No es obligatorio, pero ayuda a reproducir y aislar fallos.

## Crear el perfil

```bash
firefox --new-instance --profile ~/.mozilla/firefox/teams-share --no-remote
```

Cierra esa instancia y copia `user.js` dentro del perfil:

```bash
cp profile/user.js ~/.mozilla/firefox/teams-share/user.js
```

Vuelve a abrir:

```bash
firefox --new-instance --profile ~/.mozilla/firefox/teams-share --no-remote
```

## PWAsForFirefox

Si usas [PWAsForFirefox](https://github.com/filips123/PWAsForFirefox), puedes usar su plantilla de perfil para inyectar `user.js` y prefs por app. Teams requiere instalar el manifest con el parsing desactivado (ver issue #815 del proyecto).

## Qué no poner

- No pongas `media.navigator.video.resize_mode.enabled=false` como solución permanente: afecta a todas las capturas y puede romper la cámara de Teams.
- No cambies el User-Agent.
- No desactives WebCompat.
