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

// ── CONFIG GENERAL ────────────────────────────────────────────────────────
// Ya no hay mundos fijos en el lobby. Las conversaciones visibles se crean como
// chats directos o grupos personalizados.
const MUNDOS_BASE = [];

// ── ESTADO ────────────────────────────────────────────────────────────────
let currentUser        = null;
let mundoActivo        = null;
let mundoPendienteClave= null;
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
let unsubMiembros      = null;
let unsubMundoActivo   = null;
let ultimaPosicion     = null;
let audioContext       = null;
let nuevosPendientes   = 0;
let qrScanStream       = null;
let qrScanTimer        = null;
let avatarSeleccionado = '👤';
let adultPinCallback   = null;
let miembrosSubcoleccionOK = true;
let unsubDirectorio   = null;
let unsubLobbyMundos  = null;
let directorioUsuarios = [];
let chatsLobby = [];

// ── DOM ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screenLogin     = $('screen-login');
const screenMundos    = $('screen-mundos');
const screenApp       = $('screen-app');
const formLogin       = $('form-login');
const inpEmail        = $('inp-email');
const inpPass         = $('inp-pass');
const loginError      = $('login-error');
const mundosBody      = $('mundos-body');
const userLabel       = $('user-label');
const mundoActivoLbl  = $('mundo-activo-label');
const chat            = $('chat');
const statusEl        = $('status');
const wave            = $('wave');
const btnPtt          = $('btn-ptt');
const pttLabel        = $('ptt-label');
const panelGps        = $('panel-gps');
const panelMiembros   = $('panel-miembros');
const counterEl       = $('new-audio-counter');

// Modales y controles
const btnPerfil       = $('btn-profile');
const btnPerfilApp    = $('btn-profile-app');
const modalPerfil     = $('modal-perfil');
const inpPerfilNombre = $('inp-perfil-nombre');
const avatarOpciones  = $('avatar-options');
const modalClave      = $('modal-clave-mundo');
const inpClaveMundo   = $('inp-clave-mundo');
const claveMundoHelp  = $('clave-mundo-help');
const claveMundoError = $('clave-mundo-error');
const modalUnirse     = $('modal-unirse');
const inpCodigo       = $('inp-codigo');
const modalError      = $('modal-error');
const scanVideo       = $('qr-scan-video');
const scanStatus      = $('qr-scan-status');
const modalQr         = $('modal-qr');
const qrImg           = $('qr-img');
const qrCodeLabel     = $('qr-code-label');
const modalAdultPin   = $('modal-adult-pin');
const adultPinTitle   = $('adult-pin-title');
const adultPinHelp    = $('adult-pin-help');
const adultPinInput   = $('inp-adult-pin');
const adultPinError   = $('adult-pin-error');
const modalWorldCfg   = $('modal-world-settings-panel');
const worldSettingsHelp = $('world-settings-help');
const inpWorldName    = $('inp-world-name');
const inpWorldPass    = $('inp-world-pass');
const worldSettingsError = $('world-settings-error');
const modalCrearGrupo = $('modal-crear-grupo');
const inpGroupName    = $('inp-group-name');
const groupUsersList  = $('group-users-list');
const groupError      = $('group-error');

// ── HELPERS ───────────────────────────────────────────────────────────────
function setStatus(txt, cls = '') {
    if (!statusEl) return;
    statusEl.textContent = txt;
    statusEl.className = `status ${cls}`.trim();
}

function escapeHTML(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function nombre(user) {
    return user?.email ? user.email.split('@')[0].toUpperCase() : 'USUARIO';
}

function perfilKey() { return currentUser ? `radio-profile-${currentUser.uid}` : 'radio-profile'; }
function adultPinKey() { return currentUser ? `radio-adult-pin-${currentUser.uid}` : 'radio-adult-pin'; }
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
    registrarUsuarioGlobal(true).catch(() => null);
    actualizarPerfilEnMundoActivo().catch(() => null);
}

function actualizarLabelsUsuario() {
    if (!currentUser) return;
    const perfil = perfilUsuario();
    if (userLabel) userLabel.textContent = `${perfil.avatar} ${perfil.displayName}`;
    if (btnPerfil) btnPerfil.textContent = `${perfil.avatar} PERFIL`;
    if (btnPerfilApp) btnPerfilApp.textContent = perfil.avatar;
}

function displayNameDe(data = {}) {
    return data.displayName || data.nombre || (data.email ? data.email.split('@')[0].toUpperCase() : '???');
}

