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
let currentUser        = null;
let mundoActivo        = null;   // { id, nombre, codigo, ownerUid, miembros, esPropio }
let mundoActivoRefData = null;
let mediaRecorder      = null;
let recorderMimeType   = 'audio/webm';
let audioStream        = null;
let descartarAudio     = false;
let audioChunks        = [];
let audioActivo        = null;
let primeraCarga       = true;
let gpsWatchId         = null;
let gpsIntervalId      = null;
let presenceIntervalId = null;
let unsubMensajes      = null;
let unsubUbicaciones   = null;
let ultimaPosicion     = null;
let audioContext       = null;
let nuevosPendientes   = 0;
let qrScanStream       = null;
let qrScanTimer        = null;
let parentPinMode      = 'verify';
let avatarSeleccionado = '👤';

// ── DOM ───────────────────────────────────────────────────────────────────
const screenLogin     = document.getElementById('screen-login');
const screenMundos    = document.getElementById('screen-mundos');
const screenApp       = document.getElementById('screen-app');
const formLogin       = document.getElementById('form-login');
const inpEmail        = document.getElementById('inp-email');
const inpPass         = document.getElementById('inp-pass');
const loginError      = document.getElementById('login-error');
const mundosBody      = document.getElementById('mundos-body');
const mundosUserLbl   = document.getElementById('mundos-user-label');
const userLabel       = document.getElementById('user-label');
const mundoActivoLbl  = document.getElementById('mundo-activo-label');
const chat            = document.getElementById('chat');
const statusEl        = document.getElementById('status');
const wave            = document.getElementById('wave');
const btnPtt          = document.getElementById('btn-ptt');
const pttLabel        = document.getElementById('ptt-label');
const panelGps        = document.getElementById('panel-gps');
const modalUnirse     = document.getElementById('modal-unirse');
const inpCodigo       = document.getElementById('inp-codigo');
const modalError      = document.getElementById('modal-error');
const btnPerfil       = document.getElementById('btn-profile');
const btnPerfilApp    = document.getElementById('btn-profile-app');
const btnPadre        = document.getElementById('btn-parent-mode');
const btnEmergencia   = document.getElementById('btn-emergency');
const counterEl       = document.getElementById('new-audio-counter');
const modalPerfil     = document.getElementById('modal-perfil');
const inpPerfilNombre = document.getElementById('inp-perfil-nombre');
const avatarOpciones  = document.getElementById('avatar-options');
const modalParentPin  = document.getElementById('modal-parent-pin');
const parentPinTitle  = document.getElementById('parent-pin-title');
const parentPinHelp   = document.getElementById('parent-pin-help');
const parentPinInput  = document.getElementById('inp-parent-pin');
const parentPinError  = document.getElementById('parent-pin-error');
const modalParent     = document.getElementById('modal-parent-panel');
const parentLocations = document.getElementById('parent-locations');
const parentMembers   = document.getElementById('parent-members');
const parentQrImg     = document.getElementById('parent-qr-img');
const parentQrCode    = document.getElementById('parent-qr-code');
const inpWorldName    = document.getElementById('inp-parent-world-name');
const scanVideo       = document.getElementById('qr-scan-video');
const scanBox         = document.getElementById('qr-scan-box');
const scanStatus      = document.getElementById('qr-scan-status');

// ── HELPERS ───────────────────────────────────────────────────────────────
function setStatus(txt, cls = '') { statusEl.textContent = txt; statusEl.className = cls; }

function generarCodigo() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const nums   = '0123456789';
    const l = Array.from({length:4}, () => letras[Math.floor(Math.random()*letras.length)]).join('');
    const n = Array.from({length:4}, () => nums[Math.floor(Math.random()*nums.length)]).join('');
    return `${l}-${n}`;
}

function nombre(user) { return user?.email ? user.email.split('@')[0].toUpperCase() : 'USUARIO'; }

