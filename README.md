# Radio Familiar ajustada

Cambios aplicados:

1. Se eliminó el flujo de QR/código de la app.
2. El lobby muestra usuarios registrados con estado online/offline.
3. Se puede iniciar chat directo tocando un usuario o usando el botón CHAT.
4. Se pueden crear grupos seleccionando usuarios registrados.
5. Se agregó presencia global cada 30 segundos.
6. Se cambió la ruta de audios a `audios/{mundoId}/{uid}/{archivo}` para reglas de Storage más seguras.
7. Se dejó App Check preparado con reCAPTCHA Enterprise. Debes reemplazar `PEGA_AQUI_TU_SITE_KEY_DE_RECAPTCHA_ENTERPRISE` en `app.js`.
8. Se incluyeron reglas nuevas de Firestore y Storage.

Pasos:

1. Sube estos archivos a tu hosting.
2. Pega `firestore.rules` en Firestore Rules.
3. Pega `storage.rules` en Storage Rules.
4. En Storage, acepta Ajustar permisos cuando Firebase lo pida para consultar Firestore desde Storage Rules.
5. En Firebase Console > App Check, registra la app web y pega el site key en `app.js`.
6. Primero prueba App Check sin enforcement. Después actívalo para Firestore y Storage.

Nota:
Los usuarios aparecerán en la lista cuando hayan iniciado sesión al menos una vez en la app, porque ahí se crea/actualiza `/usuarios/{uid}`.