function avatarDe(data = {}) {
    return data.avatar || (data.tipo === 'emergencia' ? '🚨' : '👤');
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
    if (s < 60) return `hace ${s}s`;
    if (s < 3600) return `hace ${Math.floor(s / 60)}min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
    return `hace ${Math.floor(s / 86400)}d`;
}

function normalizarCodigo(valor = '') {
    return String(valor).trim().toUpperCase().replace(/\s+/g, '-');
}

function uniqueArray(arr = []) {
    return Array.from(new Set(arr.filter(Boolean)));
}

function usuarioOnline(data = {}) {
    return !!data.isOnline && (Date.now() - Number(data.lastSeen || 0)) < 2 * 60 * 1000;
}

function perfilActualComoUsuario(online = true) {
    const perfil = perfilUsuario();
    const ahora = Date.now();
    return {
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: perfil.displayName,
        avatar: perfil.avatar,
        lastSeen: ahora,
        isOnline: online,
        updatedAt: ahora
    };
}

function normalizarUsuario(data = {}) {
    return {
        uid: data.uid || '',
        email: data.email || '',
        displayName: displayNameDe(data),
        avatar: avatarDe(data),
        lastSeen: Number(data.lastSeen || data.updatedAt || 0),
        isOnline: !!data.isOnline,
        updatedAt: Number(data.updatedAt || data.lastSeen || 0)
    };
}

function ordenarUsuarios(a, b) {
    const ao = usuarioOnline(a) ? 1 : 0;
    const bo = usuarioOnline(b) ? 1 : 0;
    if (ao !== bo) return bo - ao;
    return displayNameDe(a).localeCompare(displayNameDe(b), 'es');
}

function idChatDirecto(uidA, uidB) {
    return `directo_${[uidA, uidB].sort().join('_')}`.replace(/[^A-Za-z0-9_\-]/g, '_');
}

function codigoCorto(prefix = 'GRP') {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const nums = '0123456789';
    const l = Array.from({ length: 3 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
    const n = Array.from({ length: 3 }, () => nums[Math.floor(Math.random() * nums.length)]).join('');
    return `${prefix}-${l}${n}`;
}


async function sha256(text) {
    const bytes = new TextEncoder().encode(String(text));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
        if (navigator.vibrate) navigator.vibrate(tipo === 'emergencia' ? [250, 80, 250, 80, 250] : [100, 60, 100]);
        if (!audioContext) return;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.type = 'sine';
        osc.frequency.value = tipo === 'emergencia' ? 880 : 660;
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
        osc.start();
        osc.stop(audioContext.currentTime + 0.2);
    } catch (_) {}
}

function mostrarContadorNuevos(cantidad) {
    if (!counterEl) return;
    nuevosPendientes = cantidad;
    if (!cantidad || cantidad < 1) {
        counterEl.classList.remove('visible');
        counterEl.textContent = '';
        return;
    }
    counterEl.textContent = `${cantidad} mensaje${cantidad === 1 ? '' : 's'} nuevo${cantidad === 1 ? '' : 's'}`;
    counterEl.classList.add('visible');
}

counterEl?.addEventListener('click', () => {
    mostrarContadorNuevos(0);
    if (mundoActivo) localStorage.setItem(lastSeenKey(mundoActivo.id), String(Date.now()));
    chat.scrollTop = chat.scrollHeight;
});

// ── PANTALLAS ─────────────────────────────────────────────────────────────
function mostrarLogin() {
    screenLogin.style.display = 'flex';
    screenMundos.classList.remove('visible');
    screenApp.classList.remove('visible');
}

async function mostrarLobby() {
    screenLogin.style.display = 'none';
    screenMundos.classList.add('visible');
    screenApp.classList.remove('visible');
    actualizarLabelsUsuario();
    await registrarUsuarioGlobal(true).catch(() => null);
    await renderMundos();
    iniciarLobbyVivo();
}

async function mostrarApp(mundo) {
    detenerLobbyVivo();
    mundoActivo = mundo;
    screenMundos.classList.remove('visible');
    screenApp.classList.add('visible');
    actualizarLabelsUsuario();
    const iconoChat = mundo.tipo === 'directo' ? '💬' : (mundo.tipo === 'grupo' ? '👥' : '📡');
    mundoActivoLbl.textContent = `${iconoChat} ${mundo.nombre || 'Chat'}`;
    chat.innerHTML = '';
    primeraCarga = true;
    mostrarContadorNuevos(0);

    const btnWorldSettings = $('btn-world-settings');
    if (btnWorldSettings) btnWorldSettings.style.display = 'none';

    iniciarMicrofono();
    iniciarGPS(mundo.id);
    iniciarPresencia(mundo.id);
    escucharMundoActivo(mundo.id);
    escucharMensajes(mundo.id);
    escucharUbicaciones(mundo.id);
    escucharMiembros(mundo.id);
    limpiarAudiosViejos(mundo.id);
    calcularPendientes(mundo.id);
    switchTab('radio');
}

window.switchTab = function(tab) {
    $('tab-radio').classList.toggle('active', tab === 'radio');
    $('tab-gps').classList.toggle('active', tab === 'gps');
    $('tab-miembros').classList.toggle('active', tab === 'miembros');
    $('panel-radio').classList.toggle('visible', tab === 'radio');
    panelGps.classList.toggle('visible', tab === 'gps');
    panelMiembros.classList.toggle('visible', tab === 'miembros');
};

function salirDeApp() {
    if (mundoActivo) localStorage.setItem(lastSeenKey(mundoActivo.id), String(Date.now()));
    detenerGPS();
    detenerMicrofono();
    detenerPresencia();
    detenerEscaneoQR();
    if (unsubMensajes)    { unsubMensajes();    unsubMensajes = null; }
    if (unsubUbicaciones) { unsubUbicaciones(); unsubUbicaciones = null; }
    if (unsubMiembros)    { unsubMiembros();    unsubMiembros = null; }
    if (unsubMundoActivo) { unsubMundoActivo(); unsubMundoActivo = null; }
    detenerLobbyVivo();
    mundoActivo = null;
    primeraCarga = true;
}

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

$('btn-logout-mundos').addEventListener('click', async () => {
    await registrarUsuarioGlobal(false).catch(() => null);
    salirDeApp();
    await signOut(auth);
});

$('btn-volver').addEventListener('click', async () => {
    salirDeApp();
    await mostrarLobby();
});

onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        actualizarLabelsUsuario();
        await registrarUsuarioGlobal(true).catch(() => null);
        await mostrarLobby();
    } else {
        currentUser = null;
        salirDeApp();
        mostrarLogin();
    }
});

// ── MUNDOS / LOBBY ────────────────────────────────────────────────────────
async function crearMundoBaseInicial(base) {
    const refMundo = doc(db, 'mundos', base.id);
    const ahora = Date.now();
    const data = {
        nombre: base.nombre,
        codigo: base.codigo,
        descripcion: base.descripcion,
        tipo: 'base',
        ownerUid: currentUser.uid,
        ownerEmail: currentUser.email,
        miembros: [currentUser.uid],
        capacidad: base.capacidad,
        configurableClave: base.configurableClave,
        claveHash: null,
        creadoAt: ahora,
        updatedAt: ahora
    };

    await setDoc(refMundo, data);
    return { id: base.id, ...base, ...data };
}

async function asegurarMundosBase() {
    // Compatibilidad con reglas anteriores: los mundos base se crean con ownerUid
    // y con el usuario actual como miembro inicial, en vez de crearse vacíos.
    for (const base of MUNDOS_BASE) {
        const refMundo = doc(db, 'mundos', base.id);
        const snap = await getDoc(refMundo).catch(() => null);
        if (!snap?.exists()) {
            await crearMundoBaseInicial(base).catch(err => console.warn('crear mundo base:', err));
        } else {
            // Actualiza metadatos sin tocar clave ni miembros, salvo que el documento
            // haya quedado vacío por una versión anterior.
            const actual = snap.data() || {};
            const miembrosActuales = Array.isArray(actual.miembros) ? actual.miembros : [];
            const fixInicial = (!actual.ownerUid && miembrosActuales.length === 0)
                ? { ownerUid: currentUser.uid, ownerEmail: currentUser.email, miembros: [currentUser.uid] }
                : {};
            await setDoc(refMundo, {
                codigo: actual.codigo || base.codigo,
                descripcion: actual.descripcion || base.descripcion,
                tipo: 'base',
                capacidad: base.capacidad,
                configurableClave: base.configurableClave,
                updatedAt: Date.now(),
                ...fixInicial
            }, { merge: true }).catch(() => null);
        }
    }
}

async function renderMundos() {
    mundosBody.innerHTML = `
        <section class="lobby-section">
            <div class="section-head">
                <div>
                    <div class="seccion-titulo">USUARIOS EN LÍNEA</div>
                    <div class="section-sub" id="usuarios-count">Cargando usuarios registrados...</div>
                </div>
            </div>
            <div class="users-list" id="usuarios-body"><div class="empty small">Cargando usuarios...</div></div>
        </section>

        <section class="lobby-section">
            <div class="section-head">
                <div>
                    <div class="seccion-titulo">MIS CHATS Y GRUPOS</div>
                    <div class="section-sub">Chats directos y grupos creados.</div>
                </div>
                <button class="btn-small" id="btn-crear-grupo" type="button">+ CREAR GRUPO</button>
            </div>
            <div class="users-list" id="chats-body"><div class="empty small">Aún no hay chats o grupos creados.</div></div>
        </section>
    `;
    $('btn-crear-grupo')?.addEventListener('click', abrirCrearGrupo);
    renderDirectorioUsuarios();
    renderChatsLobby();
}

function crearTarjetaMundo(m) {
    const card = document.createElement('article');
    card.className = 'mundo-card';
    const miembros = Array.isArray(m.miembros) ? m.miembros.length : 0;
    const privado = !!m.claveHash;
    const limite = m.capacidad ? `${miembros}/${m.capacidad}` : `${miembros}`;

    card.innerHTML = `
        <div class="mundo-card-top">
            <div>
                <div class="mundo-nombre">${m.id === 'papa-mama' ? '👨‍👩‍👧 ' : '🏠 '}${escapeHTML(m.nombre)}</div>
                <div class="mundo-desc">${escapeHTML(m.descripcion || '')}</div>
            </div>
            <div class="mundo-badges">
                <span class="badge ${privado ? 'private' : 'public'}">${privado ? '🔒 PRIVADO' : '🌐 PÚBLICO'}</span>
                <span class="badge limit">👥 ${limite}</span>
            </div>
        </div>
        <div class="mundo-actions">
            <button class="btn-primary" type="button" data-enter>ENTRAR</button>
            <button class="btn-secondary" type="button" data-qr>VER QR</button>
            ${m.id === 'papa-mama' ? '<button class="btn-secondary" type="button" data-settings>AJUSTES</button>' : ''}
        </div>
    `;

    card.querySelector('[data-enter]').addEventListener('click', () => prepararEntrarMundo(m));
    card.querySelector('[data-qr]').addEventListener('click', () => abrirQrMundo(m));
    card.querySelector('[data-settings]')?.addEventListener('click', () => solicitarPinAdulto(() => abrirAjustesMundo(m)));
    return card;
}

async function prepararEntrarMundo(mundoResumen) {
    modalError.textContent = '';
    const refMundo = doc(db, 'mundos', mundoResumen.id);
    let snap = await getDoc(refMundo).catch(() => null);

    // Si el documento fijo del mundo todavía no existe, intentamos crearlo en el momento
    // con la estructura compatible con las reglas antiguas.
    if (!snap?.exists()) {
        const base = MUNDOS_BASE.find(m => m.id === mundoResumen.id) || mundoResumen;
        try {
            await crearMundoBaseInicial(base);
            snap = await getDoc(refMundo).catch(() => null);
        } catch (err) {
            console.error('crear mundo al entrar:', err);
            alert('No pude crear este chat o grupo en Firebase. Revisa que las reglas permitan crear conversaciones.');
            return;
        }
    }

    if (!snap?.exists()) {
        alert('Este chat o grupo aún no existe en Firebase. Vuelve a intentar.');
        return;
    }

    const mundo = { id: snap.id, ...mundoResumen, ...snap.data() };
    const miembros = Array.isArray(mundo.miembros) ? mundo.miembros : [];
    const yaEsMiembro = miembros.includes(currentUser.uid);

    if (Array.isArray(mundo.allowedEmails) && mundo.allowedEmails.length > 0 && !mundo.allowedEmails.includes(currentUser.email)) {
        alert('Tu correo no está habilitado para este mundo.');
        return;
    }

    if (!yaEsMiembro && mundo.capacidad && miembros.length >= mundo.capacidad) {
        alert('Este chat o grupo ya alcanzó el límite de usuarios.');
        return;
    }

    if (mundo.claveHash && !yaEsMiembro) {
        mundoPendienteClave = mundo;
        claveMundoHelp.textContent = `“${mundo.nombre}” está privado. Escribe la clave para entrar.`;
        inpClaveMundo.value = '';
        claveMundoError.textContent = '';
        modalClave.classList.add('visible');
        setTimeout(() => inpClaveMundo.focus(), 120);
        return;
    }

    await entrarMundo(mundo);
}

async function entrarMundo(mundo) {
    const perfil = perfilUsuario();
    const refMundo = doc(db, 'mundos', mundo.id);
    const miembros = Array.isArray(mundo.miembros) ? mundo.miembros : [];

    if (!miembros.includes(currentUser.uid)) {
        try {
            await updateDoc(refMundo, {
                miembros: arrayUnion(currentUser.uid),
                updatedAt: Date.now()
            });
        } catch (err) {
            console.error('agregar miembro al mundo:', err);
            alert('No pude agregarte como miembro de este chat o grupo. Revisa permisos de Firebase.');
            return;
        }
    }

    await guardarPerfilMiembro(mundo.id, true);

    const fresh = await getDoc(refMundo).catch(() => null);
    await mostrarApp({ id: mundo.id, ...(fresh?.exists() ? fresh.data() : mundo) });
}

$('btn-cancelar-clave-mundo').addEventListener('click', () => modalClave.classList.remove('visible'));
$('btn-confirmar-clave-mundo').addEventListener('click', async () => {
    if (!mundoPendienteClave) return;
    const clave = inpClaveMundo.value.trim();
    if (!clave) {
        claveMundoError.textContent = 'Escribe la clave.';
        return;
    }
    const hash = await sha256(clave);
    if (hash !== mundoPendienteClave.claveHash) {
        claveMundoError.textContent = 'Clave incorrecta.';
        return;
    }
    const mundo = mundoPendienteClave;
    mundoPendienteClave = null;
    modalClave.classList.remove('visible');
    await entrarMundo(mundo);
});

// ── QR / CÓDIGO ───────────────────────────────────────────────────────────
function qrPayload(mundo) { return `RFAM:${mundo.id}`; }

function abrirQrMundo(mundo) {
    const codigo = qrPayload(mundo);
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(codigo)}`;
    qrCodeLabel.textContent = mundo.codigo || mundo.id;
    modalQr.classList.add('visible');
}

