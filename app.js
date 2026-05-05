// ── IMPORTACIONES FIREBASE ────────────────────────────────────────────────
import { initializeApp }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot,
         query, orderBy, where, doc, setDoc, getDocs, deleteDoc, Timestamp }
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
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const storage     = getStorage(firebaseApp);

// ── ESTADO GLOBAL ─────────────────────────────────────────────────────────
let currentUser      = null;
let mediaRecorder    = null;
let audioChunks      = [];
let audioActivo      = null;
let primeraCarga     = true;
let gpsWatchId       = null;
let unsubMensajes    = null;
let unsubUbicaciones = null;

// ── DOM ───────────────────────────────────────────────────────────────────
const screenLogin  = document.getElementById('screen-login');
const screenApp    = document.getElementById('screen-app');
const formLogin    = document.getElementById('form-login');
const inpEmail     = document.getElementById('inp-email');
const inpPass      = document.getElementById('inp-pass');
const loginError   = document.getElementById('login-error');
const userLabel    = document.getElementById('user-label');
const btnLogout    = document.getElementById('btn-logout');
const chat         = document.getElementById('chat');
const statusEl     = document.getElementById('status');
const wave         = document.getElementById('wave');
const btnPtt       = document.getElementById('btn-ptt');
const pttLabel     = document.getElementById('ptt-label');
const panelGps     = document.getElementById('panel-gps');
const gpsEmpty     = document.getElementById('gps-empty');

// ── HELPERS UI ────────────────────────────────────────────────────────────
function setStatus(texto, clase = '') {
    statusEl.textContent = texto;
    statusEl.className   = clase;
}

function mostrarLogin() {
    screenLogin.style.display = 'flex';
    screenApp.classList.remove('visible');
}

function mostrarApp(user) {
    screenLogin.style.display = 'none';
    screenApp.classList.add('visible');
    // Mostrar solo la parte del email antes del @
    const nombre = user.email.split('@')[0];
    userLabel.textContent = nombre.toUpperCase();
}

// ── TABS ──────────────────────────────────────────────────────────────────
window.switchTab = function(tab) {
    document.getElementById('tab-radio').classList.toggle('active', tab === 'radio');
    document.getElementById('tab-gps').classList.toggle('active',   tab === 'gps');
    document.getElementById('panel-radio').style.display = tab === 'radio' ? 'flex' : 'none';
    panelGps.classList.toggle('visible', tab === 'gps');
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

btnLogout.addEventListener('click', async () => {
    detenerGPS();
    if (unsubMensajes)    unsubMensajes();
    if (unsubUbicaciones) unsubUbicaciones();
    await signOut(auth);
});

// ── AUTH STATE ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
    if (user) {
        currentUser  = user;
        primeraCarga = true;
        mostrarApp(user);
        iniciarMicrofono();
        iniciarGPS();
        escucharMensajes();
        escucharUbicaciones();
        limpiarAudiosViejos();
    } else {
        currentUser = null;
        mostrarLogin();
        detenerMicrofono();
    }
});

// ── MICRÓFONO ─────────────────────────────────────────────────────────────
function iniciarMicrofono() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            // Preferir opus/webm, fallback a lo que soporte el navegador
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            mediaRecorder = new MediaRecorder(stream, { mimeType });

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = subirAudio;
        })
        .catch(() => {
            setStatus('PERMITE EL MICRÓFONO', 'recording');
            btnPtt.disabled = true;
        });
}

function detenerMicrofono() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    mediaRecorder = null;
}

async function subirAudio() {
    if (!currentUser) return;
    setStatus('ENVIANDO...', 'sending');
    try {
        const blob  = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        const ruta  = `audios/${Date.now()}_${currentUser.uid}.webm`;
        const sRef  = ref(storage, ruta);
        await uploadBytes(sRef, blob);
        const url   = await getDownloadURL(sRef);

        // Guardar con timestamp y ruta (para poder borrar el archivo luego)
        await addDoc(collection(db, 'mensajes'), {
            audioUrl:   url,
            storagePath: ruta,
            uid:        currentUser.uid,
            email:      currentUser.email,
            timestamp:  Date.now(),
            expiresAt:  Date.now() + 5 * 24 * 60 * 60 * 1000  // +5 días en ms
        });
        setStatus('LISTO PARA TRANSMITIR');
    } catch (err) {
        console.error('Error subiendo audio:', err);
        setStatus('ERROR AL ENVIAR', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
    }
}

// ── BOTÓN PTT ─────────────────────────────────────────────────────────────
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
    e.preventDefault();
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

// ── MENSAJES EN TIEMPO REAL ───────────────────────────────────────────────
function escucharMensajes() {
    const q = query(collection(db, 'mensajes'), orderBy('timestamp', 'asc'));
    unsubMensajes = onSnapshot(q, snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type !== 'added') return;
            const data   = change.doc.data();
            const esPropio = data.uid === currentUser?.uid;
            agregarMensaje(data, esPropio);

            if (!primeraCarga && !esPropio) {
                reproducir(data.audioUrl);
            }
        });
        primeraCarga = false;
    });
}

