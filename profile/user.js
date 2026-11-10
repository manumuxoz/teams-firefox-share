// Preferencias para un perfil dedicado a Teams.
// Copia este archivo como user.js dentro del perfil, no en el perfil principal.
// No desactives resizeMode globalmente: la extensión lo corrige por sitio.

user_pref("media.webrtc.capture.allow-pipewire", true);
user_pref("media.gmp-gmpopenh264.enabled", true);
user_pref("media.webrtc.hw.h264.enabled", true);
user_pref("extensions.webcompat.perform_injections", true);

// Opcional: intentar habilitar la pestaña "This Tab" en el selector.
// En ESR puede no aparecer; no es necesario para compartir pantalla/ventana.
// user_pref("media.getusermedia.browser.enabled", true);