$('btn-cerrar-qr').addEventListener('click', () => modalQr.classList.remove('visible'));
$('btn-world-qr')?.addEventListener('click', () => mundoActivo && abrirQrMundo(mundoActivo));

function abrirModalUnirse() {
    inpCodigo.value = '';
    modalError.textContent = '';
    scanStatus.textContent = 'Escáner apagado.';
    modalUnirse.classList.add('visible');
    setTimeout(() => inpCodigo.focus(), 100);
}

function cerrarModalUnirse() {
    detenerEscaneoQR();
    modalUnirse.classList.remove('visible');
}

$('btn-cancelar-modal').addEventListener('click', cerrarModalUnirse);
$('btn-confirmar-unirse').addEventListener('click', async () => {
    const mundo = await resolverMundoPorCodigo(inpCodigo.value);
    if (!mundo) {
        modalError.textContent = 'Código no encontrado.';
        return;
    }
    cerrarModalUnirse();
    await prepararEntrarMundo(mundo);
});

async function resolverMundoPorCodigo(valor) {
    let v = String(valor || '').trim();
    if (!v) return null;
    if (v.toUpperCase().startsWith('RFAM:')) v = v.slice(5);
    const normal = normalizarCodigo(v);

    for (const base of MUNDOS_BASE) {
        if (normal === base.id.toUpperCase() || normal === base.codigo.toUpperCase()) {
            const snap = await getDoc(doc(db, 'mundos', base.id)).catch(() => null);
            return { id: base.id, ...base, ...(snap?.exists() ? snap.data() : {}) };
        }
    }

    const snapPorId = await getDoc(doc(db, 'mundos', v.trim())).catch(() => null);
    if (snapPorId?.exists()) return { id: snapPorId.id, ...snapPorId.data() };

    const q = query(collection(db, 'mundos'), where('codigo', '==', normal));
    const snap = await getDocs(q).catch(() => null);
    if (snap && !snap.empty) {
        const d = snap.docs[0];
        return { id: d.id, ...d.data() };
    }
    return null;
}

$('btn-scan-qr').addEventListener('click', iniciarEscaneoQR);

async function iniciarEscaneoQR() {
    modalError.textContent = '';
    if (!('BarcodeDetector' in window)) {
        scanStatus.textContent = 'Este navegador no soporta escaneo QR. Escribe el código manualmente.';
        return;
    }
    try {
        detenerEscaneoQR();
        qrScanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        scanVideo.srcObject = qrScanStream;
        scanVideo.classList.add('visible');
        await scanVideo.play();
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        scanStatus.textContent = 'Apunta la cámara al QR.';
        qrScanTimer = setInterval(async () => {
            try {
                const codes = await detector.detect(scanVideo);
                if (!codes.length) return;
                const value = codes[0].rawValue || '';
                inpCodigo.value = value;
                scanStatus.textContent = 'QR leído correctamente.';
                detenerEscaneoQR();
            } catch (_) {}
        }, 700);
    } catch (err) {
        scanStatus.textContent = 'No se pudo abrir la cámara. Escribe el código manualmente.';
    }
}