function agregarMensaje(data, esPropio) {
    const hora   = new Date(data.timestamp).toLocaleTimeString('es-CO', { hour12: false });
    const nombre = data.email ? data.email.split('@')[0].toUpperCase() : '???';
    const div    = document.createElement('div');
    div.className = `msg${esPropio ? ' own' : ''}`;
    div.innerHTML = `
        <div class="msg-icon">${esPropio ? '🎙️' : '🔊'}</div>
        <div class="msg-body">
            <div class="msg-sender">${nombre}</div>
            <div class="msg-label">${esPropio ? 'Enviaste un audio' : 'Audio recibido'}</div>
            <div class="msg-time">${hora}</div>
        </div>`;
    div.title = 'Toca para reproducir';
    div.addEventListener('click', () => reproducir(data.audioUrl));
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function reproducir(url) {
    if (audioActivo) { audioActivo.pause(); audioActivo = null; }
    audioActivo = new Audio(url);
    audioActivo.play().catch(() => {});
}

// ── GPS SILENCIOSO ────────────────────────────────────────────────────────
// Se actualiza cada vez que el dispositivo detecta un cambio de posición.
// El usuario NO ve ningún aviso de esta función.
function iniciarGPS() {
    if (!navigator.geolocation) return;

    const opciones = {
        enableHighAccuracy: true,
        maximumAge:         30000,   // reusar posición cacheada hasta 30 s
        timeout:            15000
    };

    // Primera lectura inmediata
    navigator.geolocation.getCurrentPosition(enviarUbicacion, () => {}, opciones);

    // Seguimiento continuo
    gpsWatchId = navigator.geolocation.watchPosition(enviarUbicacion, () => {}, opciones);

    // También reportar cada 2 minutos aunque no haya movimiento
    setInterval(() => {
        navigator.geolocation.getCurrentPosition(enviarUbicacion, () => {}, opciones);
    }, 2 * 60 * 1000);
}

function detenerGPS() {
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
}

async function enviarUbicacion(pos) {
    if (!currentUser) return;
    const nombre = currentUser.email.split('@')[0];
    try {
        // setDoc con uid como ID → sobrescribe siempre (1 doc por usuario)
        await setDoc(doc(db, 'ubicaciones', currentUser.uid), {
            uid:       currentUser.uid,
            email:     currentUser.email,
            nombre:    nombre,
            lat:       pos.coords.latitude,
            lng:       pos.coords.longitude,
            accuracy:  Math.round(pos.coords.accuracy),
            updatedAt: Date.now()
        });
    } catch (err) {
        console.warn('GPS no pudo escribir:', err);
    }
}

// ── PANEL GPS (vista para padres) ─────────────────────────────────────────
function escucharUbicaciones() {
    unsubUbicaciones = onSnapshot(collection(db, 'ubicaciones'), snapshot => {
        panelGps.innerHTML = '';  // limpiar

        if (snapshot.empty) {
            panelGps.innerHTML = '<div class="gps-empty">Sin ubicaciones aún.</div>';
            return;
        }

        snapshot.forEach(docSnap => {
            const d       = docSnap.data();
            const esYo    = d.uid === currentUser?.uid;
            const hace    = tiempoRelativo(d.updatedAt);
            const online  = (Date.now() - d.updatedAt) < 5 * 60 * 1000; // < 5 min
            const mapsUrl = `https://www.google.com/maps?q=${d.lat},${d.lng}`;

            const card = document.createElement('div');
            card.className = 'gps-card';
            card.innerHTML = `
                <div class="gps-card-name">
                    ${esYo ? '👤 ' : '📍 '}${d.nombre.toUpperCase()}
                    <span class="gps-badge ${online ? 'online' : 'offline'}">
                        ${online ? 'EN LÍNEA' : 'FUERA'}
                    </span>
                </div>
                <div class="gps-row">LAT: <span>${d.lat.toFixed(6)}</span></div>
                <div class="gps-row">LNG: <span>${d.lng.toFixed(6)}</span></div>
                <div class="gps-row">PRECISIÓN: <span>±${d.accuracy} m</span></div>
                <div class="gps-row">ACTUALIZADO: <span>${hace}</span></div>
                <a class="gps-link" href="${mapsUrl}" target="_blank">
                    🗺️ VER EN MAPA
                </a>`;
            panelGps.appendChild(card);
        });
    });
}

function tiempoRelativo(ts) {
    const seg = Math.floor((Date.now() - ts) / 1000);
    if (seg < 60)  return `hace ${seg}s`;
    if (seg < 3600) return `hace ${Math.floor(seg/60)}min`;
    return `hace ${Math.floor(seg/3600)}h`;
}

// ── LIMPIEZA AUTOMÁTICA DE AUDIOS > 5 DÍAS ───────────────────────────────
// Se ejecuta una vez al iniciar sesión.
// Borra el documento de Firestore Y el archivo de Storage.
async function limpiarAudiosViejos() {
    try {
        const limite = Date.now() - 5 * 24 * 60 * 60 * 1000;
        const q      = query(
            collection(db, 'mensajes'),
            where('expiresAt', '<', limite)
        );
        // Nota: también funciona con where('timestamp', '<', limite) si los
        // documentos antiguos no tienen campo expiresAt.
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            // Borrar archivo de Storage si tenemos la ruta
            if (data.storagePath) {
                try {
                    await deleteObject(ref(storage, data.storagePath));
                } catch (_) { /* el archivo ya no existe, ignorar */ }
            }
            await deleteDoc(doc(db, 'mensajes', docSnap.id));
        }
        if (snap.size > 0) {
            console.log(`🧹 ${snap.size} audio(s) eliminado(s) por expiración.`);
        }
    } catch (err) {
        console.warn('No se pudo limpiar audios viejos:', err);
    }
}