function escapeHTML(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function perfilKey() { return currentUser ? `radio-profile-${currentUser.uid}` : 'radio-profile'; }
function parentPinKey() { return currentUser ? `radio-parent-pin-${currentUser.uid}` : 'radio-parent-pin'; }
function lastSeenKey(mundoId) { return `radio-lastseen-${currentUser?.uid || 'anon'}-${mundoId}`; }

function perfilUsuario() {
    const base = { displayName: nombre(currentUser), avatar: '👤' };
    try {
        const raw = localStorage.getItem(perfilKey());
        if (!raw) return base;
        const data = JSON.parse(raw);
        return {
            displayName: String(data.displayName || base.displayName).trim() || base.displayName,
            avatar: String(data.avatar || base.avatar).trim() || base.avatar
        };
    } catch (_) { return base; }
}

function guardarPerfilLocal(displayName, avatar) {
    const limpio = String(displayName || '').trim().slice(0, 28) || nombre(currentUser);
    const av = String(avatar || '👤').trim().slice(0, 4) || '👤';
    localStorage.setItem(perfilKey(), JSON.stringify({ displayName: limpio, avatar: av }));
    actualizarLabelsUsuario();
}

function displayNameDe(data = {}) {
    return data.displayName || data.nombre || (data.email ? data.email.split('@')[0].toUpperCase() : '???');
}

function avatarDe(data = {}) {
    return data.avatar || (data.tipo === 'emergencia' ? '🚨' : '👤');
}

function actualizarLabelsUsuario() {
    if (!currentUser) return;
    const perfil = perfilUsuario();
    const label = `${perfil.avatar} ${perfil.displayName}`;
    if (mundosUserLbl) mundosUserLbl.textContent = label;
    if (userLabel) userLabel.textContent = label;
    if (btnPerfil) btnPerfil.textContent = `${perfil.avatar} PERFIL`;
    if (btnPerfilApp) btnPerfilApp.textContent = perfil.avatar;
}

function formatoFechaHora(ts) {
    const fechaObj = new Date(ts || Date.now());
    const fecha = fechaObj.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const hora = fechaObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${fecha} • ${hora}`;
}

function tiempoRelativo(ts) {
    if (!ts) return 'sin registro';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60)   return `hace ${s}s`;
    if (s < 3600) return `hace ${Math.floor(s/60)}min`;
    if (s < 86400) return `hace ${Math.floor(s/3600)}h`;
    return `hace ${Math.floor(s/86400)}d`;
}

function esOwnerActivo() { return !!(currentUser && mundoActivo && mundoActivo.ownerUid === currentUser.uid); }

function activarAudioContexto() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => null);
    } catch (_) {}
}

document.addEventListener('click', activarAudioContexto, { once: true });
document.addEventListener('touchstart', activarAudioContexto, { once: true, passive: true });

function sonarAviso(tipo = 'audio') {
    try {
        if (navigator.vibrate) navigator.vibrate(tipo === 'emergencia' ? [250, 80, 250, 80, 250] : [120, 60, 120]);
        if (!audioContext) return;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.type = 'sine';
        osc.frequency.value = tipo === 'emergencia' ? 880 : 660;
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.20);
        osc.start();
        osc.stop(audioContext.currentTime + 0.22);
    } catch (_) {}
}

function mostrarContadorNuevos(cantidad, texto = null) {
    if (!counterEl) return;
    nuevosPendientes = cantidad;
    if (!cantidad || cantidad < 1) {
        counterEl.classList.remove('visible');
        counterEl.textContent = '';
        return;
    }
    counterEl.textContent = texto || `${cantidad} audio${cantidad === 1 ? '' : 's'} nuevo${cantidad === 1 ? '' : 's'}`;
    counterEl.classList.add('visible');
}

counterEl?.addEventListener('click', () => {
    mostrarContadorNuevos(0);
    chat.scrollTop = chat.scrollHeight;
});

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
    actualizarLabelsUsuario();
    renderMundos();
}

async function mostrarApp(mundo) {
    mundoActivo = mundo;
    mundoActivoRefData = mundo;
    screenMundos.classList.remove('visible');
    screenApp.classList.add('visible');
    actualizarLabelsUsuario();
    mundoActivoLbl.textContent = `🌍 ${mundo.nombre}  •  ${mundo.codigo}`;
    chat.innerHTML = '';
    primeraCarga = true;
    mostrarContadorNuevos(0);
    actualizarVisibilidadPadre();

    await cargarMundoActivoCompleto();
    iniciarMicrofono();
    iniciarGPS(mundo.id); // GPS oculto pero activo automáticamente.
    iniciarPresencia(mundo.id);
    escucharUbicaciones(mundo.id); // Solo alimenta panel padre/miembros, no muestra GPS a niños.
    escucharMensajes(mundo.id);
    limpiarAudiosViejos(mundo.id);
    switchTab('radio');
}

async function cargarMundoActivoCompleto() {
    if (!mundoActivo) return;
    try {
        const snap = await getDoc(doc(db, 'mundos', mundoActivo.id));
        if (snap.exists()) {
            mundoActivo = { id: snap.id, ...snap.data(), esPropio: snap.data().ownerUid === currentUser.uid };
            mundoActivoRefData = mundoActivo;
            mundoActivoLbl.textContent = `🌍 ${mundoActivo.nombre}  •  ${mundoActivo.codigo}`;
            actualizarVisibilidadPadre();
        }
    } catch (err) { console.warn('cargar mundo:', err); }
}

function actualizarVisibilidadPadre() {
    if (!btnPadre) return;
    btnPadre.style.display = esOwnerActivo() ? 'inline-flex' : 'none';
}

// ── TABS ──────────────────────────────────────────────────────────────────
window.switchTab = function(tab) {
    // La ubicación se mantiene oculta para usuarios finales.
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
    await salirDeApp();
    await signOut(auth);
});

document.getElementById('btn-volver').addEventListener('click', async () => {
    await salirDeApp();
    mostrarMundos();
});

async function salirDeApp() {
    await marcarDesconectado();
    detenerGPS();
    detenerMicrofono();
    detenerScannerQR();
    if (presenceIntervalId !== null) { clearInterval(presenceIntervalId); presenceIntervalId = null; }
    if (unsubMensajes)    { unsubMensajes();    unsubMensajes = null; }
    if (unsubUbicaciones) { unsubUbicaciones(); unsubUbicaciones = null; }
    mundoActivo  = null;
    mundoActivoRefData = null;
    primeraCarga = true;
}

window.addEventListener('beforeunload', () => { marcarDesconectado(); });

// ── AUTH STATE ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        if (!localStorage.getItem(perfilKey())) guardarPerfilLocal(nombre(user), '👤');
        await asegurarMundoPropio(user);
        mostrarMundos();
    } else {
        currentUser = null;
        await salirDeApp();
        mostrarLogin();
    }
});

// ── PERFIL ────────────────────────────────────────────────────────────────
function abrirPerfil() {
    if (!currentUser) return;
    const perfil = perfilUsuario();
    avatarSeleccionado = perfil.avatar;
    inpPerfilNombre.value = perfil.displayName;
    renderAvatarOpciones();
    modalPerfil.classList.add('visible');
    setTimeout(() => inpPerfilNombre.focus(), 100);
}

function cerrarPerfil() { modalPerfil.classList.remove('visible'); }

function renderAvatarOpciones() {
    const avatares = ['👨‍👧', '👩‍👧', '👨‍👩‍👧', '👦', '👧', '👨', '👩', '👴', '👵', '🐶', '🐱', '⭐', '🚲', '⚽', '🎒', '👤'];
    avatarOpciones.innerHTML = '';
    avatares.forEach(av => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `avatar-option${avatarSeleccionado === av ? ' selected' : ''}`;
        btn.textContent = av;
        btn.addEventListener('click', () => {
            avatarSeleccionado = av;
            renderAvatarOpciones();
        });
        avatarOpciones.appendChild(btn);
    });
}

btnPerfil?.addEventListener('click', abrirPerfil);
btnPerfilApp?.addEventListener('click', abrirPerfil);
document.getElementById('btn-cancelar-perfil')?.addEventListener('click', cerrarPerfil);
document.getElementById('btn-guardar-perfil')?.addEventListener('click', async () => {
    guardarPerfilLocal(inpPerfilNombre.value, avatarSeleccionado);
    if (mundoActivo) await actualizarPresencia(true);
    cerrarPerfil();
    setStatus('PERFIL ACTUALIZADO');
    setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 1600);
});

// ── MUNDOS — FIRESTORE ────────────────────────────────────────────────────
// Estructura en Firestore:
//   mundos/{mundoId} → { nombre, codigo, ownerUid, miembros:[uid,...], creadoAt }
//   mundos/{mundoId}/mensajes/{msgId}
//   mundos/{mundoId}/ubicaciones/{uid}

async function asegurarMundoPropio(user) {
    const q = query(collection(db, 'mundos'), where('ownerUid', '==', user.uid));
    const snap = await getDocs(q);
    if (snap.empty) {
        let codigo, existe = true;
        while (existe) {
            codigo = generarCodigo();
            const c = await getDocs(query(collection(db, 'mundos'), where('codigo', '==', codigo)));
            existe = !c.empty;
        }
        await addDoc(collection(db, 'mundos'), {
            nombre:   perfilUsuario().displayName || nombre(user),
            codigo:   codigo,
            ownerUid: user.uid,
            miembros: [user.uid],
            creadoAt: Date.now()
        });
    }
}

async function renderMundos() {
    mundosBody.innerHTML = '<div style="text-align:center;color:var(--muted);font-family:\'Share Tech Mono\',monospace;font-size:11px;padding:20px;">Cargando...</div>';

    const q = query(collection(db, 'mundos'), where('miembros', 'array-contains', currentUser.uid));
    const snap = await getDocs(q);

    const propios = [];
    const ajenos = [];
    snap.forEach(d => {
        const data = { id: d.id, ...d.data() };
        data.ownerUid === currentUser.uid ? propios.push(data) : ajenos.push(data);
    });

    mundosBody.innerHTML = '';
    mundosBody.insertAdjacentHTML('beforeend', '<div class="seccion-titulo">MI MUNDO</div>');
    propios.forEach(m => mundosBody.appendChild(crearTarjetaMundo(m, true)));

    mundosBody.insertAdjacentHTML('beforeend', '<div class="seccion-titulo" style="margin-top:8px;">OTROS MUNDOS</div>');
    if (ajenos.length === 0) {
        mundosBody.insertAdjacentHTML('beforeend', '<div style="font-family:\'Share Tech Mono\',monospace;font-size:11px;color:var(--muted);padding:8px 0;">Aún no te has unido a ningún mundo.</div>');
    } else {
        ajenos.forEach(m => mundosBody.appendChild(crearTarjetaMundo(m, false)));
    }

    const totalAjenos = ajenos.length;
    if (totalAjenos < 4) {
        const btn = document.createElement('button');
        btn.className = 'btn-accion';
        btn.textContent = '+ UNIRSE A UN MUNDO / ESCANEAR QR';
        btn.addEventListener('click', abrirModalUnirse);
        mundosBody.appendChild(btn);
    } else {
        mundosBody.insertAdjacentHTML('beforeend', '<div class="mundos-limite">Límite de 4 mundos ajenos alcanzado</div>');
    }
}

function crearTarjetaMundo(m, esPropio) {
    const card = document.createElement('div');
    card.className = `mundo-card ${esPropio ? 'propio' : 'ajeno'}`;
    const miembros = m.miembros?.length || 1;
    card.innerHTML = `
        <div class="mundo-card-top">
            <div class="mundo-nombre">${esPropio ? '🏠 ' : '🌐 '}${escapeHTML(m.nombre)}</div>
            <div class="mundo-codigo ${esPropio ? '' : 'ajeno'}">${escapeHTML(m.codigo)}</div>
        </div>
        <div class="mundo-footer">
            <div class="mundo-miembros">${miembros} miembro${miembros !== 1 ? 's' : ''}</div>
            <div class="mundo-enter">ENTRAR →</div>
        </div>`;
    card.addEventListener('click', () => mostrarApp({
        id: m.id,
        nombre: m.nombre,
        codigo: m.codigo,
        ownerUid: m.ownerUid,
        miembros: m.miembros || [],
        esPropio
    }));
    return card;
}

// ── MODAL UNIRSE / QR ─────────────────────────────────────────────────────
function abrirModalUnirse() {
    inpCodigo.value = '';
    modalError.textContent = '';
    detenerScannerQR();
    modalUnirse.classList.add('visible');
    setTimeout(() => inpCodigo.focus(), 100);
}

function cerrarModalUnirse() {
    detenerScannerQR();
    modalUnirse.classList.remove('visible');
}

document.getElementById('btn-cancelar-modal').addEventListener('click', cerrarModalUnirse);

inpCodigo.addEventListener('input', e => {
    e.target.value = formatearCodigo(e.target.value);
});

function formatearCodigo(valor) {
    let v = String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length > 4) v = v.slice(0,4) + '-' + v.slice(4,8);
    return v.slice(0, 9);
}

function extraerCodigoQR(raw) {
    const txt = String(raw || '').toUpperCase();
    const m = txt.match(/[A-Z]{4}[- ]?[0-9]{4}/);
    return m ? formatearCodigo(m[0]) : '';
}

document.getElementById('btn-confirmar-unirse').addEventListener('click', async () => {
    await unirseConCodigo(inpCodigo.value.trim().toUpperCase());
});

async function unirseConCodigo(codigo) {
    modalError.textContent = '';
    if (!/^[A-Z]{4}-[0-9]{4}$/.test(codigo)) {
        modalError.textContent = 'Formato inválido. Ej: ABCD-1234';
        return;
    }

    const q = query(collection(db, 'mundos'), where('codigo', '==', codigo));
    const snap = await getDocs(q);
    if (snap.empty) { modalError.textContent = 'Código no encontrado.'; return; }

    const mundoDoc  = snap.docs[0];
    const mundoData = mundoDoc.data();
    if (mundoData.ownerUid === currentUser.uid) { modalError.textContent = 'Ese es tu propio mundo.'; return; }
    if (mundoData.miembros?.includes(currentUser.uid)) { modalError.textContent = 'Ya eres miembro de ese mundo.'; return; }

    await updateDoc(doc(db, 'mundos', mundoDoc.id), { miembros: arrayUnion(currentUser.uid) });
    cerrarModalUnirse();
    renderMundos();
}

document.getElementById('btn-scan-qr')?.addEventListener('click', iniciarScannerQR);

async function iniciarScannerQR() {
    modalError.textContent = '';
    if (!('BarcodeDetector' in window)) {
        modalError.textContent = 'Este navegador no soporta escáner QR. Escribe el código manualmente.';
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        modalError.textContent = 'La cámara no está disponible en este navegador.';
        return;
    }
    try {
        detenerScannerQR();
        scanBox.classList.add('visible');
        scanStatus.textContent = 'Apunta la cámara al QR familiar...';
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        qrScanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        scanVideo.srcObject = qrScanStream;
        await scanVideo.play();
        qrScanTimer = setInterval(async () => {
            try {
                const codes = await detector.detect(scanVideo);
                if (!codes.length) return;
                const codigo = extraerCodigoQR(codes[0].rawValue);
                if (!codigo) {
                    scanStatus.textContent = 'QR leído, pero no contiene un código válido.';
                    return;
                }
                inpCodigo.value = codigo;
                scanStatus.textContent = `Código detectado: ${codigo}`;
                detenerScannerQR(false);
            } catch (_) {}
        }, 650);
    } catch (err) {
        console.error('QR:', err);
        modalError.textContent = 'No se pudo abrir la cámara para escanear QR.';
        detenerScannerQR();
    }
}

function detenerScannerQR(ocultar = true) {
    if (qrScanTimer) { clearInterval(qrScanTimer); qrScanTimer = null; }
    if (qrScanStream) {
        qrScanStream.getTracks().forEach(t => t.stop());
        qrScanStream = null;
    }
    if (scanVideo) scanVideo.srcObject = null;
    if (ocultar && scanBox) scanBox.classList.remove('visible');
}

// ── MICRÓFONO ─────────────────────────────────────────────────────────────
function obtenerMimeAudio() {
    if (!window.MediaRecorder?.isTypeSupported) return '';
    const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];
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
            mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
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
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    mediaRecorder = null;
}

async function subirAudio() {
    if (descartarAudio) { audioChunks = []; descartarAudio = false; return; }
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
        if (blob.size === 0) {
            setStatus('NO SE GRABÓ AUDIO');
            setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 1500);
            return;
        }

        const perfil = perfilUsuario();
        const ext = extensionAudio(tipo);
        const ruta = `audios/${mundoActivo.id}/${Date.now()}_${currentUser.uid}.${ext}`;
        const sRef = ref(storage, ruta);
        await uploadBytes(sRef, blob, { contentType: tipo });
        const url = await getDownloadURL(sRef);
        await addDoc(collection(db, 'mundos', mundoActivo.id, 'mensajes'), {
            tipo:        'audio',
            audioUrl:    url,
            storagePath: ruta,
            uid:         currentUser.uid,
            email:       currentUser.email,
            displayName: perfil.displayName,
            avatar:      perfil.avatar,
            timestamp:   Date.now(),
            expiresAt:   Date.now() + 5 * 24 * 60 * 60 * 1000,
            reproducidoPor: []
        });
        setStatus('AUDIO ENVIADO ✓');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 1400);
    } catch (err) {
        console.error(err);
        setStatus('ERROR AL ENVIAR', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
    }
}

// ── PTT ───────────────────────────────────────────────────────────────────
function iniciarTx(e) {
    e.preventDefault();
    activarAudioContexto();
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
document.addEventListener('visibilitychange', () => { if (document.hidden) detenerTx(); });

// ── MENSAJES ──────────────────────────────────────────────────────────────
function escucharMensajes(mundoId) {
    if (unsubMensajes) { unsubMensajes(); unsubMensajes = null; }
    const q = query(collection(db, 'mundos', mundoId, 'mensajes'), orderBy('timestamp', 'asc'));
    const lastSeen = Number(localStorage.getItem(lastSeenKey(mundoId)) || 0);
    let nuevosIniciales = 0;

    unsubMensajes = onSnapshot(q, snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'removed') {
                const eliminado = chat.querySelector(`[data-msg-id="${change.doc.id}"]`);
                if (eliminado) eliminado.remove();
                return;
            }

            const data = { id: change.doc.id, ...change.doc.data() };
            const esPropio = data.uid === currentUser?.uid;

            if (change.type === 'modified') {
                actualizarEstadoMensaje(data);
                return;
            }

            if (change.type !== 'added') return;

            const div = agregarMensaje(data, esPropio);

            if (primeraCarga) {
                if (!esPropio && lastSeen && data.timestamp > lastSeen && (data.tipo || 'audio') === 'audio') nuevosIniciales++;
                return;
            }

            if (!esPropio) {
                sonarAviso(data.tipo === 'emergencia' ? 'emergencia' : 'audio');
                if (data.tipo === 'emergencia') {
                    mostrarContadorNuevos(1, `🚨 Emergencia de ${displayNameDe(data)}`);
                } else {
                    if (document.hidden) mostrarContadorNuevos(++nuevosPendientes);
                    reproducir(data, div);
                }
            }
        });

        if (primeraCarga) {
            if (nuevosIniciales > 0) mostrarContadorNuevos(nuevosIniciales);
            localStorage.setItem(lastSeenKey(mundoId), String(Date.now()));
        }
        primeraCarga = false;
    });
}

function textoEstadoAudio(data, esPropio) {
    const reproducido = Array.isArray(data.reproducidoPor) ? data.reproducidoPor : [];
    if (data.tipo === 'emergencia') return esPropio ? 'ALERTA ENVIADA' : 'ALERTA RECIBIDA';
    if (esPropio) {
        const otros = reproducido.filter(uid => uid && uid !== data.uid);
        return otros.length ? `ESCUCHADO ✓✓ (${otros.length})` : 'ENVIADO ✓';
    }
    return reproducido.includes(currentUser?.uid) ? 'REPRODUCIDO' : 'NUEVO';
}

function agregarMensaje(data, esPropio) {
    const tipo = data.tipo || 'audio';
    const puedeEliminar = data.id && (esPropio || mundoActivo?.ownerUid === currentUser?.uid);
    const div = document.createElement('div');
    div.className = `msg${esPropio ? ' own' : ''}${tipo === 'emergencia' ? ' emergency' : ''}`;
    div.dataset.msgId = data.id || '';

    if (tipo === 'emergencia') {
        const mapsUrl = data.lat && data.lng ? `https://www.google.com/maps?q=${data.lat},${data.lng}` : '';
        div.innerHTML = `
            <div class="msg-icon">🚨</div>
            <div class="msg-body">
                <div class="msg-sender">${escapeHTML(avatarDe(data))} ${escapeHTML(displayNameDe(data))}</div>
                <div class="msg-label">ALERTA DE EMERGENCIA FAMILIAR</div>
                <div class="msg-time">${escapeHTML(formatoFechaHora(data.timestamp))}</div>
                ${mapsUrl ? `<a class="gps-link emergency-link" href="${mapsUrl}" target="_blank" rel="noopener">🗺️ VER UBICACIÓN</a>` : '<div class="msg-status">Sin ubicación disponible</div>'}
                <div class="msg-status" data-msg-status>${escapeHTML(textoEstadoAudio(data, esPropio))}</div>
                ${puedeEliminar ? '<button class="msg-delete" type="button" data-delete-msg>ELIMINAR</button>' : ''}
            </div>`;
    } else {
        div.innerHTML = `
            <div class="msg-icon">${esPropio ? '🎙️' : '🔊'}</div>
            <div class="msg-body">
                <div class="msg-sender">${escapeHTML(avatarDe(data))} ${escapeHTML(displayNameDe(data))}</div>
                <div class="msg-label">${esPropio ? 'Enviaste un audio' : 'Audio recibido'}</div>
                <div class="msg-time">${escapeHTML(formatoFechaHora(data.timestamp))}</div>
                <div class="msg-status" data-msg-status>${escapeHTML(textoEstadoAudio(data, esPropio))}</div>
                ${puedeEliminar ? '<button class="msg-delete" type="button" data-delete-msg>ELIMINAR</button>' : ''}
            </div>`;
        div.title = 'Toca para reproducir';
        div.addEventListener('click', () => reproducir(data, div));
    }

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

function actualizarEstadoMensaje(data) {
    const div = chat.querySelector(`[data-msg-id="${data.id}"]`);
    if (!div) return;
    const esPropio = data.uid === currentUser?.uid;
    const st = div.querySelector('[data-msg-status]');
    if (st) st.textContent = textoEstadoAudio(data, esPropio);
}

async function confirmarEliminarMensaje(data, divMsg) {
    if (!currentUser || !mundoActivo || !data?.id) return;
    const nom = displayNameDe(data);
    const primeraConfirmacion = confirm(`¿Eliminar definitivamente el mensaje de ${nom}?`);
    if (!primeraConfirmacion) return;
    const segundaConfirmacion = confirm('Confirmación final: esta acción borrará el mensaje de Firestore y no se podrá recuperar. ¿Deseas continuar?');
    if (!segundaConfirmacion) return;

    try {
        setStatus('ELIMINANDO...', 'sending');
        if (audioActivo) { audioActivo.pause(); audioActivo = null; }
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

async function marcarReproducido(data) {
    if (!currentUser || !mundoActivo || !data?.id || data.uid === currentUser.uid || data.tipo === 'emergencia') return;
    try {
        await updateDoc(doc(db, 'mundos', mundoActivo.id, 'mensajes', data.id), {
            reproducidoPor: arrayUnion(currentUser.uid)
        });
    } catch (err) { console.warn('marcar reproducido:', err); }
}

async function reproducir(dataOrUrl, divMsg) {
    const data = typeof dataOrUrl === 'string' ? { audioUrl: dataOrUrl } : dataOrUrl;
    const url = data.audioUrl;
    if (!url) {
        setStatus('AUDIO SIN URL', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
        return;
    }

    if (audioActivo) { audioActivo.pause(); audioActivo = null; }

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
        audio.onended = async () => {
            audioActivo = null;
            if (icon) icon.textContent = iconoNormal;
            await marcarReproducido(data);
        };
        audio.onerror = () => marcarError(audio.error || new Error('No se pudo cargar el audio'));
    };

    try {
        const audio = new Audio(url);
        prepararAudio(audio);
        await audio.play();
    } catch (errDirecto) {
        try {
            const resp = await fetch(url, { mode: 'cors' });
            if (!resp.ok) throw new Error('fetch ' + resp.status);
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);
            prepararAudio(audio);
            audio.onended = async () => {
                audioActivo = null;
                URL.revokeObjectURL(blobUrl);
                if (icon) icon.textContent = iconoNormal;
                await marcarReproducido(data);
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

// ── GPS / PRESENCIA ───────────────────────────────────────────────────────
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

function iniciarPresencia(mundoId) {
    actualizarPresencia(true, mundoId);
    if (presenceIntervalId !== null) clearInterval(presenceIntervalId);
    presenceIntervalId = setInterval(() => actualizarPresencia(true, mundoId), 60 * 1000);
}

async function actualizarPresencia(online = true, mundoId = mundoActivo?.id) {
    if (!currentUser || !mundoId) return;
    const perfil = perfilUsuario();
    try {
        await setDoc(doc(db, 'mundos', mundoId, 'ubicaciones', currentUser.uid), {
            uid:       currentUser.uid,
            email:     currentUser.email,
            nombre:    perfil.displayName,
            displayName: perfil.displayName,
            avatar:    perfil.avatar,
            online,
            lastSeen:  Date.now(),
            updatedAt: Date.now()
        }, { merge: true });
    } catch (err) { console.warn('Presencia:', err); }
}

async function marcarDesconectado() {
    if (!currentUser || !mundoActivo) return;
    try {
        await setDoc(doc(db, 'mundos', mundoActivo.id, 'ubicaciones', currentUser.uid), {
            online: false,
            lastSeen: Date.now(),
            updatedAt: Date.now()
        }, { merge: true });
    } catch (_) {}
}

async function enviarUbicacion(pos, mundoId) {
    if (!currentUser) return;
    const perfil = perfilUsuario();
    ultimaPosicion = pos;
    try {
        await setDoc(doc(db, 'mundos', mundoId, 'ubicaciones', currentUser.uid), {
            uid:       currentUser.uid,
            email:     currentUser.email,
            nombre:    perfil.displayName,
            displayName: perfil.displayName,
            avatar:    perfil.avatar,
            lat:       pos.coords.latitude,
            lng:       pos.coords.longitude,
            accuracy:  Math.round(pos.coords.accuracy),
            online:    true,
            lastSeen:  Date.now(),
            updatedAt: Date.now()
        }, { merge: true });
    } catch (err) { console.warn('GPS:', err); }
}

function escucharUbicaciones(mundoId) {
    if (unsubUbicaciones) { unsubUbicaciones(); unsubUbicaciones = null; }
    unsubUbicaciones = onSnapshot(collection(db, 'mundos', mundoId, 'ubicaciones'), snapshot => {
        const docs = [];
        snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
        renderPanelPadre(docs);
    });
}

function renderPanelPadre(ubicaciones = []) {
    if (!parentLocations || !parentMembers || !mundoActivo) return;

    parentLocations.innerHTML = '';
    if (!ubicaciones.length) {
        parentLocations.innerHTML = '<div class="gps-empty">Sin ubicaciones aún.</div>';
    } else {
        ubicaciones
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .forEach(data => {
                const online = data.online === true && (Date.now() - (data.updatedAt || 0)) < 5 * 60 * 1000;
                const tieneGPS = typeof data.lat === 'number' && typeof data.lng === 'number';
                const mapsUrl = tieneGPS ? `https://www.google.com/maps?q=${data.lat},${data.lng}` : '';
                const card = document.createElement('div');
                card.className = 'gps-card';
                card.innerHTML = `
                    <div class="gps-card-name">
                        <span>${escapeHTML(avatarDe(data))} ${escapeHTML(displayNameDe(data))}</span>
                        <span class="gps-badge ${online ? 'online' : 'offline'}">${online ? 'EN LÍNEA' : 'FUERA'}</span>
                    </div>
                    ${tieneGPS ? `
                        <div class="gps-row">LAT: <span>${Number(data.lat).toFixed(6)}</span></div>
                        <div class="gps-row">LNG: <span>${Number(data.lng).toFixed(6)}</span></div>
                        <div class="gps-row">PRECISIÓN: <span>±${Number(data.accuracy || 0)} m</span></div>
                        <a class="gps-link" href="${mapsUrl}" target="_blank" rel="noopener">🗺️ VER EN MAPA</a>` : '<div class="gps-row">UBICACIÓN: <span>sin datos todavía</span></div>'}
                    <div class="gps-row">ÚLTIMA CONEXIÓN: <span>${escapeHTML(tiempoRelativo(data.lastSeen || data.updatedAt))}</span></div>`;
                parentLocations.appendChild(card);
            });
    }

    const porUid = new Map(ubicaciones.map(u => [u.uid || u.id, u]));
    const miembros = mundoActivo.miembros || [];
    parentMembers.innerHTML = '';
    if (!miembros.length) {
        parentMembers.innerHTML = '<div class="gps-empty">Sin miembros registrados.</div>';
    } else {
        miembros.forEach(uid => {
            const data = porUid.get(uid) || { uid, displayName: uid === currentUser?.uid ? perfilUsuario().displayName : 'Miembro sin conexión', avatar: '👤' };
            const online = data.online === true && (Date.now() - (data.updatedAt || 0)) < 5 * 60 * 1000;
            const row = document.createElement('div');
            row.className = 'member-row';
            row.innerHTML = `
                <div class="member-main">
                    <div class="member-avatar">${escapeHTML(avatarDe(data))}</div>
                    <div>
                        <div class="member-name">${escapeHTML(displayNameDe(data))}</div>
                        <div class="member-sub">${uid === mundoActivo.ownerUid ? 'Dueño del mundo' : 'Miembro'} • ${escapeHTML(tiempoRelativo(data.lastSeen || data.updatedAt))}</div>
                    </div>
                </div>
                <span class="gps-badge ${online ? 'online' : 'offline'}">${online ? 'EN LÍNEA' : 'FUERA'}</span>`;
            parentMembers.appendChild(row);
        });
    }
}

// ── MODO PADRE ────────────────────────────────────────────────────────────
btnPadre?.addEventListener('click', abrirModoPadreConPin);

document.getElementById('btn-cancelar-parent-pin')?.addEventListener('click', () => modalParentPin.classList.remove('visible'));
document.getElementById('btn-confirmar-parent-pin')?.addEventListener('click', confirmarPinPadre);
parentPinInput?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmarPinPadre(); });
document.getElementById('btn-cerrar-parent-panel')?.addEventListener('click', () => modalParent.classList.remove('visible'));
document.getElementById('btn-guardar-world-name')?.addEventListener('click', renombrarMundoActivo);

function abrirModoPadreConPin() {
    if (!esOwnerActivo()) return;
    const yaTienePin = !!localStorage.getItem(parentPinKey());
    parentPinMode = yaTienePin ? 'verify' : 'create';
    parentPinTitle.textContent = yaTienePin ? 'MODO PADRE' : 'CREAR PIN DE PADRE';
    parentPinHelp.textContent = yaTienePin ? 'Escribe tu PIN para ver ubicación, miembros y ajustes.' : 'Crea un PIN de 4 a 8 números para proteger este panel en este dispositivo.';
    parentPinError.textContent = '';
    parentPinInput.value = '';
    modalParentPin.classList.add('visible');
    setTimeout(() => parentPinInput.focus(), 100);
}

function confirmarPinPadre() {
    const pin = parentPinInput.value.trim();
    parentPinError.textContent = '';
    if (!/^\d{4,8}$/.test(pin)) {
        parentPinError.textContent = 'El PIN debe tener entre 4 y 8 números.';
        return;
    }
    const key = parentPinKey();
    const guardado = localStorage.getItem(key);
    if (parentPinMode === 'create') {
        localStorage.setItem(key, pin);
        modalParentPin.classList.remove('visible');
        abrirPanelPadre();
        return;
    }
    if (pin !== guardado) {
        parentPinError.textContent = 'PIN incorrecto.';
        return;
    }
    modalParentPin.classList.remove('visible');
    abrirPanelPadre();
}

async function abrirPanelPadre() {
    if (!mundoActivo) return;
    await cargarMundoActivoCompleto();
    inpWorldName.value = mundoActivo.nombre || '';
    parentQrCode.textContent = mundoActivo.codigo;
    parentQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(mundoActivo.codigo)}`;
    modalParent.classList.add('visible');
}

async function renombrarMundoActivo() {
    if (!esOwnerActivo()) return;
    const nuevo = inpWorldName.value.trim().slice(0, 40);
    if (!nuevo) return;
    try {
        await updateDoc(doc(db, 'mundos', mundoActivo.id), { nombre: nuevo });
        mundoActivo.nombre = nuevo;
        mundoActivoLbl.textContent = `🌍 ${mundoActivo.nombre}  •  ${mundoActivo.codigo}`;
        setStatus('MUNDO RENOMBRADO');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 1600);
    } catch (err) {
        console.error('renombrar:', err);
        setStatus('NO SE PUDO RENOMBRAR', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
    }
}

// ── EMERGENCIA ────────────────────────────────────────────────────────────
btnEmergencia?.addEventListener('click', enviarEmergencia);

async function enviarEmergencia() {
    if (!currentUser || !mundoActivo) return;
    const ok = confirm('¿Enviar alerta de emergencia familiar con tu ubicación actual?');
    if (!ok) return;
    setStatus('ENVIANDO EMERGENCIA...', 'recording');

    const enviar = async pos => {
        const perfil = perfilUsuario();
        const payload = {
            tipo:        'emergencia',
            uid:         currentUser.uid,
            email:       currentUser.email,
            displayName: perfil.displayName,
            avatar:      perfil.avatar,
            timestamp:   Date.now(),
            expiresAt:   Date.now() + 5 * 24 * 60 * 60 * 1000,
            reproducidoPor: []
        };
        if (pos?.coords) {
            payload.lat = pos.coords.latitude;
            payload.lng = pos.coords.longitude;
            payload.accuracy = Math.round(pos.coords.accuracy || 0);
        }
        await addDoc(collection(db, 'mundos', mundoActivo.id, 'mensajes'), payload);
        if (pos?.coords) await enviarUbicacion(pos, mundoActivo.id);
        sonarAviso('emergencia');
        setStatus('EMERGENCIA ENVIADA 🚨');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2200);
    };

    try {
        let pos = ultimaPosicion;
        if (navigator.geolocation) {
            try {
                pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        maximumAge: 5000,
                        timeout: 12000
                    });
                });
            } catch (_) {
                // Si el GPS inmediato falla, usamos la última posición conocida.
            }
        }
        if (!pos) throw new Error('Sin ubicación disponible');
        await enviar(pos);
    } catch (err) {
        console.error('emergencia:', err);
        setStatus('NO SE PUDO ENVIAR EMERGENCIA', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
    }
}

// ── LIMPIEZA AUDIOS > 5 DÍAS ──────────────────────────────────────────────
async function limpiarAudiosViejos(mundoId) {
    try {
        const limite = Date.now();
        const q = query(collection(db, 'mundos', mundoId, 'mensajes'), where('expiresAt', '<', limite));
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