function detenerEscaneoQR() {
    if (qrScanTimer) { clearInterval(qrScanTimer); qrScanTimer = null; }
    if (qrScanStream) {
        qrScanStream.getTracks().forEach(t => t.stop());
        qrScanStream = null;
    }
    if (scanVideo) {
        scanVideo.pause?.();
        scanVideo.srcObject = null;
        scanVideo.classList.remove('visible');
    }
}


// ── DIRECTORIO / CHATS DIRECTOS / GRUPOS ─────────────────────────────────
async function registrarUsuarioGlobal(online = true) {
    if (!currentUser) return false;
    const data = perfilActualComoUsuario(online);
    let ok = false;

    try {
        await setDoc(doc(db, 'usuarios', currentUser.uid), data, { merge: true });
        ok = true;
    } catch (err) {
        console.warn('No se pudo guardar usuario global; usando fallback:', err);
    }

    return ok;
}

function iniciarLobbyVivo() {
    detenerLobbyVivo();
    escucharDirectorioUsuarios();
    escucharChatsLobby();
}

function detenerLobbyVivo() {
    if (unsubDirectorio) { unsubDirectorio(); unsubDirectorio = null; }
    if (unsubLobbyMundos) { unsubLobbyMundos(); unsubLobbyMundos = null; }
}

function escucharDirectorioUsuarios() {
    if (!currentUser) return;
    try {
        unsubDirectorio = onSnapshot(collection(db, 'usuarios'), snapshot => {
            const mapa = new Map();
            snapshot.forEach(d => {
                const u = normalizarUsuario({ uid: d.id, ...d.data() });
                if (u.uid) mapa.set(u.uid, u);
            });
            const actual = perfilActualComoUsuario(true);
            mapa.set(currentUser.uid, { ...(mapa.get(currentUser.uid) || {}), ...actual });
            directorioUsuarios = Array.from(mapa.values()).sort(ordenarUsuarios);
            renderDirectorioUsuarios();
            renderGroupUsersList();
        }, err => {
            console.warn('Directorio global no disponible; usando listado local:', err);
            escucharDirectorioFallbackLocal();
        });
    } catch (err) {
        console.warn('No se pudo iniciar directorio global:', err);
        escucharDirectorioFallbackLocal();
    }
}

function escucharDirectorioFallbackLocal() {
    if (unsubDirectorio) { unsubDirectorio(); unsubDirectorio = null; }
    const mapa = new Map();
    const actual = perfilActualComoUsuario(true);
    mapa.set(currentUser.uid, actual);
    chatsLobby.forEach(chatItem => {
        Object.values(chatItem.miembrosInfo || {}).forEach(raw => {
            const u = normalizarUsuario(raw);
            if (u.uid) mapa.set(u.uid, u);
        });
    });
    directorioUsuarios = Array.from(mapa.values()).sort(ordenarUsuarios);
    renderDirectorioUsuarios();
    renderGroupUsersList();
}

function escucharChatsLobby() {
    if (!currentUser) return;
    const q = query(collection(db, 'mundos'), where('miembros', 'array-contains', currentUser.uid));
    unsubLobbyMundos = onSnapshot(q, snapshot => {
        chatsLobby = [];
        snapshot.forEach(d => {
            const data = { id: d.id, ...d.data() };
            if (data.tipo === 'directo' || data.tipo === 'grupo') chatsLobby.push(data);
        });
        chatsLobby.sort((a, b) => Number(b.updatedAt || b.creadoAt || 0) - Number(a.updatedAt || a.creadoAt || 0));
        if (!directorioUsuarios.length || (directorioUsuarios.length === 1 && directorioUsuarios[0].uid === currentUser?.uid)) {
            escucharDirectorioFallbackLocal();
        }
        renderChatsLobby();
    }, err => {
        console.warn('No se pudieron cargar chats/grupos:', err);
        chatsLobby = [];
        renderChatsLobby();
    });
}

function renderDirectorioUsuarios() {
    const body = $('usuarios-body');
    const count = $('usuarios-count');
    if (!body) return;
    const lista = directorioUsuarios.slice().sort(ordenarUsuarios);
    const online = lista.filter(usuarioOnline).length;
    if (count) count.textContent = `${online} usuario${online === 1 ? '' : 's'} en línea • ${lista.length} registrado${lista.length === 1 ? '' : 's'}`;

    if (!lista.length) {
        body.innerHTML = '<div class="empty small">Aún no hay usuarios registrados.</div>';
        return;
    }

    body.innerHTML = '';
    lista.forEach(u => {
        const esYo = u.uid === currentUser?.uid;
        const enLinea = usuarioOnline(u);
        const row = document.createElement('article');
        row.className = `user-row ${enLinea ? 'online-row' : ''}`;
        row.innerHTML = `
            <div class="user-avatar">${escapeHTML(avatarDe(u))}</div>
            <div class="user-main">
                <div class="user-name">${escapeHTML(displayNameDe(u))}${esYo ? ' <span class="you-tag">TÚ</span>' : ''}</div>
                <div class="user-meta">${escapeHTML(u.email || '')}</div>
                <div class="user-meta">${enLinea ? '🟢 En línea ahora' : `Última conexión: ${escapeHTML(tiempoRelativo(u.lastSeen))}`}</div>
            </div>
            <button class="btn-small" type="button" data-chat-user="${escapeHTML(u.uid)}" ${esYo ? 'disabled' : ''}>CHAT</button>
        `;
        row.querySelector('[data-chat-user]')?.addEventListener('click', () => abrirChatDirecto(u));
        body.appendChild(row);
    });
}

function renderChatsLobby() {
    const body = $('chats-body');
    if (!body) return;
    if (!chatsLobby.length) {
        body.innerHTML = '<div class="empty small">Aún no hay chats directos ni grupos creados.</div>';
        return;
    }
    body.innerHTML = '';
    chatsLobby.forEach(chatItem => {
        const miembros = Array.isArray(chatItem.miembros) ? chatItem.miembros.length : 0;
        const row = document.createElement('article');
        row.className = 'user-row chat-row';
        row.innerHTML = `
            <div class="user-avatar">${chatItem.tipo === 'grupo' ? '👥' : '💬'}</div>
            <div class="user-main">
                <div class="user-name">${escapeHTML(chatItem.nombre || 'Chat')}</div>
                <div class="user-meta">${chatItem.tipo === 'grupo' ? 'Grupo' : 'Chat directo'} • ${miembros} miembro${miembros === 1 ? '' : 's'}</div>
                <div class="user-meta">Actualizado: ${escapeHTML(tiempoRelativo(chatItem.updatedAt || chatItem.creadoAt))}</div>
            </div>
            <button class="btn-small" type="button" data-open-chat>ENTRAR</button>
        `;
        row.querySelector('[data-open-chat]')?.addEventListener('click', () => prepararEntrarMundo(chatItem));
        body.appendChild(row);
    });
}

async function abrirChatDirecto(usuario) {
    if (!currentUser || !usuario?.uid || usuario.uid === currentUser.uid) return;
    const perfil = perfilUsuario();
    const yo = perfilActualComoUsuario(true);
    const otro = normalizarUsuario(usuario);
    const id = idChatDirecto(currentUser.uid, otro.uid);
    const miembros = uniqueArray([currentUser.uid, otro.uid]).sort();
    const ahora = Date.now();
    const miembrosInfo = { [currentUser.uid]: yo, [otro.uid]: otro };
    const nombreDirecto = `Chat con ${displayNameDe(otro)}`;
    const data = {
        nombre: nombreDirecto,
        codigo: id.toUpperCase().slice(0, 36),
        descripcion: `Chat directo entre ${perfil.displayName} y ${displayNameDe(otro)}`,
        tipo: 'directo',
        ownerUid: currentUser.uid,
        ownerEmail: currentUser.email,
        miembros,
        miembrosInfo,
        capacidad: 2,
        claveHash: null,
        creadoAt: ahora,
        updatedAt: ahora
    };

    try {
        await setDoc(doc(db, 'mundos', id), data, { merge: true });
        await entrarMundo({ id, ...data });
    } catch (err) {
        console.warn('No se pudo crear/actualizar chat directo:', err);
        const snap = await getDoc(doc(db, 'mundos', id)).catch(() => null);
        if (snap?.exists()) return entrarMundo({ id, ...snap.data() });
        alert('No pude abrir el chat directo. Revisa reglas para crear mundos tipo directo.');
    }
}

function abrirCrearGrupo() {
    if (!modalCrearGrupo) return;
    inpGroupName.value = '';
    groupError.textContent = '';
    renderGroupUsersList();
    modalCrearGrupo.classList.add('visible');
    setTimeout(() => inpGroupName.focus(), 100);
}

function renderGroupUsersList() {
    if (!groupUsersList || !modalCrearGrupo?.classList.contains('visible')) return;
    const lista = directorioUsuarios.filter(u => u.uid && u.uid !== currentUser?.uid).sort(ordenarUsuarios);
    if (!lista.length) {
        groupUsersList.innerHTML = '<div class="empty small">No hay otros usuarios registrados para agregar.</div>';
        return;
    }
    groupUsersList.innerHTML = '';
    lista.forEach(u => {
        const id = `chk_${u.uid}`.replace(/[^A-Za-z0-9_\-]/g, '_');
        const label = document.createElement('label');
        label.className = 'check-user-row';
        label.innerHTML = `
            <input type="checkbox" value="${escapeHTML(u.uid)}" id="${escapeHTML(id)}">
            <span class="user-avatar small-avatar">${escapeHTML(avatarDe(u))}</span>
            <span class="check-user-main">
                <strong>${escapeHTML(displayNameDe(u))}</strong>
                <small>${usuarioOnline(u) ? '🟢 En línea' : `Última conexión: ${escapeHTML(tiempoRelativo(u.lastSeen))}`}</small>
            </span>
        `;
        groupUsersList.appendChild(label);
    });
}

async function crearGrupoPersonalizado() {
    if (!currentUser) return;
    const nombreGrupo = inpGroupName.value.trim().slice(0, 32);
    if (!nombreGrupo) {
        groupError.textContent = 'Escribe un nombre para el grupo.';
        return;
    }
    const seleccionados = Array.from(groupUsersList.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
    if (!seleccionados.length) {
        groupError.textContent = 'Selecciona al menos un usuario.';
        return;
    }

    const yo = perfilActualComoUsuario(true);
    const miembros = uniqueArray([currentUser.uid, ...seleccionados]);
    const info = { [currentUser.uid]: yo };
    directorioUsuarios.forEach(u => {
        if (miembros.includes(u.uid)) info[u.uid] = normalizarUsuario(u);
    });
    const id = `grupo_${Date.now()}_${currentUser.uid.slice(0, 8)}`.replace(/[^A-Za-z0-9_\-]/g, '_');
    const ahora = Date.now();
    const data = {
        nombre: nombreGrupo,
        codigo: codigoCorto('GRP'),
        descripcion: 'Grupo creado desde el lobby.',
        tipo: 'grupo',
        ownerUid: currentUser.uid,
        ownerEmail: currentUser.email,
        miembros,
        miembrosInfo: info,
        capacidad: null,
        claveHash: null,
        creadoAt: ahora,
        updatedAt: ahora
    };

    try {
        groupError.textContent = 'Creando grupo...';
        await setDoc(doc(db, 'mundos', id), data);
        modalCrearGrupo.classList.remove('visible');
        await entrarMundo({ id, ...data });
    } catch (err) {
        console.error('crear grupo:', err);
        groupError.textContent = 'No se pudo crear el grupo. Revisa reglas para mundos tipo grupo.';
    }
}

$('btn-cancel-group')?.addEventListener('click', () => modalCrearGrupo.classList.remove('visible'));
$('btn-create-group')?.addEventListener('click', crearGrupoPersonalizado);

// ── PIN ADULTO / AJUSTES MUNDO ───────────────────────────────────────────
function solicitarPinAdulto(callback) {
    adultPinCallback = callback;
    const tienePin = !!localStorage.getItem(adultPinKey());
    adultPinTitle.textContent = tienePin ? 'PIN ADULTO' : 'CREAR PIN ADULTO';
    adultPinHelp.textContent = tienePin
        ? 'Escribe el PIN adulto para configurar el mundo.'
        : 'Crea un PIN local para proteger los ajustes del mundo en este dispositivo.';
    adultPinInput.value = '';
    adultPinError.textContent = '';
    modalAdultPin.classList.add('visible');
    setTimeout(() => adultPinInput.focus(), 120);
}

$('btn-cancelar-adult-pin').addEventListener('click', () => modalAdultPin.classList.remove('visible'));
$('btn-confirmar-adult-pin').addEventListener('click', async () => {
    const pin = adultPinInput.value.trim();
    if (!/^\d{4,8}$/.test(pin)) {
        adultPinError.textContent = 'Usa entre 4 y 8 números.';
        return;
    }
    const guardado = localStorage.getItem(adultPinKey());
    const hash = await sha256(pin);
    if (!guardado) {
        localStorage.setItem(adultPinKey(), hash);
    } else if (guardado !== hash) {
        adultPinError.textContent = 'PIN incorrecto.';
        return;
    }
    modalAdultPin.classList.remove('visible');
    const cb = adultPinCallback;
    adultPinCallback = null;
    if (cb) cb();
});

$('btn-world-settings')?.addEventListener('click', () => {
    return;
});

async function abrirAjustesMundo(mundo) {
    const snap = await getDoc(doc(db, 'mundos', mundo.id)).catch(() => null);
    const data = { ...mundo, ...(snap?.exists() ? snap.data() : {}) };
    mundoActivo = mundoActivo?.id === data.id ? { ...mundoActivo, ...data } : mundoActivo;
    inpWorldName.value = data.nombre || 'Chat';
    inpWorldPass.value = '';
    worldSettingsError.textContent = '';
    worldSettingsHelp.textContent = data.claveHash
        ? 'Este mundo está privado. Puedes cambiar la clave o hacerlo público.'
        : 'Este mundo está público. Puedes asignarle una clave para hacerlo privado.';
    modalWorldCfg.dataset.worldId = data.id;
    modalWorldCfg.classList.add('visible');
}

$('btn-close-world-settings').addEventListener('click', () => modalWorldCfg.classList.remove('visible'));
$('btn-save-world-settings').addEventListener('click', async () => {
    const worldId = modalWorldCfg.dataset.worldId;
    if (!worldId) return;
    const nombreMundo = inpWorldName.value.trim().slice(0, 32) || 'Chat';
    const clave = inpWorldPass.value.trim();
    const data = { nombre: nombreMundo, updatedAt: Date.now() };
    if (clave) data.claveHash = await sha256(clave);
    try {
        await updateDoc(doc(db, 'mundos', worldId), data);
        worldSettingsError.textContent = 'Cambios guardados.';
        if (mundoActivo?.id === worldId) {
            mundoActivo.nombre = nombreMundo;
            mundoActivoLbl.textContent = `🌍 ${nombreMundo} • ${mundoActivo.codigo || mundoActivo.id}`;
        }
        await renderMundos().catch(() => null);
    } catch (err) {
        worldSettingsError.textContent = 'No se pudieron guardar los cambios.';
    }
});

$('btn-remove-world-pass').addEventListener('click', async () => {
    const worldId = modalWorldCfg.dataset.worldId;
    if (!worldId) return;
    const confirmar = confirm('¿Quieres hacer público este mundo y quitar la clave?');
    if (!confirmar) return;
    try {
        await updateDoc(doc(db, 'mundos', worldId), { claveHash: null, updatedAt: Date.now() });
        worldSettingsError.textContent = 'El mundo ahora está público.';
        await renderMundos().catch(() => null);
    } catch (_) {
        worldSettingsError.textContent = 'No se pudo quitar la clave.';
    }
});

// ── PERFIL ────────────────────────────────────────────────────────────────
btnPerfil?.addEventListener('click', abrirPerfil);
btnPerfilApp?.addEventListener('click', abrirPerfil);
$('btn-cancelar-perfil').addEventListener('click', () => modalPerfil.classList.remove('visible'));
$('btn-guardar-perfil').addEventListener('click', () => {
    guardarPerfilLocal(inpPerfilNombre.value, avatarSeleccionado);
    modalPerfil.classList.remove('visible');
});

function abrirPerfil() {
    const perfil = perfilUsuario();
    avatarSeleccionado = perfil.avatar;
    inpPerfilNombre.value = perfil.displayName;
    avatarOpciones.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.avatar === avatarSeleccionado);
    });
    modalPerfil.classList.add('visible');
    setTimeout(() => inpPerfilNombre.focus(), 100);
}

avatarOpciones.addEventListener('click', e => {
    const btn = e.target.closest('button[data-avatar]');
    if (!btn) return;
    avatarSeleccionado = btn.dataset.avatar;
    avatarOpciones.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
});

async function actualizarPerfilEnMundoActivo() {
    if (!currentUser || !mundoActivo) return;
    await guardarPerfilMiembro(mundoActivo.id, true);
}


async function guardarPerfilMiembro(mundoId, online = true) {
    if (!currentUser || !mundoId) return false;
    const perfil = perfilUsuario();
    const ahora = Date.now();
    const data = {
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: perfil.displayName,
        avatar: perfil.avatar,
        lastSeen: ahora,
        isOnline: online
    };

    // Primero intenta el diseño nuevo: mundos/{mundoId}/miembros/{uid}.
    // Si las reglas antiguas no permiten esa subcolección, no bloqueamos la entrada.
    if (miembrosSubcoleccionOK) {
        try {
            await setDoc(doc(db, 'mundos', mundoId, 'miembros', currentUser.uid), {
                ...data,
                joinedAt: ahora
            }, { merge: true });
            return true;
        } catch (err) {
            miembrosSubcoleccionOK = false;
            console.warn('No se pudo guardar en subcolección miembros; usando fallback silencioso:', err);
        }
    }

    // Fallback compatible: intenta guardar el perfil dentro del documento del mundo.
    // Si las reglas tampoco permiten este campo, la app continúa funcionando sin alertas.
    try {
        await updateDoc(doc(db, 'mundos', mundoId), {
            [`miembrosInfo.${currentUser.uid}`]: data,
            updatedAt: ahora
        });
        return true;
    } catch (err) {
        console.warn('No se pudo guardar perfil de miembro en fallback:', err);
        return false;
    }
}

function renderMiembrosDesdeLista(lista = []) {
    if (!panelMiembros) return;
    panelMiembros.innerHTML = '';
    if (!lista.length) {
        panelMiembros.innerHTML = '<div class="empty">Sin miembros aún.</div>';
        return;
    }
    lista.forEach(data => {
        const online = data.isOnline && (Date.now() - data.lastSeen) < 2 * 60 * 1000;
        const card = document.createElement('article');
        card.className = 'member-card';
        const esYo = data.uid === currentUser?.uid;
        card.innerHTML = `
            <div class="member-name">
                <span>${escapeHTML(avatarDe(data))} ${escapeHTML(displayNameDe(data))}${esYo ? ' <span class="you-tag">TÚ</span>' : ''}</span>
                <span class="${online ? 'online' : 'offline'}">${online ? 'EN LÍNEA' : 'FUERA'}</span>
            </div>
            <div class="member-row">Correo: <span>${escapeHTML(data.email || '')}</span></div>
            <div class="member-row">Última conexión: <span>${tiempoRelativo(data.lastSeen)}</span></div>
            ${!esYo && data.uid ? '<button class="btn-small" type="button" data-chat-member>ABRIR CHAT DIRECTO</button>' : ''}
        `;
        card.querySelector('[data-chat-member]')?.addEventListener('click', () => abrirChatDirecto(data));
        panelMiembros.appendChild(card);
    });
}

function renderMiembrosDesdeMundo(mundo = {}) {
    const info = mundo.miembrosInfo || {};
    const lista = Object.values(info);
    if (lista.length) {
        renderMiembrosDesdeLista(lista);
        return;
    }

    const miembros = Array.isArray(mundo.miembros) ? mundo.miembros : [];
    renderMiembrosDesdeLista(miembros.map(uid => ({
        uid,
        displayName: uid === currentUser?.uid ? perfilUsuario().displayName : 'Miembro',
        avatar: uid === currentUser?.uid ? perfilUsuario().avatar : '👤',
        email: uid === currentUser?.uid ? currentUser.email : '',
        lastSeen: uid === currentUser?.uid ? Date.now() : null,
        isOnline: uid === currentUser?.uid
    })));
}

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
            recibidoPor: [currentUser.uid],
            reproducidoPor: []
        });
        setStatus('LISTO PARA TRANSMITIR');
    } catch (err) {
        console.error(err);
        setStatus('ERROR AL ENVIAR', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
    }
}

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

btnPtt.addEventListener('pointerdown', iniciarTx);
btnPtt.addEventListener('pointerup', detenerTx);
btnPtt.addEventListener('pointerleave', detenerTx);
btnPtt.addEventListener('pointercancel', detenerTx);
window.addEventListener('pointerup', detenerTx);
document.addEventListener('visibilitychange', () => { if (document.hidden) detenerTx(); });

// ── MENSAJES / EMOJIS ─────────────────────────────────────────────────────
async function calcularPendientes(mundoId) {
    try {
        const lastSeen = Number(localStorage.getItem(lastSeenKey(mundoId)) || 0);
        if (!lastSeen) return;
        const q = query(
            collection(db, 'mundos', mundoId, 'mensajes'),
            where('timestamp', '>', lastSeen),
            orderBy('timestamp', 'asc')
        );
        const snap = await getDocs(q);
        let count = 0;
        snap.forEach(d => { if (d.data().uid !== currentUser.uid) count++; });
        mostrarContadorNuevos(count);
    } catch (_) {}
}

function escucharMensajes(mundoId) {
    if (unsubMensajes) { unsubMensajes(); unsubMensajes = null; }
    const q = query(collection(db, 'mundos', mundoId, 'mensajes'), orderBy('timestamp', 'asc'));
    unsubMensajes = onSnapshot(q, snapshot => {
        snapshot.docChanges().forEach(change => {
            const data = { id: change.doc.id, ...change.doc.data() };
            const esPropio = data.uid === currentUser?.uid;

            if (change.type === 'removed') {
                chat.querySelector(`[data-msg-id="${change.doc.id}"]`)?.remove();
                return;
            }

            if (change.type === 'modified') {
                actualizarMensajeDom(data, esPropio);
                return;
            }

            if (change.type !== 'added') return;
            const div = agregarMensaje(data, esPropio);

            if (!esPropio) {
                updateDoc(doc(db, 'mundos', mundoId, 'mensajes', data.id), {
                    recibidoPor: arrayUnion(currentUser.uid)
                }).catch(() => null);
            }

            if (!primeraCarga && !esPropio) {
                sonarAviso(data.tipo === 'emergencia' ? 'emergencia' : 'audio');
                if (data.tipo === 'audio') reproducirConReintentos(data.audioUrl, div, data);
            }
        });
        primeraCarga = false;
    });
}

function agregarMensaje(data, esPropio) {
    const div = document.createElement('div');
    const tipo = data.tipo || 'audio';
    div.className = `msg${esPropio ? ' own' : ''}${tipo === 'emergencia' ? ' emergency' : ''}`;
    div.dataset.msgId = data.id || '';
    div.dataset.url = data.audioUrl || '';
    div.dataset.tipo = tipo;

    const puedeEliminar = data.id && esPropio;
    const icono = tipo === 'emoji' ? '💬' : tipo === 'emergencia' ? '🚨' : (esPropio ? '🎙️' : '🔊');
    const nombreVisible = `${avatarDe(data)} ${displayNameDe(data)}`;
    const fecha = formatoFechaHora(data.timestamp);
    const estado = estadoMensaje(data, esPropio);

    let contenido = '';
    if (tipo === 'emoji') {
        contenido = `<div class="msg-emoji">${escapeHTML(data.emoji || '👍')}</div><div class="msg-label">Emoji enviado</div>`;
    } else if (tipo === 'emergencia') {
        const maps = data.lat && data.lng ? `https://www.google.com/maps?q=${data.lat},${data.lng}` : '';
        contenido = `
            <div class="msg-label">🚨 Emergencia familiar enviada</div>
            ${maps ? `<a class="gps-link" href="${maps}" target="_blank">VER UBICACIÓN</a>` : ''}
        `;
    } else {
        contenido = `<div class="msg-label">${esPropio ? 'Enviaste un audio' : 'Audio recibido'}</div>`;
    }

    div.innerHTML = `
        <div class="msg-icon">${icono}</div>
        <div class="msg-body">
            <div class="msg-sender">${escapeHTML(nombreVisible)}</div>
            ${contenido}
            <div class="msg-time">${escapeHTML(fecha)}</div>
            <div class="msg-state">${escapeHTML(estado)}</div>
            ${puedeEliminar ? '<button class="msg-delete" type="button" data-delete-msg>ELIMINAR</button>' : ''}
        </div>
    `;

    if (tipo === 'audio') {
        div.title = 'Toca para reproducir';
        div.addEventListener('click', () => reproducir(data.audioUrl, div, data));
    }

    div.querySelector('[data-delete-msg]')?.addEventListener('click', e => {
        e.stopPropagation();
        confirmarEliminarMensaje(data, div);
    });

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
}

function estadoMensaje(data, esPropio) {
    const recibidos = Array.isArray(data.recibidoPor) ? data.recibidoPor.filter(uid => uid !== currentUser?.uid) : [];
    const reproducidos = Array.isArray(data.reproducidoPor) ? data.reproducidoPor.filter(uid => uid !== currentUser?.uid) : [];
    if (esPropio) {
        if (reproducidos.length > 0) return `✓✓ Reproducido por ${reproducidos.length}`;
        if (recibidos.length > 0) return `✓✓ Recibido por ${recibidos.length}`;
        return '✓ Enviado';
    }
    if (Array.isArray(data.reproducidoPor) && data.reproducidoPor.includes(currentUser?.uid)) return 'Reproducido por ti';
    if ((data.tipo || 'audio') === 'audio') return 'Toca para escuchar';
    return 'Recibido';
}

function actualizarMensajeDom(data, esPropio) {
    const div = chat.querySelector(`[data-msg-id="${data.id}"]`);
    if (!div) return;
    const state = div.querySelector('.msg-state');
    if (state) state.textContent = estadoMensaje(data, esPropio);
}

async function confirmarEliminarMensaje(data, divMsg) {
    if (!currentUser || !mundoActivo || !data?.id) return;
    const primera = confirm('¿Eliminar este mensaje?');
    if (!primera) return;
    const segunda = confirm('Confirmación final: se eliminará de Firestore y no se podrá recuperar. ¿Continuar?');
    if (!segunda) return;

    try {
        setStatus('ELIMINANDO...', 'sending');
        if (audioActivo) { audioActivo.pause(); audioActivo = null; }
        await deleteDoc(doc(db, 'mundos', mundoActivo.id, 'mensajes', data.id));
        if (data.storagePath) {
            try { await deleteObject(ref(storage, data.storagePath)); } catch (_) {}
        }
        divMsg?.remove();
        setStatus('MENSAJE ELIMINADO');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 1800);
    } catch (err) {
        console.error('eliminar mensaje:', err);
        setStatus('NO SE PUDO ELIMINAR', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
    }
}

async function reproducirConReintentos(url, divMsg, data, intentos = 0) {
    try {
        await reproducir(url, divMsg, data, false);
    } catch (_) {
        if (intentos < 3) {
            setTimeout(() => reproducirConReintentos(url, divMsg, data, intentos + 1), 600);
        }
    }
}

async function reproducir(url, divMsg, data, mostrarError = true) {
    if (!url) return;
    if (audioActivo) { audioActivo.pause(); audioActivo = null; }
    const icon = divMsg?.querySelector('.msg-icon');
    const normal = divMsg?.classList.contains('own') ? '🎙️' : '🔊';
    if (icon) icon.textContent = '⏳';

    const marcarError = err => {
        console.error('reproducir:', err);
        audioActivo = null;
        if (icon) icon.textContent = '▶️';
        if (mostrarError) {
            setStatus('ERROR AL REPRODUCIR — TOCA PARA REINTENTAR', 'recording');
            setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 3000);
        }
        throw err;
    };

    const preparar = audio => {
        audioActivo = audio;
        audio.preload = 'auto';
        if (icon) icon.textContent = '🔉';
        audio.onended = () => {
            audioActivo = null;
            if (icon) icon.textContent = normal;
            if (data?.id && mundoActivo) {
                updateDoc(doc(db, 'mundos', mundoActivo.id, 'mensajes', data.id), {
                    reproducidoPor: arrayUnion(currentUser.uid)
                }).catch(() => null);
            }
        };
        audio.onerror = () => marcarError(audio.error || new Error('No se pudo cargar el audio'));
    };

    try {
        const audio = new Audio(url);
        preparar(audio);
        await audio.play();
    } catch (errDirecto) {
        try {
            const resp = await fetch(url, { mode: 'cors' });
            if (!resp.ok) throw new Error('fetch ' + resp.status);
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);
            preparar(audio);
            audio.onended = () => {
                audioActivo = null;
                URL.revokeObjectURL(blobUrl);
                if (icon) icon.textContent = normal;
                if (data?.id && mundoActivo) {
                    updateDoc(doc(db, 'mundos', mundoActivo.id, 'mensajes', data.id), {
                        reproducidoPor: arrayUnion(currentUser.uid)
                    }).catch(() => null);
                }
            };
            await audio.play();
        } catch (errBlob) {
            marcarError(errBlob || errDirecto);
        }
    }
}

$('emoji-bar').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-emoji]');
    if (!btn) return;
    await enviarEmoji(btn.dataset.emoji);
});

async function enviarEmoji(emoji) {
    if (!currentUser || !mundoActivo) return;
    try {
        const perfil = perfilUsuario();
        await addDoc(collection(db, 'mundos', mundoActivo.id, 'mensajes'), {
            tipo: 'emoji',
            emoji,
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: perfil.displayName,
            avatar: perfil.avatar,
            timestamp: Date.now(),
            expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
            recibidoPor: [currentUser.uid],
            reproducidoPor: []
        });
    } catch (_) {
        setStatus('NO SE PUDO ENVIAR EL EMOJI', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 1800);
    }
}

// ── GPS / EMERGENCIA ──────────────────────────────────────────────────────
function iniciarGPS(mundoId) {
    if (!navigator.geolocation) {
        panelGps.innerHTML = '<div class="empty">Este navegador no soporta ubicación.</div>';
        return;
    }
    const opts = { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 };
    const send = pos => enviarUbicacion(pos, mundoId);
    const onError = () => console.warn('GPS: permiso denegado o ubicación no disponible');
    navigator.geolocation.getCurrentPosition(send, onError, opts);
    gpsWatchId = navigator.geolocation.watchPosition(send, onError, opts);
    gpsIntervalId = setInterval(() => navigator.geolocation.getCurrentPosition(send, onError, opts), 2 * 60 * 1000);
}

function detenerGPS() {
    if (gpsWatchId !== null) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    if (gpsIntervalId !== null) { clearInterval(gpsIntervalId); gpsIntervalId = null; }
}

async function enviarUbicacion(pos, mundoId) {
    if (!currentUser) return;
    ultimaPosicion = pos;
    const perfil = perfilUsuario();
    try {
        await setDoc(doc(db, 'mundos', mundoId, 'ubicaciones', currentUser.uid), {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: perfil.displayName,
            avatar: perfil.avatar,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            updatedAt: Date.now()
        });
    } catch (err) { console.warn('GPS:', err); }
}

function escucharUbicaciones(mundoId) {
    if (unsubUbicaciones) { unsubUbicaciones(); unsubUbicaciones = null; }
    unsubUbicaciones = onSnapshot(collection(db, 'mundos', mundoId, 'ubicaciones'), snapshot => {
        panelGps.innerHTML = '';
        if (snapshot.empty) {
            panelGps.innerHTML = '<div class="empty">Sin ubicaciones aún.</div>';
            return;
        }
        snapshot.forEach(d => {
            const data = d.data();
            const online = (Date.now() - data.updatedAt) < 5 * 60 * 1000;
            const mapsUrl = `https://www.google.com/maps?q=${data.lat},${data.lng}`;
            const card = document.createElement('article');
            card.className = 'gps-card';
            card.innerHTML = `
                <div class="gps-card-name">
                    <span>${escapeHTML(avatarDe(data))} ${escapeHTML(displayNameDe(data))}</span>
                    <span class="${online ? 'online' : 'offline'}">${online ? 'EN LÍNEA' : 'FUERA'}</span>
                </div>
                <div class="gps-row">Latitud: <span>${Number(data.lat).toFixed(6)}</span></div>
                <div class="gps-row">Longitud: <span>${Number(data.lng).toFixed(6)}</span></div>
                <div class="gps-row">Precisión: <span>±${data.accuracy || '?'} m</span></div>
                <div class="gps-row">Actualizado: <span>${tiempoRelativo(data.updatedAt)}</span></div>
                <a class="gps-link" href="${mapsUrl}" target="_blank">🗺️ VER EN MAPA</a>
            `;
            panelGps.appendChild(card);
        });
    });
}

$('btn-emergency').addEventListener('click', async () => {
    if (!currentUser || !mundoActivo) return;
    const confirmar = confirm('¿Enviar emergencia familiar con tu ubicación actual?');
    if (!confirmar) return;

    const enviar = async pos => {
        const perfil = perfilUsuario();
        await enviarUbicacion(pos, mundoActivo.id);
        await addDoc(collection(db, 'mundos', mundoActivo.id, 'mensajes'), {
            tipo: 'emergencia',
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: perfil.displayName,
            avatar: perfil.avatar,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            timestamp: Date.now(),
            expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
            recibidoPor: [currentUser.uid],
            reproducidoPor: []
        });
        sonarAviso('emergencia');
    };

    if (ultimaPosicion) return enviar(ultimaPosicion);
    navigator.geolocation.getCurrentPosition(enviar, () => {
        setStatus('NO SE PUDO TOMAR UBICACIÓN', 'recording');
        setTimeout(() => setStatus('LISTO PARA TRANSMITIR'), 2500);
    }, { enableHighAccuracy: true, timeout: 15000 });
});

// ── PRESENCIA / MIEMBROS ──────────────────────────────────────────────────
function iniciarPresencia(mundoId) {
    detenerPresencia();
    actualizarPerfilEnMundoActivo().catch(() => null);
    presenceIntervalId = setInterval(() => actualizarPerfilEnMundoActivo().catch(() => null), 60 * 1000);
}

function detenerPresencia() {
    if (presenceIntervalId) { clearInterval(presenceIntervalId); presenceIntervalId = null; }
    if (currentUser && mundoActivo) {
        guardarPerfilMiembro(mundoActivo.id, false).catch(() => null);
    }
}

function escucharMiembros(mundoId) {
    if (unsubMiembros) { unsubMiembros(); unsubMiembros = null; }
    unsubMiembros = onSnapshot(collection(db, 'mundos', mundoId, 'miembros'), snapshot => {
        const lista = [];
        snapshot.forEach(d => lista.push(d.data()));
        renderMiembrosDesdeLista(lista);
    }, err => {
        miembrosSubcoleccionOK = false;
        console.warn('No se pudo leer subcolección miembros; usando fallback:', err);
        renderMiembrosDesdeMundo(mundoActivo || {});
    });
}

function escucharMundoActivo(mundoId) {
    if (unsubMundoActivo) { unsubMundoActivo(); unsubMundoActivo = null; }
    unsubMundoActivo = onSnapshot(doc(db, 'mundos', mundoId), snap => {
        if (!snap.exists()) return;
        mundoActivo = { id: snap.id, ...mundoActivo, ...snap.data() };
        mundoActivoLbl.textContent = `🌍 ${mundoActivo.nombre} • ${mundoActivo.codigo || mundoActivo.id}`;
        if (!miembrosSubcoleccionOK) renderMiembrosDesdeMundo(mundoActivo);
    });
}

// ── LIMPIEZA AUDIOS / MENSAJES VENCIDOS ──────────────────────────────────
async function limpiarAudiosViejos(mundoId) {
    try {
        const limite = Date.now();
        const q = query(
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

window.addEventListener('beforeunload', () => { registrarUsuarioGlobal(false).catch(() => null); });
document.addEventListener('visibilitychange', () => { if (currentUser && !document.hidden) registrarUsuarioGlobal(true).catch(() => null); });
