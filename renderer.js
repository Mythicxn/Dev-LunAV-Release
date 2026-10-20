const $ = (id) => document.getElementById(id);
const msgEl = $('msg'), sendBtn = $('send'), seeBtn = $('seescreen'), micBtn = $('btn-mic'), bubble = $('bubble');
const toolsToggle = $('tools-toggle'), quickTools = $('quick-tools');

function setQuickToolsExpanded(expanded) {
  if (!toolsToggle || !quickTools) return;
  const open = !!expanded;
  quickTools.classList.toggle('open', open);
  toolsToggle.classList.toggle('open', open);
  // Giữ biểu tượng ✦ cố định; mỗi lần bấm chỉ xoay đúng 1 vòng.
  toolsToggle.textContent = '✦';
  toolsToggle.classList.remove('spin-once');
  void toolsToggle.offsetWidth; // restart animation cho lần bấm tiếp theo
  toolsToggle.classList.add('spin-once');
  toolsToggle.setAttribute('aria-expanded', String(open));
  toolsToggle.title = open ? L('Thu gọn công cụ', 'Collapse tools') : L('Mở công cụ nhanh', 'Open quick tools');
}

if (toolsToggle) {
  toolsToggle.addEventListener('click', () => setQuickToolsExpanded(!quickTools?.classList.contains('open')));
}
const logEl = $('log'), logListEl = $('loglist'), logStatusEl = $('log-status'), settingsEl = $('settings');
const modelSelectEl = $('model-select'), modelStatusEl = $('modelstatus');

const I18N = {
  vi: { webSearch:'Tìm kiếm web', zoom:'Phóng to / thu nhỏ nhân vật (cuộn chuột trên nhân vật cũng được)', mute:'Bật/tắt tiếng', chatHistory:'Lịch sử trò chuyện', settings:'Cài đặt', close:'Tắt', offline:'● Mất kết nối mạng', historyStatus:'Các tin nhắn LunAV ghi nhớ trong lịch sử.', live2dModel:'Model Live2D', modelStatus:'Đổi model trực tiếp, không cần sửa đường dẫn trong code.', voice:'Giọng nói', voicePitch:'Độ cao giọng:', screenWatch:'Chụp màn hình rồi hỏi - bấm để bật theo dõi nhẹ, bấm lại để tắt', send:'Gửi', animeVoice:'✨ Kiểu anime', voiceTest:'▶ Nghe thử', useVoice:'Dùng giọng này', characterSize:'Kích thước nhân vật', fullBody:'Toàn thân', bust:'Nửa người', closeUp:'Cận mặt', zoomIn:'Phóng to', viewRange:'Khung nhìn: đầu ↔ chân', window:'Cửa sổ', fixedSize:'Giữ nguyên', resizable:'Thay đổi kích thước', width:'Chiều rộng', height:'Chiều cao', clearAll:'Xoá lịch sử và trí nhớ', language:'Ngôn ngữ', messagePlaceholder:'Nhắn gì đó cho mình...' },
  en: { webSearch:'Web search', zoom:'Zoom in / out (you can also scroll on the character)', mute:'Mute / unmute', chatHistory:'Chat history', settings:'Settings', close:'Close', offline:'● Offline', historyStatus:'Messages LunAV remembers in chat history.', live2dModel:'Live2D Model', modelStatus:'Change the model directly without editing paths in code.', voice:'Voice', voicePitch:'Voice pitch:', screenWatch:'Capture the screen and ask - click to start watching, click again to stop', send:'Send', animeVoice:'✨ Anime style', voiceTest:'▶ Test voice', useVoice:'Use this voice', characterSize:'Character size', fullBody:'Full body', bust:'Bust', closeUp:'Close-up', zoomIn:'Zoom', viewRange:'View: head ↔ feet', window:'Window', fixedSize:'Fixed size', resizable:'Resizable', width:'Width', height:'Height', clearAll:'Clear chat history and memory', language:'Language', messagePlaceholder:'Say something to me...' }
};
let appLanguage = 'vi';
function t(key) { return (I18N[appLanguage] && I18N[appLanguage][key]) || I18N.vi[key] || key; }
function L(vi, en) { return appLanguage === 'en' ? en : vi; }
// Khởi tạo trạng thái nút công cụ nhanh SAU khi appLanguage và L() đã sẵn sàng (tránh lỗi TDZ làm dừng cả renderer)
setQuickToolsExpanded(false);
function applyLanguage(lang) {
  appLanguage = lang === 'en' ? 'en' : 'vi';
  document.documentElement.lang = appLanguage;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-prefix]').forEach(el => { el.firstChild.textContent = t(el.dataset.i18nPrefix) + ' '; });
  if ($('language-select')) $('language-select').value = appLanguage;
  if (logStatusEl) logStatusEl.textContent = `${logCount} ${appLanguage === 'en' ? 'messages • Chat history' : 'tin nhắn • Lịch sử trò chuyện'}`;
}

let live2dModels = [];
let currentLive2DModelId = null;
let live2dLoading = false;

let hasKey = false;
let busy = false;
let emoInfo = null;    // thông tin tham số biểu cảm của model
let basePitchHz = 0;   // độ cao giọng đang lưu (Hz), để cộng thêm theo cảm xúc
let pixiApp = null;     // renderer Live2D, dùng để tự co giãn khi cửa sổ thay đổi kích thước
let logCount = 0;

/* ---------- Click xuyên qua vùng trong suốt (không có nhân vật) ---------- */
// Cửa sổ mặc định cho chuột xuyên qua (đặt ở main.js lúc tạo cửa sổ). Ở đây theo dõi
// vị trí chuột: hễ đang ở trên một phần tử UI (nút, thanh nhập, bong bóng...) hoặc trên
// pixel không-trong-suốt của nhân vật thì mới báo main.js "bắt chuột" lại; ngoài ra để
// chuột xuyên thẳng xuống app/cửa sổ bên dưới, không bị nhân vật chặn.
let mouseCapturing = false; // đang ở trạng thái "bắt chuột" (ignore=false) hay không
let clickThroughRaf = false;
let runtimeSettings = { performanceMode: 'balanced', mouseTrackingMode: 'normal', performance: { fps: 45 }, tracking: { x: 0.30, y: 0.20 }, toolPermissions: { tts: true, emotion: true, screen: true, screenWatch: true, desktopVoice: true }, desktopVoice: { silenceMs: 950, maxTurnSec: 15, noiseMultiplier: 2.5, autoListen: false }, screenWatch: { intervalSec: 15, maxMin: 15, skipUnchanged: true, proactiveEnabled: true, proactiveIntervalSec: 60 } }; 
let pixelHitCache = { x: NaN, y: NaN, at: 0, value: false };

function isOverInteractiveUI(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || el === document.documentElement || el === document.body) return false;
  if (el.id === 'canvas') return false; // canvas xử lý riêng bằng alpha pixel bên dưới
  return true; // các phần tử khác (nút, thanh nhập, bong bóng, bảng cài đặt...) luôn tính là UI
}

function isOverCharacterPixel(x, y) {
  try {
    if (!pixiApp || !pixiApp.renderer || !pixiApp.renderer.gl || !pixiApp.view) return false;
    const gl = pixiApp.renderer.gl;
    const canvasEl = pixiApp.view;
    const rect = canvasEl.getBoundingClientRect();
    if (x < rect.left || y < rect.top || x >= rect.right || y >= rect.bottom) return false;
    const now = performance.now();
    // readPixels có thể ép GPU đồng bộ với CPU. Cache ngắn + chỉ đọc lại khi chuột
    // thực sự di chuyển giúp giảm spike CPU/GPU mà vẫn giữ click-through chính xác.
    if (Number.isFinite(pixelHitCache.x) && Math.abs(x - pixelHitCache.x) < 3 && Math.abs(y - pixelHitCache.y) < 3 && now - pixelHitCache.at < 45) {
      return pixelHitCache.value;
    }
    const px = Math.round((x - rect.left) * (canvasEl.width / rect.width));
    const py = Math.round((y - rect.top) * (canvasEl.height / rect.height));
    const pixel = new Uint8Array(4);
    gl.readPixels(px, canvasEl.height - py - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    pixelHitCache = { x, y, at: now, value: pixel[3] > 10 };
    return pixelHitCache.value; // có alpha đáng kể tức là đang trúng nhân vật, không phải nền trong suốt
  } catch { return false; }
}

// Thanh công cụ trên (#drag) và thanh nhập (#inputbar) chỉ hiện khi chuột đang thực sự ở
// TRONG đúng vùng của riêng nó - không dùng body:hover (vốn khiến cả hai cùng hiện bất kể
// chuột đang ở đâu trong cửa sổ), cũng không dùng CSS :hover (không hoạt động vì #inputbar
// đang pointer-events:none lúc ẩn) mà tự tính theo toạ độ chuột thật.
function isPointInRect(x, y, el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function updateHoverPanels(x, y) {
  const dragEl = $('drag');
  const inputbarEl = $('inputbar');
  if (dragEl) dragEl.classList.toggle('show', isPointInRect(x, y, dragEl));
  if (inputbarEl) inputbarEl.classList.toggle('show', isPointInRect(x, y, inputbarEl));
}

function updateClickThrough(x, y) {
  const shouldCapture = isOverInteractiveUI(x, y) || isOverCharacterPixel(x, y);
  if (shouldCapture !== mouseCapturing) {
    mouseCapturing = shouldCapture;
    if (window.api && window.api.setIgnoreMouseEvents) window.api.setIgnoreMouseEvents(!shouldCapture);
  }
  updateHoverPanels(x, y);
}

window.addEventListener('mousemove', (e) => {
  if (clickThroughRaf) return;
  clickThroughRaf = true;
  requestAnimationFrame(() => { clickThroughRaf = false; updateClickThrough(e.clientX, e.clientY); });
});
// Chuột rời hẳn khỏi cửa sổ (hiếm khi xảy ra vì cửa sổ đang cho xuyên qua, nhưng phòng khi
// đang "bắt chuột" mà rê ra ngoài luôn) -> trả về trạng thái xuyên qua mặc định.
window.addEventListener('mouseout', (e) => { if (!e.relatedTarget) updateClickThrough(-1, -1); });

/* ---------- Theo dõi màn hình nhẹ (bấm 👁 để bật/tắt) ---------- */
let watching = false;
let watchTimer = null;
let watchStopAt = 0;
let watchIntervalMs = 15000; // đè lại bằng giá trị từ cai-dat.json (theoDoiKhoangCachGiay) lúc khởi động, xem bên dưới
let watchTickStart = 0;      // lúc bắt đầu lượt chụp gần nhất - để giữ đúng nhịp "mỗi N giây 1 lần" tính từ lúc chụp
let watchMaxMs = 15 * 60 * 1000;
const STOP_WATCH_RE = /(ngừng|dừng|tắt|thôi)[^.!?]{0,12}(theo dõi|nhìn|xem màn hình)|(xong|hết)( việc| rồi){1,2}( nhé)?[.!]?$/i;

/* ---------- Chủ động hiện diện: ACTIVE -> QUIET -> WATCHING -> AWAY -> RETURNED ---------- */
let proactiveEnabled = true;
let proactiveQuietMs = 5 * 60 * 1000;
let proactiveIntervalMs = 60 * 1000;
let proactiveAwayMs = 15 * 60 * 1000;
let proactiveCooldownMinMs = 5 * 60 * 1000;
let proactiveCooldownMaxMs = 7 * 60 * 1000;
let proactiveState = 'ACTIVE';
let attentionMode = 'PASSIVE';
let idleReturnHandledAt = 0;
let proactiveTimer = null;
let proactiveWatching = false;
// Curious Observer: LunAV tự quan sát màn hình nền, không cần bấm nút 👁.
// MẶC ĐỊNH TẮT - bật trong Developer Console (screenWatch.autoObserverEnabled).
// Chỉ gọi Gemini khi ảnh màn hình thực sự thay đổi (main.js tự bỏ qua ảnh trùng, tự chặn khi chạm trần/giờ).
// Khi tắt: vẫn giữ hành vi cũ (chỉ nhìn khi người dùng im lặng >= 5 phút, xem handleProactivePresence).
function autoObserverOn() {
  return runtimeSettings.screenWatch?.autoObserverEnabled === true && proactiveEnabled && runtimeSettings.toolPermissions?.screenWatch !== false;
}
let autoCuriousStarted = false;
let proactiveSilentStreak = 0; // số lần liên tiếp đã gọi Gemini mà vẫn im lặng -> giãn nhịp dần
let proactiveNextSpeakAt = 0;
let proactiveReturnTimer = null;

/* ---------- Giọng nói ---------- */
let muted = false;
let speaking = false;
let viVoice = null;
let enVoice = null;
let audioCtx = null;
let voiceAnalyser = null;
let voiceAnalyserData = null;
let mouthLevel = 0;
let synthMouth = false; // true khi đang đọc bằng giọng Windows (không đo được biên độ)
let mouthSignalSeenAt = 0;
let mouthSpeakingStartedAt = 0;
let streamSpeechText = null;
let streamSpeechPlaying = false;
let streamSpeechPlayedText = null;
let currentSrc = null;
let currentAudioEl = null; // dùng cho audio mp3 (Edge TTS)
let voiceRate = 1; // độ cao giọng (tốc độ phát): >1 cao và nhanh hơn

/* ---------- Desktop Voice: microphone -> Gemini audio -> local TTS ---------- */
const desktopVoice = {
  listening: false, stream: null, recorder: null, chunks: [], audioCtx: null, analyser: null,
  data: null, timer: null, startedAt: 0, speechDetected: false, lastVoiceAt: 0, stopping: false, noiseFloor: 0, noiseSamples: 0,
  silenceMs: 950, maxTurnMs: 15000, noiseMultiplier: 2.5, autoListen: false,
};
function desktopVoiceSetUI(on) {
  if (!micBtn) return;
  micBtn.classList.toggle('listening', !!on);
  micBtn.textContent = on ? '⏹' : '🎙';
  if (on) setQuickToolsExpanded(true);
  micBtn.title = on ? L('Dừng nghe', 'Stop listening') : L('Nói trực tiếp với LunAV', 'Talk directly to LunAV');
}
function desktopVoiceCleanup() {
  if (desktopVoice.timer) { clearInterval(desktopVoice.timer); desktopVoice.timer = null; }
  try { desktopVoice.stream?.getTracks().forEach(t => t.stop()); } catch {}
  desktopVoice.stream = null;
  try { desktopVoice.audioCtx?.close(); } catch {}
  desktopVoice.audioCtx = null; desktopVoice.analyser = null; desktopVoice.data = null;
  desktopVoice.recorder = null; desktopVoice.listening = false; desktopVoice.stopping = false;
  desktopVoiceSetUI(false);
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      resolve(url.includes(',') ? url.slice(url.indexOf(',') + 1) : url);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function startDesktopVoice() {
  if (!micBtn || desktopVoice.listening) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showBubble(L('Trình duyệt này không hỗ trợ microphone.', 'This build does not support microphone recording.'), 'err');
    return;
  }
  try {
    stopSpeaking(); // nói trực tiếp = ưu tiên cao hơn TTS đang phát
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm'];
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    desktopVoice.stream = stream; desktopVoice.recorder = recorder; desktopVoice.chunks = [];
    desktopVoice.listening = true; desktopVoice.startedAt = performance.now();
    desktopVoice.speechDetected = false; desktopVoice.lastVoiceAt = performance.now();
    desktopVoice.noiseFloor = 0; desktopVoice.noiseSamples = 0;
    desktopVoice.audioCtx = new AudioContext();
    const source = desktopVoice.audioCtx.createMediaStreamSource(stream);
    desktopVoice.analyser = desktopVoice.audioCtx.createAnalyser();
    desktopVoice.analyser.fftSize = 512;
    desktopVoice.analyser.smoothingTimeConstant = 0.75;
    source.connect(desktopVoice.analyser);
    desktopVoice.data = new Uint8Array(desktopVoice.analyser.fftSize);
    recorder.ondataavailable = e => { if (e.data && e.data.size) desktopVoice.chunks.push(e.data); };
    recorder.onerror = () => { showBubble(L('Microphone gặp lỗi.', 'Microphone error.'), 'err'); desktopVoiceCleanup(); };
    recorder.onstop = async () => {
      const chunks = desktopVoice.chunks.slice();
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const hadSpeech = desktopVoice.speechDetected;
      desktopVoiceCleanup();
      if (!chunks.length) return;
      if (!hadSpeech) { // không bắt được tiếng nói (bấm mic rồi im lặng): không gửi lên Gemini cho tốn quota
        showBubble(L('Mình không nghe thấy gì cả.', 'I did not hear anything.'));
        return;
      }
      try {
        const blob = new Blob(chunks, { type });
        if (blob.size < 900) return;
        const data = await blobToBase64(blob);
        sendDevLog('system', `DESKTOP VOICE • gửi ${(blob.size / 1024).toFixed(1)} KB ${type}`);
        window.api.desktopVoiceTurn({ data, mimeType: type }).then(r => {
          if (r && r.ok === false) {
            sendDevLog('error', 'Desktop Voice: ' + String(r.error || 'unknown error'));
            showBubble(String(r.error || L('Desktop Voice bị lỗi.', 'Desktop Voice failed.')), 'err');
          }
        }).catch(e => {
          sendDevLog('error', 'Desktop Voice: ' + String(e?.message || e));
        });
      } catch (e) {
        sendDevLog('error', 'Desktop Voice encode: ' + String(e?.message || e));
      }
    };
    recorder.start(200);
    desktopVoiceSetUI(true);
    showBubble(L('🎙 Đang nghe... nói xong hãy im lặng một chút.', '🎙 Listening... speak, then pause briefly.'));
    desktopVoice.timer = setInterval(() => {
      if (!desktopVoice.listening || !desktopVoice.analyser) return;
      desktopVoice.analyser.getByteTimeDomainData(desktopVoice.data);
      let sum = 0;
      for (const v of desktopVoice.data) { const x = (v - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / desktopVoice.data.length);
      const now = performance.now();
      const elapsed = now - desktopVoice.startedAt;
      // Hiệu chuẩn tiếng ồn nền trong ~350ms đầu để ngưỡng tự nâng lên ở nơi ồn (nếu không sẽ không bao giờ "im lặng").
      if (elapsed < 350) {
        desktopVoice.noiseFloor = (desktopVoice.noiseFloor * desktopVoice.noiseSamples + rms) / (desktopVoice.noiseSamples + 1);
        desktopVoice.noiseSamples++;
      }
      const threshold = Math.min(0.12, Math.max(0.025, desktopVoice.noiseFloor * desktopVoice.noiseMultiplier));
      if (elapsed >= 350 && rms > threshold) {
        desktopVoice.speechDetected = true;
        desktopVoice.lastVoiceAt = now;
      }
      // Sau khi bắt được tiếng nói, 950ms im lặng kết thúc lượt. Không nói thì timeout sau 10s.
      if ((desktopVoice.speechDetected && now - desktopVoice.lastVoiceAt > desktopVoice.silenceMs) || (!desktopVoice.speechDetected && elapsed > 10000) || elapsed > desktopVoice.maxTurnMs) {
        stopDesktopVoice();
      }
    }, 70);
  } catch (e) {
    desktopVoiceCleanup();
    showBubble(L('Không mở được microphone. Hãy kiểm tra quyền microphone của Windows.', 'Could not open the microphone. Check Windows microphone permission.'), 'err');
    sendDevLog('error', 'Desktop Voice permission/device: ' + String(e?.message || e));
  }
}
function stopDesktopVoice() {
  if (!desktopVoice.listening || desktopVoice.stopping) return;
  desktopVoice.stopping = true;
  try { if (desktopVoice.recorder && desktopVoice.recorder.state !== 'inactive') desktopVoice.recorder.stop(); else desktopVoiceCleanup(); } catch { desktopVoiceCleanup(); }
}
if (micBtn) micBtn.addEventListener('click', () => desktopVoice.listening ? stopDesktopVoice() : startDesktopVoice());
// Nhịp nghỉ giữa các câu: dùng chung speech-pacing.js với Discord Voice.
const pacingCfg = { enabled: true, scale: 1 };
// Giữ true suốt cả lượt nói, kể cả lúc nghỉ giữa câu, để biểu cảm/TTS khác không chen ngang.
let speechBusy = false;

// Giọng dự phòng của Windows (dùng khi cả Edge TTS lẫn Gemini TTS đều lỗi/hết hạn mức)
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  viVoice = voices.find((v) => v.lang === 'vi-VN') || voices.find((v) => v.lang.startsWith('vi')) || null;
  enVoice = voices.find((v) => v.lang === 'en-US') || voices.find((v) => v.lang.startsWith('en')) || null;
}
speechSynthesis.onvoiceschanged = pickVoice;
pickVoice();

// "doCaoGiong" trong cai-dat.json (thang 0-2 của Web Speech API, 1 = bình thường): trước đây bị
// hardcode = 1.1 nên chỉnh giá trị này trong cai-dat.json không có tác dụng gì cả. Giờ đọc từ
// state (xem 'get-state' trong main.js) - chỉnh file cai-dat.json rồi khởi động lại app là có hiệu lực.
let windowsPitch = 1;
function speakWindows(text, lang) {
  speechSynthesis.cancel();
  const useEn = lang === 'en';
  const u = new SpeechSynthesisUtterance(text);
  u.lang = useEn ? 'en-US' : 'vi-VN';
  const v = useEn ? enVoice : viVoice;
  if (v) u.voice = v;
  u.pitch = Math.max(0, Math.min(2, windowsPitch));
  u.onstart = () => { speaking = true; synthMouth = true; mouthSpeakingStartedAt = performance.now(); };
  u.onend = u.onerror = () => { speaking = false; synthMouth = false; mouthSignalSeenAt = 0; mouthSpeakingStartedAt = 0; };
  speechSynthesis.speak(u);
}

let playToken = 0; // tăng lên mỗi lần dừng/nói mới để huỷ lượt cũ

function stopSpeaking() {
  playToken++;
  speechSynthesis.cancel();
  if (currentSrc) { try { currentSrc.stop(); } catch {} currentSrc = null; }
  if (currentAudioEl) { try { currentAudioEl.pause(); } catch {} currentAudioEl = null; }
  speaking = false;
  speechBusy = false;
  synthMouth = false;
  mouthSignalSeenAt = 0;
  mouthSpeakingStartedAt = 0;
}

// Tách câu đầu ra riêng để phát sớm; phần còn lại tạo song song rồi phát nối tiếp
function splitReply(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  // Cheap sentence accumulator inspired by Persona Engine: keep every sentence, but merge
  // tiny fragments so TTS does not receive dozens of 1-2 word requests.
  const raw = s.match(/[^.!?…]+[.!?…]+(?:['”’)]*)|[^.!?…]+$/g) || [s];
  const parts = [];
  for (const piece of raw) {
    const t = piece.trim();
    if (!t) continue;
    if (parts.length && t.length < 18) parts[parts.length - 1] += ' ' + t;
    else parts.push(t);
  }
  return parts.length ? parts : [s];
}

function planSpeech(text, emotion, intensity) {
  if (window.SpeechPacing && typeof window.SpeechPacing.plan === 'function') {
    return window.SpeechPacing.plan(text, { enabled: pacingCfg.enabled, scale: pacingCfg.scale, emotion, intensity });
  }
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const m = s.match(/^(.+?[.!?…]+)\s+(.+)$/);
  return (m && m[1].length >= 15 ? [m[1], m[2]] : [s]).map((t) => ({ text: t, pauseAfterMs: 0 }));
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

function ensureVoiceAnalyser() {
  audioCtx = audioCtx || new AudioContext({ sampleRate: 24000 });
  if (!voiceAnalyser) {
    voiceAnalyser = audioCtx.createAnalyser();
    voiceAnalyser.fftSize = 256;
    voiceAnalyser.smoothingTimeConstant = 0.78;
    voiceAnalyserData = new Uint8Array(voiceAnalyser.fftSize);
    voiceAnalyser.connect(audioCtx.destination);
  }
  return audioCtx; // QUAN TRỌNG: trả về AudioContext (createBuffer/createBufferSource/resume nằm ở đây, không phải ở AnalyserNode)
}

function updateMouthLevel() {
  const now = performance.now();
  if (!speaking) {
    mouthLevel += (0 - mouthLevel) * 0.22;
    return mouthLevel;
  }
  if (synthMouth || !voiceAnalyser || !voiceAnalyserData) {
    const v = (Math.sin(now / 92) * 0.5 + 0.5) * 0.72;
    mouthLevel += (v - mouthLevel) * 0.22;
    return mouthLevel;
  }

  voiceAnalyser.getByteTimeDomainData(voiceAnalyserData);
  let sum = 0;
  for (let i = 0; i < voiceAnalyserData.length; i++) {
    const x = (voiceAnalyserData[i] - 128) / 128;
    sum += x * x;
  }
  const rms = Math.sqrt(sum / voiceAnalyserData.length);
  if (rms > 0.012) mouthSignalSeenAt = now;

  // If the analyser has not produced a usable signal yet (or briefly loses it),
  // keep the original speaking animation as a safety net instead of freezing the mouth.
  const noSignalYet = !mouthSignalSeenAt || (now - mouthSignalSeenAt > 180 && now - mouthSpeakingStartedAt < 650);
  const fallback = (Math.sin(now / 92) * 0.5 + 0.5) * 0.62;
  const target = noSignalYet ? fallback : Math.min(1, Math.max(0, (rms - 0.007) * 7.2));
  const speed = target > mouthLevel ? 0.34 : 0.16; // faster attack, softer release
  mouthLevel += (target - mouthLevel) * speed;
  return mouthLevel;
}

async function playPcm(b64, rate) {
  const ctx = ensureVoiceAnalyser();
  if (ctx.state === 'suspended') await ctx.resume();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const buf = ctx.createBuffer(1, pcm.length, 24000);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.min(1.5, Math.max(0.8, rate || 1));
    src.connect(voiceAnalyser);
    src.onended = () => { if (currentSrc === src) { currentSrc = null; speaking = false; } resolve(); };
    currentSrc = src; speaking = true; synthMouth = false; mouthSignalSeenAt = 0; mouthSpeakingStartedAt = performance.now(); src.start();
  });
}

async function playMp3(b64, rate) {
  const ctx = ensureVoiceAnalyser();
  try { if (ctx.state === 'suspended') await ctx.resume(); } catch {}
  const playbackRate = Math.min(1.5, Math.max(0.8, rate || 1));
  // Cách chính: giải mã mp3 rồi phát bằng BufferSource -> đi qua analyser nên miệng nhép theo biên độ thật.
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const buf = await ctx.decodeAudioData(bytes.buffer);
    return await new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = playbackRate;
      src.connect(voiceAnalyser);
      src.onended = () => { if (currentSrc === src) { currentSrc = null; speaking = false; } resolve(); };
      currentSrc = src; speaking = true; synthMouth = false; mouthSignalSeenAt = 0; mouthSpeakingStartedAt = performance.now(); src.start();
    });
  } catch (e) {
    console.warn('[TTS] decodeAudioData lỗi, dùng thẻ <audio> dự phòng:', e && e.message);
  }
  // Dự phòng: thẻ <audio> thường. Không đo được biên độ nên miệng dùng sóng sin.
  return new Promise((resolve) => {
    const audio = new Audio('data:audio/mpeg;base64,' + b64);
    audio.playbackRate = playbackRate;
    const done = () => { if (currentAudioEl === audio) { currentAudioEl = null; speaking = false; synthMouth = false; } resolve(); };
    audio.onended = done; audio.onerror = done;
    currentAudioEl = audio; speaking = true; synthMouth = true; mouthSignalSeenAt = 0; mouthSpeakingStartedAt = performance.now();
    audio.play().catch(done);
  });
}

async function speak(text, opts = {}) {
  if (runtimeSettings.toolPermissions && runtimeSettings.toolPermissions.tts === false && !opts.force) return false;
  if (muted && !opts.force) return false;
  stopSpeaking();
  const token = playToken;
  const lang = opts.lang || 'en';
  const plan = opts.split === false
    ? [{ text: String(text || '').replace(/\s+/g, ' ').trim(), pauseAfterMs: 0 }]
    : planSpeech(text, opts.emotion, opts.intensity);
  const parts = plan.map((p) => p.text).filter(Boolean);
  if (!parts.length) return false;
  const ttsOpt = { voice: opts.voice, style: opts.style, lang, edgeVoice: opts.edgeVoice, edgePitch: opts.edgePitch,
    edgeRate: opts.edgeRate, emotion: opts.emotion, intensity: opts.intensity };

  speechBusy = true;
  try {
    const results = new Array(parts.length);
    let nextToFetch = 0;
    const inFlight = new Map();
    const launch = () => {
      while (nextToFetch < parts.length && inFlight.size < 4) {
        const i = nextToFetch++;
        const job = window.api.tts(parts[i], ttsOpt).then(v => { results[i] = v; inFlight.delete(i); return v; })
          .catch(() => { results[i] = null; inFlight.delete(i); return null; });
        inFlight.set(i, job);
      }
    };
    launch();

    for (let i = 0; i < results.length; i++) {
      if (token !== playToken) return false;
      if (!results[i]) {
        const job = inFlight.get(i);
        if (job) await job;
      }
      launch();
      if (token !== playToken) return false;
      const r = results[i];
      if (!r || !r.ok) {
        if (opts.noFallback) return false;
        // Nếu một câu TTS lỗi, đọc nốt phần còn lại bằng giọng Windows thay vì bỏ mất phần sau.
        speakWindows(parts.slice(i).join(' '), lang);
        return true;
      }
      const rate = opts.rate !== undefined ? opts.rate : voiceRate;
      if (r.kind === 'mp3') await playMp3(r.data, rate);
      else if (r.kind === 'wav') await playMp3(r.pcm, rate); // Gemini 3.8 unary trả WAV; decodeAudioData xử lý trực tiếp.
      else await playPcm(r.pcm, rate);

      const gap = Number(plan[i] && plan[i].pauseAfterMs) || 0;
      if (i < parts.length - 1 && gap > 0 && token === playToken) await sleepMs(gap);
    }
    if (token === playToken) { speaking = false; mouthLevel = 0; mouthSignalSeenAt = 0; mouthSpeakingStartedAt = 0; }
    return true;
  } finally {
    if (token === playToken) speechBusy = false;
  }
}

$('btn-mute').addEventListener('click', () => {
  muted = !muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
  if (muted) stopSpeaking();
});

// Nếu Gemini stream xong speech_en trước reply, bắt đầu giọng sớm và tránh đọc lại ở reactToReply().
// Main gửi kèm emotion/intensity (được yêu cầu xuất trước speech_en) để giọng sớm vẫn có cao độ/tốc độ theo cảm xúc.
if (window.api.onChatSpeechReady) {
  window.api.onChatSpeechReady((payload) => {
    const info = (payload && typeof payload === 'object') ? payload : { text: payload };
    const text = String(info.text || '').trim();
    if (!text || muted || streamSpeechPlaying) return;
    streamSpeechText = text;
    streamSpeechPlayedText = text;
    streamSpeechPlaying = true;
    speak(text, buildSpeechOpts(info.emotion, info.intensity)).finally(() => { streamSpeechPlaying = false; });
  });
}

/* ===== STREAM-SPEECH-BEGIN: giọng nói theo từng câu =====
   main.js gửi 'chat-speech-chunk' ngay khi một câu của speech_en hoàn chỉnh. Mỗi câu được tải TTS ngay lập tức (song song),
   rồi phát lần lượt đúng thứ tự, có nhịp nghỉ giữa câu như speak(). Bị ngắt (mute/mic/nói đè) thì dừng ngay nhờ playToken. */
let streamChunkSession = null;
function endingOfChunk(t) { const m = String(t).trim().match(/([.!?…])["')\]]*$/); return m ? m[1] : 'none'; }
function handleSpeechChunk(ch) {
  if (!ch || !ch.text) return;
  if (muted || (runtimeSettings.toolPermissions && runtimeSettings.toolPermissions.tts === false)) return;
  let ses = streamChunkSession;
  if (ch.seq === 0) {
    stopSpeaking();
    ses = streamChunkSession = { token: playToken, at: performance.now(), opts: buildSpeechOpts(ch.emotion, ch.intensity), items: [], finished: false, notify: null, fullText: '' };
    streamSpeechPlaying = true;
    runStreamPlayback(ses);
  }
  if (!ses || ses.token !== playToken) return; // phiên đã bị ngắt hoặc mất đầu phiên
  const o = ses.opts;
  const ttsOpt = { voice: o.voice, style: o.style, lang: 'en', edgeVoice: o.edgeVoice, edgePitch: o.edgePitch, edgeRate: o.edgeRate, emotion: o.emotion, intensity: o.intensity };
  const job = window.api.tts(ch.text, ttsOpt).catch(() => null);
  ses.items.push({ text: ch.text, job, ending: endingOfChunk(ch.text) });
  if (ch.last) { ses.finished = true; ses.fullText = ch.fullText || ''; streamSpeechText = streamSpeechPlayedText = ses.fullText || null; }
  if (ses.notify) { const n = ses.notify; ses.notify = null; n(); }
}
async function runStreamPlayback(ses) {
  const token = ses.token;
  const waitMore = () => new Promise((res) => { ses.notify = res; setTimeout(res, 3000); });
  speechBusy = true;
  try {
    for (let i = 0; ; i++) {
      while (!ses.items[i]) {
        if (token !== playToken) return;
        if (ses.finished) { speaking = false; mouthLevel = 0; mouthSignalSeenAt = 0; mouthSpeakingStartedAt = 0; return; }
        if (performance.now() - ses.at > 60000) return; // stream treo quá lâu
        await waitMore();
      }
      if (token !== playToken) return;
      const item = ses.items[i];
      const r = await item.job;
      if (token !== playToken) return;
      if (!r || !r.ok) {
        // TTS lỗi: chờ nhận hết các câu rồi đọc phần còn lại bằng giọng Windows (giống nhánh dự phòng của speak()).
        while (!ses.finished && token === playToken && performance.now() - ses.at < 60000) await waitMore();
        if (token === playToken) speakWindows(ses.items.slice(i).map((x) => x.text).join(' '), 'en');
        return;
      }
      if (r.kind === 'mp3') await playMp3(r.data, voiceRate);
      else if (r.kind === 'wav') await playMp3(r.pcm, voiceRate);
      else await playPcm(r.pcm, voiceRate);
      if (token !== playToken) return;
      if (ses.items[i + 1] || !ses.finished) {
        const gap = (window.SpeechPacing && window.SpeechPacing.pauseAfter)
          ? window.SpeechPacing.pauseAfter({ text: item.text, ending: item.ending, paraEnd: false, clause: false }, { emotion: ses.opts.emotion, scale: pacingCfg.enabled === false ? 0 : pacingCfg.scale })
          : 0;
        if (gap > 0) await sleepMs(gap);
      }
    }
  } finally { if (token === playToken) { speechBusy = false; streamSpeechPlaying = false; } }
}
if (window.api.onChatSpeechChunk) window.api.onChatSpeechChunk(handleSpeechChunk);
/* ===== STREAM-SPEECH-END ===== */

// Lời nhắc việc đến giờ (do main.js bắn sang khi app đang mở).
if (window.api.onCompanionEvent) {
  window.api.onCompanionEvent((ev) => {
    if (!ev || ev.type !== 'reminder') return;
    const text = String(ev.reply || ev.text || '').trim();
    if (!text) return;
    if (runtimeSettings.toolPermissions?.emotion !== false && ev.emotion) Emo.set(ev.emotion, ev.intensity || 2);
    showBubble('⏰ ' + text);
    if (ev.speechEn && !muted) speak(ev.speechEn, buildSpeechOpts(ev.emotion, ev.intensity));
    try { sendDevLog('system', 'REMINDER: ' + text); } catch {}
  });
}

/* ---------- Chọn giọng + nghe thử (giọng nữ tiếng Anh, Edge TTS) ---------- */
const VOICES = [
  ['en-US-AriaNeural', 'tươi sáng, biểu cảm'],
  ['en-US-JennyNeural', 'ấm áp, thân thiện'],
  ['en-US-AnaNeural', 'trẻ con, rất "anime"'],
  ['en-US-EmmaNeural', 'tự nhiên, dễ chịu'],
  ['en-US-AshleyNeural', 'vui vẻ, sôi nổi'],
  ['en-US-SaraNeural', 'trẻ trung, thoải mái'],
  ['en-GB-SoniaNeural', 'giọng Anh-Anh, thanh lịch'],
  ['en-GB-MaisieNeural', 'giọng Anh-Anh, trẻ con'],
  ['en-AU-NatashaNeural', 'giọng Úc, tự tin'],
];
(() => {
  const sel = $('voice');
  VOICES.forEach(([n, d]) => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n + ' (' + d + ')';
    sel.appendChild(o);
  });
})();

function setVoiceStatus(text, isErr) {
  $('voicestatus').textContent = text;
  $('voicestatus').className = isErr ? 'err' : '';
}

function pitchStr(hz) { return (hz >= 0 ? '+' : '') + hz + 'Hz'; }

$('voicepitch').addEventListener('input', () => {
  $('voicepitchval').textContent = pitchStr(Number($('voicepitch').value));
});

// Mẫu bắt đầu cho giọng kiểu anime: chọn giọng trẻ + đẩy cao độ lên một chút. Sau đó nghe thử và tinh chỉnh.
$('voiceanime').addEventListener('click', () => {
  $('voice').value = 'en-US-AnaNeural';
  $('voicepitch').value = 30;
  $('voicepitchval').textContent = pitchStr(30);
  setVoiceStatus(L('Đã chọn mẫu kiểu anime (giọng trẻ + cao độ +30Hz). Bấm "Nghe thử", rồi chỉnh lại cho hợp ý.', 'Anime voice preset selected (young voice +30Hz pitch). Press "Test voice" and adjust it if needed.'));
});

$('voicetest').addEventListener('click', async () => {
  const btn = $('voicetest');
  btn.disabled = true;
  setVoiceStatus(L('Đang tạo giọng, đợi vài giây...', 'Generating voice, please wait a few seconds...'));
  const ok = await speak("Hi, I'm LunAV. It's really nice to have you here.", {
    lang: 'en', edgeVoice: $('voice').value, edgePitch: pitchStr(Number($('voicepitch').value)),
    force: true, split: false, noFallback: true,
  });
  btn.disabled = false;
  if (ok) setVoiceStatus('Thích giọng này thì bấm "Dùng giọng này" để lưu.');
  else setVoiceStatus(L('Không tạo được giọng này. Thử giọng khác, hoặc xem lỗi trong cửa sổ đen.', 'Could not generate this voice. Try another voice or check the console for the error.'), true);
});

$('voicesave').addEventListener('click', async () => {
  const pitch = pitchStr(Number($('voicepitch').value));
  const r = await window.api.setVoice({ voice: $('voice').value, pitch });
  if (r.ok) { basePitchHz = Number($('voicepitch').value); setVoiceStatus(L('Đã lưu. Từ tin nhắn sau sẽ dùng giọng này.', 'Saved. This voice will be used for future messages.')); }
  else setVoiceStatus(r.error, true);
});

/* ---------- Bong bóng, lịch sử ---------- */
// Bong bóng tự ẩn sau thời gian đọc (không còn nằm mãi với câu cũ). Bấm vào bong bóng vẫn tắt ngay.
let bubbleHideTimer = null;
let lastRealBubbleAt = Date.now();
let lastIdleMurmurAt = -Infinity;
const MURMURS = ['...', 'um...', 'hm...', 'ừm...'];
function bubbleLifetimeMs(text, kind) {
  if (kind === 'murmur') return 2600;                 // "..." thoáng qua
  if (kind === 'wait') return 90000;                  // "đang nghĩ..." - phòng khi lượt gọi không bao giờ trả về
  if (kind === 'err') return 10000;
  return Math.min(30000, 6000 + String(text || '').length * 60);
}
function scheduleBubbleHide(ms) {
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer);
  bubbleHideTimer = setTimeout(function tryHide() {
    let talking = false;
    try { talking = !!(speaking || speechBusy); } catch {}
    if (talking) { bubbleHideTimer = setTimeout(tryHide, 2000); return; } // đang đọc thành tiếng thì giữ thêm chút
    bubble.hidden = true;
    bubbleHideTimer = null;
  }, ms);
}
function showBubble(text, kind) {
  bubble.textContent = text;
  bubble.className = kind || '';
  bubble.hidden = false;
  bubble.scrollTop = 0;
  if (kind !== 'murmur') lastRealBubbleAt = Date.now();
  scheduleBubbleHide(bubbleLifetimeMs(text, kind));
}
// Model chọn không nói gì sau khi bạn chủ động tương tác: hiện "..." / "um..." thoáng qua rồi tự ẩn.
function showMurmur() { showBubble(MURMURS[Math.floor(Math.random() * MURMURS.length)], 'murmur'); }
// Im lặng rất lâu: thỉnh thoảng (xác suất thấp, tối đa 1 lần / 8 phút) hiện "..." như đang nghĩ vẩn vơ.
setInterval(() => {
  try {
    const now = Date.now();
    if (!bubble.hidden || busy) return;
    if (!logEl.hidden || !settingsEl.hidden) return;
    if (typeof proactiveState !== 'undefined' && proactiveState === 'AWAY') return;
    if (now - lastRealBubbleAt < 5 * 60_000 || now - lastIdleMurmurAt < 8 * 60_000) return;
    if (Math.random() > 0.3) return;
    lastIdleMurmurAt = now;
    showMurmur();
  } catch {}
}, 60_000);
bubble.addEventListener('click', () => { bubble.hidden = true; });

function logStamp() {
  return new Date().toLocaleTimeString(appLanguage === 'en' ? 'en-US' : 'vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function sendDevLog(level, text) {
  try { window.api.devLog(level, text); } catch {}
}

function addLog(role, text) {
  // Đây là LỊCH SỬ TRÒ CHUYỆN, chỉ hiển thị những gì thật sự thuộc hội thoại.
  // Không đưa SYSTEM/SEARCH/ERROR vào đây để tránh lẫn với context hội thoại.
  if (role !== 'user' && role !== 'model') {
    sendDevLog(role, text);
    return;
  }
  const type = role === 'user' ? 'me' : 'ai';
  const labels = { user: 'USER', model: 'Virtual Assist' };
  const d = document.createElement('div');
  d.className = 'm ' + type;
  const head = document.createElement('div');
  head.className = 'log-head';
  const label = document.createElement('span');
  label.className = 'log-label';
  label.textContent = labels[role];
  const tm = document.createElement('span');
  tm.className = 'log-time';
  tm.textContent = logStamp();
  head.appendChild(label);
  head.appendChild(tm);
  const body = document.createElement('div');
  body.className = 'log-body';
  body.textContent = String(text ?? '');
  d.appendChild(head);
  d.appendChild(body);
  (logListEl || logEl).appendChild(d);
  logCount += 1;
  while (logListEl && logListEl.children.length > 300) logListEl.removeChild(logListEl.firstChild);
  if (logStatusEl) logStatusEl.textContent = `${logCount} ${appLanguage === 'en' ? 'messages • Chat history' : 'tin nhắn • Lịch sử trò chuyện'}`;
  if (logListEl) logListEl.scrollTop = logListEl.scrollHeight;
}

function formatLogDetail(o) {
  if (!o || typeof o !== 'object') return String(o ?? '');
  const lines = [];
  if (o.model) lines.push(`model: ${o.model}`);
  if (Number.isFinite(o.elapsedMs)) lines.push(`model ping: ${o.elapsedMs}ms`);
  if (Number.isFinite(o.responseChars)) lines.push(`response: ${o.responseChars} ký tự`);
  if (Number.isFinite(o.historySent)) lines.push(`history sent: ${o.historySent} tin`);
  if (o.watchTick) lines.push('watchTick: true');
  if (o.withScreen) lines.push('screen: captured');
  if (o.screenUnchanged) lines.push('screen: unchanged → bỏ qua Gemini');
  if (o.screenUnavailable) lines.push('screen: unavailable → bỏ qua Gemini');
  if (o.jsonMode) lines.push('response mode: JSON');
  if (o.searchProvider) lines.push(`search provider: ${o.searchProvider}`);
  if (o.searchQuery) lines.push(`query: ${o.searchQuery}`);
  if (o.status) lines.push(`HTTP: ${o.status}`);
  if (o.code) lines.push(`code: ${o.code}`);
  return lines.join(' • ');
}

function logChatDebug(r) {
  const d = r && r.debug ? r.debug : {};
  if (r && r.ok) {
    sendDevLog('system', `${d.model || 'model'} • ${Number.isFinite(d.elapsedMs) ? d.elapsedMs + 'ms' : '—'} • ${Number.isFinite(d.responseChars) ? d.responseChars + ' ký tự' : 'không rõ độ dài'}${formatLogDetail(d) ? '\n' + formatLogDetail(d) : ''}`);
  } else if (r) {
    sendDevLog('error', `${r.error || 'Lỗi không xác định'}\n${formatLogDetail({ ...d, code: r.code, status: r.status })}${r.errorDetail ? '\n' + r.errorDetail : ''}`);
  }
}

function logSearchDebug(search) {
  if (!search) return;
  if (search.used) {
    const provider = search.provider || 'unknown';
    const titles = Array.isArray(search.sources) ? search.sources.slice(0, 5) : [];
    sendDevLog('search', `${provider}${search.query ? ` • ${search.query}` : ''}${titles.length ? '\n' + titles.map((x, i) => `${i + 1}. ${x}`).join('\n') : ''}`);
  } else if (search.blocked || search.note) {
    sendDevLog('search', `Không dùng được web${search.note ? '\n' + search.note : ''}`);
  }
}

function openSettings() {
  logEl.hidden = true; bubble.hidden = true; settingsEl.hidden = false;
  if (modelSelectEl) modelSelectEl.focus();
  if (autoStartEl && window.api.getAutoStart) {
    window.api.getAutoStart().then((on) => { autoStartEl.checked = !!on; }).catch(() => {});
  }
}
function toggleLog() {
  const show = logEl.hidden;
  settingsEl.hidden = true;
  logEl.hidden = !show;
  if (show) { bubble.hidden = true; if (logListEl) logListEl.scrollTop = logListEl.scrollHeight; }
}
$('log-close').addEventListener('click', () => { logEl.hidden = true; msgEl.focus(); });

/* ---------- Tự khởi động cùng Windows ---------- */
const autoStartEl = $('autostart-toggle');
if (autoStartEl) {
  autoStartEl.addEventListener('change', async () => {
    const wanted = autoStartEl.checked;
    const res = await window.api.setAutoStart(wanted);
    if (!res || !res.ok) {
      autoStartEl.checked = !wanted; // revert nếu lỗi (vd đang chạy "npm start", chưa build)
      sendDevLog && sendDevLog('warn', 'Không đặt được tự khởi động: ' + (res && res.error));
    }
  });
}

/* ---------- Điều khiển kích thước cửa sổ ---------- */
const resizeFixedEl = $('resize-fixed');
const resizeEnableEl = $('resize-enable');
const resizeControlsEl = $('resize-controls');
const resizeWidthEl = $('resize-width');
const resizeHeightEl = $('resize-height');
const resizeWidthValEl = $('resize-width-val');
const resizeHeightValEl = $('resize-height-val');
let resizeSaveTimer = null;

function refreshResizeUI() {
  const enabled = !!resizeEnableEl.checked;
  resizeFixedEl.checked = !enabled;
  resizeControlsEl.classList.toggle('disabled', !enabled);
  resizeWidthEl.disabled = !enabled;
  resizeHeightEl.disabled = !enabled;
  resizeWidthValEl.textContent = `${resizeWidthEl.value} px`;
  resizeHeightValEl.textContent = `${resizeHeightEl.value} px`;
}

async function commitWindowResize() {
  const r = await window.api.setWindowSize({
    allow: resizeEnableEl.checked,
    width: Number(resizeWidthEl.value),
    height: Number(resizeHeightEl.value),
  });
  if (!r || !r.ok) {
    sendDevLog('error', 'Không lưu được kích thước cửa sổ. ' + (r && r.error ? r.error : 'unknown error'));
    return;
  }
  resizeWidthEl.value = r.width;
  resizeHeightEl.value = r.height;
  refreshResizeUI();
}

function queueWindowResize() {
  refreshResizeUI();
  clearTimeout(resizeSaveTimer);
  resizeSaveTimer = setTimeout(() => { commitWindowResize().catch((e) => sendDevLog('error', 'Resize IPC lỗi. ' + String(e && e.message || e))); }, 120);
}
function onResizeModeChange() {
  if (!resizeEnableEl.checked) resizeFixedEl.checked = true;
  else resizeFixedEl.checked = false;
  refreshResizeUI();
  commitWindowResize().catch((e) => sendDevLog('error', 'Resize IPC lỗi. ' + String(e && e.message || e)));
}
resizeEnableEl.addEventListener('change', onResizeModeChange);
resizeFixedEl.addEventListener('change', onResizeModeChange);
resizeWidthEl.addEventListener('input', queueWindowResize);
resizeHeightEl.addEventListener('input', queueWindowResize);
resizeWidthEl.addEventListener('change', () => commitWindowResize());
resizeHeightEl.addEventListener('change', () => commitWindowResize());
refreshResizeUI();

/* ---------- Nút bấm ---------- */
$('close').addEventListener('click', () => window.api.quit());
$('btn-log').addEventListener('click', toggleLog);
$('language-select').addEventListener('change', async () => {
  const next = $('language-select').value === 'en' ? 'en' : 'vi';
  const r = await window.api.setLanguage(next);
  if (r && r.ok) {
    applyLanguage(next);
    showBubble(next === 'en' ? 'Language changed to English.' : 'Đã chuyển ngôn ngữ sang tiếng Việt.');
  }
});

$('btn-settings').addEventListener('click', () => { settingsEl.hidden ? openSettings() : (settingsEl.hidden = true); });
$('btn-devconsole').addEventListener('click', () => { try { window.api.openDevConsole(); } catch {} });
$('closesettings').addEventListener('click', () => { settingsEl.hidden = true; msgEl.focus(); });

// Lưu ý: quản lý Gemini API key / Tavily API key giờ nằm trong Developer Console,
// nên toàn bộ UI + logic lưu/xoá key ở panel Cài đặt chính đã được gỡ bỏ khỏi đây.

$('clearall').addEventListener('click', async () => {
  if (!confirm(L('Xoá toàn bộ lịch sử trò chuyện và trí nhớ dài hạn của nhân vật?', "Clear all chat history and the character's long-term memory?"))) return;
  await window.api.clearAll();
  if (logListEl) logListEl.innerHTML = '';
  logCount = 0;
  if (logStatusEl) logStatusEl.textContent = L('Console đã xoá.', 'Console cleared.');
  showBubble(L('Mình đã quên hết rồi. Chào bạn, mình là LunAV!', "I have forgotten everything. Hi, I'm LunAV!"));
  settingsEl.hidden = true;
});

/* ---------- Gửi tin nhắn ---------- */
// withScreen = true: kèm ảnh chụp màn hình NGAY LÚC GỬI. overrideText: dùng câu này thay vì ô nhập
// (dùng khi bắt đầu theo dõi bằng câu có sẵn trong ô nhập, không xoá ô nhập của người dùng nhầm chỗ).
async function send(withScreen, overrideText) {
  let text = overrideText !== undefined ? overrideText : msgEl.value.trim();
  if (!text) {
    if (!withScreen) return;
    text = L('Nhìn màn hình xem mình đang làm gì đi.', "Look at my screen and see what I'm doing.");
  }
  // Đang theo dõi mà người dùng gõ kiểu "xong rồi", "thôi dừng theo dõi"... -> tự tắt theo dõi trước khi gửi.
  if (watching && overrideText === undefined && STOP_WATCH_RE.test(text)) {
    stopWatching(null);
  }
  // Người dùng chủ động gửi câu mới -> cắt TTS hiện tại ngay, không để LunAV nói chen.
  if (speaking || speechBusy) stopSpeaking();
  if (busy) return;
  if (!hasKey) {
    showBubble(L('Bạn chưa cấu hình Gemini API key. Mở Developer Console (🛠) để thêm key nhé.', 'Gemini API key is not configured. Open Developer Console (🛠) to add it.'), 'err');
    try { window.api.openDevConsole(); } catch {}
    return;
  }
  if (!Net.online) { // đang mất mạng: hỏi nhanh xem đã có lại chưa; chưa thì báo ngay thay vì để tin nhắn chờ treo
    if (Net.checking) return;
    Net.checking = true;
    const back = await pingNow();
    Net.checking = false;
    if (back) goOnline();
    else {
      Emo.set('lo_lang', 2, 8000);
      showBubble(L('Mình đang mất kết nối mạng nên chưa trả lời được. Câu của bạn vẫn còn trong ô nhập, có mạng lại mình sẽ báo nhé.', "I'm offline, so I can't answer yet. Your message is still in the input box; I'll let you know when the connection returns."), 'err');
      return;
    }
  }

  busy = true; sendBtn.disabled = true; seeBtn.disabled = true;
  if (overrideText === undefined) msgEl.value = '';
  logEl.hidden = true; settingsEl.hidden = true;
  showBubble(withScreen ? L('Đang xem màn hình...', 'Looking at the screen...') : L('Đang suy nghĩ...', 'Thinking...'), 'wait');
  Emo.set('suy_nghi', 2, 90000);

  attentionMode = 'FOCUSED';
  const r = await window.api.chat(text, { withScreen: !!withScreen, search: searchOn, attentionMode });

  busy = false; sendBtn.disabled = false; seeBtn.disabled = false;
  if (r.ok) {
    addLog('user', text + (withScreen ? ' [kèm ảnh màn hình]' : ''));
    addLog('model', r.reply || '(không có nội dung trả về)');
    logChatDebug(r);
    logSearchDebug(r.search);
    const srcs = r.search && Array.isArray(r.search.sources) ? r.search.sources.slice(0, 3) : [];
    if (r.silent || !String(r.reply || '').trim()) showMurmur();
    else showBubble(r.reply + (srcs.length ? '\n\n🔎 ' + srcs.join(', ') : '')); // luôn hiện bong bóng bằng tiếng Việt (kèm nguồn nếu có tìm web)
    handleSearchInfo(r.search);
    handleDiscordInfo(r.discord);
    handleMusicInfo(r.music);
    if (!Net.online) { Net.online = true; netBadge(); stopNetWatch(); } // gửi được nghĩa là mạng đã có lại
    reactToReply(r);     // đổi nét mặt theo cảm xúc + đọc thành tiếng (giọng Anh nếu có, không thì giọng Việt)
  } else {
    if (overrideText === undefined) msgEl.value = text; // trả lại câu vừa gõ để bấm gửi lại
    Emo.clear();
    logChatDebug(r);
    showBubble(r.error, 'err');
    if (r.code === 'NETWORK') markOffline(true); // mất mạng: hiện chấm đỏ, tự báo khi có lại
  }
  msgEl.focus();
}
sendBtn.addEventListener('click', () => send(false));
msgEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) send(false); });

/* ---------- Chủ động quan sát khi người dùng còn ở máy nhưng im lặng ---------- */
// Chấm báo hiệu đang quan sát nền (người dùng phải biết app đang nhìn màn hình).
function setObserverIndicator(on) {
  try {
    if (!document.getElementById('observer-indicator-style')) {
      const st = document.createElement('style');
      st.id = 'observer-indicator-style';
      st.textContent = '#seescreen.observing{box-shadow:0 0 0 2px rgba(120,200,255,.85);animation:obsPulse 2.4s ease-in-out infinite}@keyframes obsPulse{50%{box-shadow:0 0 0 4px rgba(120,200,255,.25)}}';
      document.head.appendChild(st);
    }
    if (typeof seeBtn === 'undefined' || !seeBtn) return;
    if (on && !watching) {
      seeBtn.classList.add('observing');
      seeBtn.title = L('Đang tự quan sát màn hình nền (Curious Observer) - tắt trong Developer Console', 'Observing the screen in background (Curious Observer) - turn off in Developer Console');
    } else {
      seeBtn.classList.remove('observing');
      if (!watching) seeBtn.title = watchOffTitle();
    }
  } catch {}
}

function stopProactiveWatching() {
  setObserverIndicator(false);
  proactiveWatching = false;
  if (proactiveTimer) { clearTimeout(proactiveTimer); proactiveTimer = null; }
  if (proactiveReturnTimer) { clearTimeout(proactiveReturnTimer); proactiveReturnTimer = null; }
  if (proactiveState === 'WATCHING' || proactiveState === 'QUIET') proactiveState = 'ACTIVE';
}

function randomProactiveCooldown() {
  const lo = Math.min(proactiveCooldownMinMs, proactiveCooldownMaxMs);
  const hi = Math.max(proactiveCooldownMinMs, proactiveCooldownMaxMs);
  return lo + Math.random() * (hi - lo);
}

function scheduleProactiveTick() {
  if (!proactiveWatching || watching) return;
  if (proactiveTimer) clearTimeout(proactiveTimer);
  // Giãn nhịp: càng nhiều lần gọi mà im lặng liên tiếp thì càng thưa (x1 -> tối đa x5), nói được 1 câu thì về x1.
  const mult = Math.min(5, 1 + Math.floor(proactiveSilentStreak / 2));
  proactiveTimer = setTimeout(proactiveWatchTick, Math.max(40000, proactiveIntervalMs) * mult);
}

async function startProactiveWatching() {
  if (!proactiveEnabled || proactiveWatching || watching) return;
  proactiveWatching = true;
  proactiveState = 'WATCHING';
  proactiveSilentStreak = 0;
  setObserverIndicator(true);
  // Vừa bước qua mốc 5 phút im lặng -> chụp ngay tấm đầu tiên.
  await proactiveWatchTick();
}

async function proactiveWatchTick() {
  if (!proactiveWatching || watching) return;
  if (proactiveTimer) { clearTimeout(proactiveTimer); proactiveTimer = null; }
  if (!Net.online || busy) {
    scheduleProactiveTick();
    return;
  }

  const cooldown = Date.now() < proactiveNextSpeakAt;
  const r = await window.api.chat(
    '(tự động quan sát màn hình vì người dùng đã im lặng một lúc, chỉ lên tiếng nếu thật sự thấy vấn đề có thể giúp)',
    { withScreen: true, watchTick: true, auto: autoObserverOn(), proactiveCooldown: cooldown, attentionMode }
  );

  if (!proactiveWatching || watching) return;
  if (r.ok && !r.silent && r.reply) {
    // Bình thường cách nhau 5-7 phút; prompt ở main.js cho phép phá khoảng nghỉ nếu vấn đề thực sự cần can thiệp.
    proactiveNextSpeakAt = Date.now() + randomProactiveCooldown();
    proactiveSilentStreak = 0;
    addLog('model', r.reply);
    logChatDebug(r);
    showBubble(r.reply);
    reactToReply(r);
  } else if (r && r.ok && r.skipped) {
    const why = r.debug && r.debug.reason;
    const label = why === 'hourlyCap' ? 'WATCH • chạm trần số lần gọi/giờ → tạm nghỉ, không gọi Gemini '
      : why === 'visionCooldown' ? 'WATCH • vừa kiểm tra Vision chưa lâu → bỏ qua lượt này, không gọi Gemini '
      : why === 'screenChangeTooSmall' ? 'WATCH • màn hình chỉ thay đổi rất nhỏ → bỏ qua Vision API '
      : why === 'autoObserverOff' ? 'WATCH • Curious Observer đang tắt trong cài đặt → không gọi Gemini '
      : (r.debug && r.debug.screenUnavailable ? 'WATCH • không chụp được màn hình (quyền Screen tắt hoặc lỗi) → không gọi Gemini ' : 'WATCH • ảnh gần như không đổi → không gọi Gemini ');
    sendDevLog('system', label + formatLogDetail(r.debug || { watchTick: true, screenUnchanged: true }));
  } else if (r && r.ok && r.silent) {
    proactiveSilentStreak++;
    // Không spam log nội dung AI; chỉ ghi một marker kỹ thuật để debug khi cần.
    sendDevLog('system', 'WATCH • Gemini kiểm tra xong và chọn im lặng ' + formatLogDetail(r.debug || { watchTick: true }));
  } else if (r && !r.ok) {
    logChatDebug(r);
  }
  scheduleProactiveTick();
}

function handleProactivePresence(phase) {
  if (!proactiveEnabled) return;
  // Người dùng chủ động bật chế độ 👁 thủ công thì không chạy thêm observer tự động.
  if (watching) {
    if (proactiveWatching) stopProactiveWatching();
    return;
  }

  if (phase === 'QUIET') { proactiveState = 'QUIET'; attentionMode = 'CURIOUS'; }
  else if (phase === 'AWAY') { proactiveState = 'AWAY'; attentionMode = 'IDLE'; }
  else if (proactiveState === 'AWAY') {
    proactiveState = 'RETURNED';
    attentionMode = 'FOCUSED';
    const now = Date.now();
    if (now - idleReturnHandledAt > 10 * 60 * 1000) {
      idleReturnHandledAt = now;
      showBubble(L('Ồ, bạn quay lại rồi ✨', 'Oh, you are back ✨'));
      if (window.api && window.api.sendDevLog) sendDevLog('system', 'ATTENTION • người dùng quay lại sau idle');
    }
    if (proactiveReturnTimer) clearTimeout(proactiveReturnTimer);
    proactiveReturnTimer = setTimeout(() => {
      proactiveReturnTimer = null;
      if (proactiveState === 'RETURNED') { proactiveState = 'ACTIVE'; attentionMode = 'PASSIVE'; }
    }, 1800);
  } else {
    proactiveState = 'ACTIVE';
    attentionMode = attentionMode === 'FOCUSED' ? 'FOCUSED' : 'PASSIVE';
  }

  const screenOk = runtimeSettings.toolPermissions?.screenWatch !== false;
  // AWAY (đã đi vắng): dừng hẳn, không chụp/không gọi API. Quay lại thì các nhánh dưới tự bật lại.
  if (phase === 'AWAY') {
    if (proactiveWatching) stopProactiveWatching();
    return;
  }
  // Người dùng đã quay lại (ACTIVE) mà Curious Observer đang tắt: ngừng nhìn từ chế độ im lặng lâu.
  if (phase === 'ACTIVE' && proactiveWatching && !autoObserverOn()) { stopProactiveWatching(); return; }
  if (!screenOk || proactiveWatching) return;
  // Curious Observer bật: quan sát nền khi ACTIVE/QUIET. Tắt: chỉ nhìn khi người dùng đã im lặng một lúc (QUIET).
  if (autoObserverOn() || phase === 'QUIET') startProactiveWatching();
}

function startAutoCuriousObserver() {
  if (autoCuriousStarted || !autoObserverOn()) return;
  autoCuriousStarted = true;
  // Chờ app ổn định rồi mới chụp frame đầu tiên, tránh tốn một request ngay lúc khởi động.
  setTimeout(() => {
    if (!autoCuriousStarted || watching || !autoObserverOn() || proactiveState === 'AWAY') return;
    sendDevLog('system', 'CURIOUS OBSERVER • tự động quan sát màn hình đã bật');
    startProactiveWatching();
  }, 12000);
}

/* ---------- Bật/tắt theo dõi màn hình nhẹ ---------- */
// Bấm 👁: bắt đầu theo dõi (chụp ngay + lặp lại mỗi theoDoiKhoangCachGiay giây, mặc định 20s, tính từ lúc chụp lần trước). Bấm lại (hoặc gõ "xong rồi", "thôi dừng
// theo dõi"...) để tắt. Trong lúc theo dõi, bot chỉ lên tiếng khi thật sự có gì đáng nói (xem main.js).
seeBtn.addEventListener('click', () => {
  if (watching) stopWatching('Mình dừng theo dõi màn hình nhé.');
  else startWatching();
});

function watchOffTitle() {
  return L('Chụp màn hình rồi hỏi - bấm để bật theo dõi nhẹ, bấm lại để tắt', 'Capture the screen and ask - click to start watching, click again to stop');
}

async function startWatching() {
  if (runtimeSettings.toolPermissions?.screenWatch === false) { showBubble(L('Quyền theo dõi màn hình đang tắt trong Developer Console.', 'Screen Watching is disabled in Developer Console.'), 'err'); return; }
  if (watching || busy) return;
  setQuickToolsExpanded(true);
  if (proactiveWatching) stopProactiveWatching();
  const text = msgEl.value.trim() || 'Theo dõi màn hình giúp mình nhé, có gì đáng chú ý thì nói cho mình biết.';
  watching = true;
  watchStopAt = Date.now() + watchMaxMs;
  seeBtn.classList.add('watching');
  seeBtn.title = L('Đang theo dõi màn hình nhẹ - bấm để tắt', 'Watching the screen - click to stop');
  watchTickStart = Date.now();
  await send(true, text);
  scheduleNextTick();
}

function scheduleNextTick() {
  if (!watching) return;
  if (Date.now() >= watchStopAt) {
    stopWatching('Mình dừng theo dõi màn hình vì đã khá lâu rồi, cần thì bấm 👁 lại nhé.');
    return;
  }
  // Tính từ lúc chụp lần trước: nếu lượt trước mất 8 giây để Gemini trả lời thì chỉ đợi thêm (interval - 8) giây
  const wait = Math.max(1000, watchIntervalMs - (Date.now() - watchTickStart));
  watchTimer = setTimeout(watchTick, wait);
}

async function watchTick() {
  if (!watching) return;
  watchTickStart = Date.now();
  if (busy || !Net.online) { scheduleNextTick(); return; } // đang gửi tay lượt khác hoặc đang mất mạng -> bỏ qua, thử lại lượt sau
  const r = await window.api.chat('(tự động theo dõi màn hình định kỳ, kiểm tra xem có gì cần nói không)', { withScreen: true, watchTick: true });
  if (!watching) return; // người dùng lỡ tắt trong lúc chờ
  if (!r.ok) {
    if (r.code === 'NETWORK') { markOffline(false); scheduleNextTick(); return; } // mất mạng: tạm dừng, có mạng lại thì tự tiếp tục
    stopWatching('Mình gặp lỗi khi theo dõi màn hình nên đã dừng lại: ' + r.error);
    return;
  }
  if (!r.silent) {
    addLog('model', r.reply);
    showBubble(r.reply);
    reactToReply(r);
  }
  scheduleNextTick();
}

function stopWatching(msg) {
  if (!watching) return;
  watching = false;
  if (watchTimer) { clearTimeout(watchTimer); watchTimer = null; }
  seeBtn.classList.remove('watching');
  seeBtn.title = watchOffTitle();
  if (msg) showBubble(msg);
}

/* ---------- Biểu cảm: phản ứng theo cảm xúc của AI ---------- */
// Màn hình LUÔN hiện tiếng Việt (showBubble đã hiện r.reply trước khi gọi hàm này), nhưng ÂM THANH
// chỉ đọc tiếng Anh (r.speechEn). Nếu vì lý do gì đó model không trả về được speech_en (lỗi định dạng
// JSON hiếm gặp), thì im lặng luôn cho lượt đó thay vì rơi về đọc tiếng Việt.
// Tuỳ chọn giọng theo cảm xúc (cộng vào cài đặt giọng đã lưu) - áp dụng cho Edge TTS.
// emotion/intensity vẫn được gửi kèm phòng khi Edge lỗi và main.js rớt xuống Gemini TTS (lồng cảm xúc qua "style").
function buildSpeechOpts(emotion, intensity) {
  const it = intensity || 2;
  const o = { lang: 'en', emotion: emotion || undefined, intensity: it };
  const p = emotion ? Emo.prosody(emotion, it) : null;
  if (p) {
    const hz = Math.max(-60, Math.min(120, Math.round(basePitchHz + p.pitchHz)));
    const rate = Math.max(-40, Math.min(40, Math.round(p.ratePct)));
    o.edgePitch = pitchStr(hz);
    o.edgeRate = (rate >= 0 ? '+' : '') + rate + '%';
  }
  return o;
}

function reactToReply(r) {
  const emotionAllowed = runtimeSettings.toolPermissions?.emotion !== false;
  if (emotionAllowed && r.mood) Emo.setMood(r.mood);
  if (emotionAllowed && r.emotion) Emo.set(r.emotion, r.intensity || 2);
  else if (emotionAllowed) Emo.clear();

  // Đã phát giọng theo từng câu cho lượt này thì không nói lại.
  const cses = streamChunkSession; streamChunkSession = null;
  if (cses && performance.now() - cses.at < 120000) {
    streamSpeechPlaying = false;
    if (cses.token !== playToken || cses.finished) { streamSpeechText = null; streamSpeechPlayedText = null; return; } // bị ngắt chủ ý, hoặc đã nhận đủ câu
    // stream đứt giữa chừng, chưa đủ câu: rơi xuống dưới để nói lại cả đoạn
  }
  if (r.speechEn && r.speechEn === streamSpeechPlayedText) {
    streamSpeechText = null;
    streamSpeechPlayedText = null;
    return;
  }
  streamSpeechText = null;
  streamSpeechPlayedText = null;
  if (r.speechEn) {
    speak(r.speechEn, buildSpeechOpts(r.emotion, r.intensity));
  } else {
    sendDevLog('tts', 'Không có bản dịch tiếng Anh (speech_en) cho lượt này nên bỏ qua đọc thành tiếng (chỉ hiện bong bóng).');
  }
}


/* ---------- Thông báo nhỏ tự tắt ---------- */
let toastTimer = null;
function showToast(text, ms) {
  const el = $('toast');
  clearTimeout(toastTimer);
  el.textContent = text;
  el.hidden = false;
  if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
if (window.api.onSingleInstanceNotice) {
  window.api.onSingleInstanceNotice((text) => showToast(text, 6500));
}

/* ---------- Kết nối mạng: nhận biết mất mạng / có mạng lại ---------- */
// LunAV cần mạng để "suy nghĩ" (Gemini chạy trên máy chủ Google). Khi mất mạng: hiện chấm đỏ, cô ấy tỏ ra lo lắng,
// tin nhắn không bị gửi treo; khi có lại: tự báo và nhắc câu còn nằm trong ô nhập.
const Net = { online: true, checking: false, timer: null, streak: 0, pollMs: 4000 };
async function pingNow() {
  try { const r = await window.api.ping(); return !!(r && r.online); } catch { return false; }
}
function netBadge() { $('netstatus').hidden = Net.online; }
function stopNetWatch() { if (Net.timer) { clearInterval(Net.timer); Net.timer = null; } Net.streak = 0; }
function startNetWatch() {
  stopNetWatch();
  Net.timer = setInterval(async () => {          // cứ vài giây kiểm tra lại; 2 lần liên tiếp thông mới báo "có mạng lại"
    if (Net.online) { stopNetWatch(); return; }
    if (await pingNow()) { if (++Net.streak >= 2) goOnline(); } else Net.streak = 0;
  }, Net.pollMs);
}
function markOffline(quiet) {                    // quiet = true: giữ nguyên bong bóng hiện tại (ví dụ đang hiện lỗi mạng)
  if (!Net.online) return;
  Net.online = false; netBadge();
  Emo.set('lo_lang', 2, 9000);
  if (!quiet) showBubble('Ơ, mình mất kết nối mạng rồi. Có mạng lại mình sẽ báo bạn nhé.', 'wait');
  startNetWatch();
}
function goOnline() {
  if (Net.online) return;
  Net.online = true; netBadge(); stopNetWatch();
  Emo.set('vui', 2, 8000);
  const pending = msgEl.value.trim();
  showBubble(L('Có mạng lại rồi! ', 'Back online! ') + (pending ? L('Câu vừa rồi của bạn vẫn còn trong ô nhập, bấm gửi để mình trả lời nhé.', "Your previous message is still in the input box; press Send and I'll answer.") : L('Mình trò chuyện tiếp được rồi.', 'We can keep chatting now.')));
}
window.addEventListener('offline', () => markOffline(false));
window.addEventListener('online', async () => { if (!Net.online && await pingNow()) goOnline(); });

/* ---------- Tìm kiếm web (nút 🌐) ---------- */
let searchOn = true, searchAvailable = true, searchBlocked = false;
try { searchOn = localStorage.getItem('search') !== '0'; } catch {}
function refreshSearchButton() {
  const b = $('btn-search');
  b.hidden = !searchAvailable;
  b.className = searchOn && !searchBlocked ? '' : 'off';
  b.title = searchBlocked ? 'Tìm web chưa dùng được với key hiện tại'
    : searchOn ? 'Tìm kiếm web: ĐANG BẬT (bấm để tắt)' : 'Tìm kiếm web: đang tắt (bấm để bật)';
}
$('btn-search').addEventListener('click', () => {
  searchOn = !searchOn;
  try { localStorage.setItem('search', searchOn ? '1' : '0'); } catch {}
  refreshSearchButton();
  showToast(searchOn ? L('Đã bật tìm kiếm web.', 'Web search enabled.') : L('Đã tắt tìm kiếm web.', 'Web search disabled.'), 2500);
});
function handleSearchInfo(s) {
  if (!s) return;
  if (typeof s.blocked === 'boolean') { searchBlocked = s.blocked; refreshSearchButton(); }
  if (s.note) showToast(s.note, 10000);
}

/* ---------- Thông báo trạng thái voice Discord ---------- */
// main.js / discord-bot.js đẩy sự kiện 'discord-event' mỗi khi có gì đó về voice:
//   joining (đang vào) -> joined (vào được) hoặc failed (KHÔNG vào được, kèm lý do và cách sửa);
//   lost (đang ở trong voice thì bị mất kết nối), warn (vào được nhưng có vấn đề), left (đã rời).
// Lỗi (failed/lost) hiện thành một khung đỏ nằm lại đến khi bấm Đóng (hoặc tự tắt sau ~45 giây), có nút "Thử lại":
// sửa xong cai-dat.json / vào lại kênh voice rồi bấm Thử lại, không cần mở lại app.
let voiceAlertTimer = null;
function hideVoiceAlert() {
  clearTimeout(voiceAlertTimer);
  $('voicealert').hidden = true;
}
function showVoiceAlert(text) {
  clearTimeout(voiceAlertTimer);
  $('toast').hidden = true;
  $('voicealerttext').textContent = text;
  $('voicealert').hidden = false;
  voiceAlertTimer = setTimeout(hideVoiceAlert, 45000);
}
$('voicealertclose').addEventListener('click', hideVoiceAlert);
$('voicealertretry').addEventListener('click', async () => {
  hideVoiceAlert();
  showToast('⏳ Đang thử vào lại voice Discord...', 40000);
  try { await window.api.discordJoin(); } catch {} // kết quả sẽ được báo lại bằng sự kiện discord-event
});

function handleDiscordEvent(ev) {
  if (!ev) return;
  switch (ev.type) {
    case 'joining':
      hideVoiceAlert();
      showToast('⏳ Đang vào kênh voice Discord...', 40000);
      break;
    case 'joined':
      hideVoiceAlert();
      showToast(`🔊 Đã vào kênh voice "${ev.channelName}"`, 6000);
      break;
    case 'failed':
      showVoiceAlert('⚠️ Không vào được voice Discord\n' + ev.message);
      try { Emo.set('lo_lang', 2, 8000); } catch {}
      break;
    case 'lost':
      showVoiceAlert('⚠️ ' + ev.message);
      try { Emo.set('lo_lang', 2, 8000); } catch {}
      break;
    case 'warn':
      showToast('⚠️ ' + ev.message, 12000);
      break;
    case 'left':
      hideVoiceAlert();
      showToast('🔈 Đã rời voice.', 5000);
      break;
    case 'info':
      showToast(ev.message, 6000);
      break;
  }
}
if (window.api.onDiscordEvent) window.api.onDiscordEvent(handleDiscordEvent);

// Key/credential (Gemini, Tavily, Discord...) vừa được lưu/xoá từ Developer Console -> cập nhật ngay tại đây,
// không cần khởi động lại app. Quan trọng nhất là hasKey: đang chặn gửi tin nhắn (xem hàm send()) nếu false.
if (window.api.onCredentialsUpdated) {
  window.api.onCredentialsUpdated((info) => {
    const wasBlocked = !hasKey;
    if (info && typeof info.hasKey === 'boolean') hasKey = info.hasKey;
    if (wasBlocked && hasKey) showBubble(L('Đã nhận Gemini API key mới rồi! Giờ mình chat được rồi nè, nhắn gì đó đi.', 'Gemini API key received! I can chat now. Say something to me.'));
  });
}

// Kết quả vào/ra voice giờ được báo qua handleDiscordEvent (chạy nền), nên ở đây không cần làm gì thêm.
function handleDiscordInfo() {}

/* ---------- Phát nhạc cục bộ qua loa máy (không cần vào voice Discord) ---------- */
// Dùng thẻ <audio> RIÊNG với audio TTS (currentAudioEl) để nhạc không bị hàm stopSpeaking() cắt ngang mỗi
// khi LunAV nói câu tiếp theo. src trỏ qua scheme 'lunav-media://' do main.js phục vụ (xem protocol.handle).
let musicAudioEl = null;
function stopLocalMusic(announce) {
  if (musicAudioEl) {
    try { musicAudioEl.pause(); musicAudioEl.src = ''; } catch {}
    musicAudioEl = null;
    if (announce) showToast(L('🔇 Đã dừng nhạc.', '🔇 Music stopped.'), 3000);
  }
}
function playLocalMusic(url, ten) {
  stopLocalMusic(false);
  const audio = new Audio(url);
  audio.volume = 0.6;
  audio.onended = () => { if (musicAudioEl === audio) musicAudioEl = null; };
  audio.onerror = () => {
    if (musicAudioEl === audio) musicAudioEl = null;
    showToast('⚠️ Phát nhạc bị lỗi giữa chừng, thử lại nhé.', 6000);
  };
  musicAudioEl = audio;
  audio.play().catch(() => showToast(L('⚠️ Không phát được nhạc.', '⚠️ Could not play the music.'), 6000));
  showToast('🎵 ' + L('Đang phát: ', 'Playing: ') + (ten || L('nhạc', 'music')), 6000);
}
function handleMusicInfo(m) {
  if (!m) return;
  if (m.dung) stopLocalMusic(true);
  else if (m.pending) showToast('🎵 ' + L('Đang tìm "', 'Searching for "') + m.baiHat + '"...', 8000);
}
// main.js tìm/tải xong (hoặc lỗi) bài nhạc vừa nhờ -> báo qua đây để thật sự phát (xem playMusicLocalInBackground).
if (window.api.onMusicLocalEvent) {
  window.api.onMusicLocalEvent((info) => {
    if (!info) return;
    if (info.ok) playLocalMusic(info.url, info.ten);
    else showToast('⚠️ ' + (info.error || L('Không tìm được bài hát.', 'Could not find the song.')), 8000);
  });
}

/* ---------- Phóng to / thu nhỏ nhân vật (không đổi kích thước cửa sổ) ---------- */
const View = {
  model: null,
  modelUpdateHandler: null, w0: 0, h0: 0, W: 0, H: 0, avail: 0,
  t: 0, pan: 0,          // đích: t = mức phóng (0 = toàn thân ... 1 = cận nhất), pan = 0 nhìn từ đầu ... 1 nhìn xuống chân
  tCur: 0, panCur: 0,    // giá trị đang hiển thị (chuyển mượt tới đích)
  targetFocusX: 0, targetFocusY: 0, lastFocusFrameAt: 0,
  focusX: 0, focusY: 0,
  fMin: 0.22,            // ở mức phóng cao nhất chỉ còn thấy 22% chiều cao model (từ đầu xuống)
  presets: { nuaNguoi: 0.52, canMat: 0.3 },
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const viewFull = () => Math.min(View.W / View.w0, View.avail / View.h0);       // vừa khít toàn thân
function viewScale(t) {
  const f = Math.pow(View.fMin, t);                                            // phần chiều cao model vừa khít khung nhìn
  return viewFull() * Math.max(1, (View.avail / (f * View.h0)) / viewFull());
}
const tFromFrac = (f) => clamp01(Math.log(f) / Math.log(View.fMin));
function layoutView(t, pan) {
  if (!View.model) return;
  const s = viewScale(t), Hs = View.h0 * s;
  View.model.scale.set(s);
  View.model.x = (View.W - View.w0 * s) / 2;
  View.model.y = Hs <= View.avail ? View.avail - Hs : -pan * (Hs - View.avail); // toàn thân: sát đáy; phóng to: neo theo đầu
}
function viewStep() { // gọi mỗi khung hình: trượt mượt tới mức phóng đích
  const dt = View.t - View.tCur, dp = View.pan - View.panCur;
  if (Math.abs(dt) < 0.0005 && Math.abs(dp) < 0.0005) {
    if (View.tCur !== View.t || View.panCur !== View.pan) {
      View.tCur = View.t;
      View.panCur = View.pan;
      layoutView(View.tCur, View.panCur);
    }
  } else {
    View.tCur += dt * 0.2;
    View.panCur += dp * 0.2;
    layoutView(View.tCur, View.panCur);
  }

  if (View.model && View.model.internalModel && View.model.internalModel.focusController) {
    const fc = View.model.internalModel.focusController;
    const nowFocus = performance.now();
    const dtFocus = Math.min(0.05, Math.max(0.001, (nowFocus - (View.lastFocusFrameAt || nowFocus)) / 1000));
    View.lastFocusFrameAt = nowFocus;
    const alpha = 1 - Math.exp(-dtFocus / 0.105);
    View.focusX += (View.targetFocusX - View.focusX) * alpha;
    View.focusY += (View.targetFocusY - View.focusY) * alpha;
    fc.focus(View.focusX, View.focusY);
  }
}
function syncViewUI() { $('zoomrange').value = Math.round(View.t * 100); $('panrange').value = Math.round(View.pan * 100); }
let viewSaveTimer = null;
function persistView() {
  syncViewUI();
  clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(() => { try { localStorage.setItem('view', JSON.stringify({ t: View.t, pan: View.pan })); } catch {} }, 300);
}
function goPreset(name) {
  View.t = name === 'full' ? 0 : tFromFrac(name === 'bust' ? View.presets.nuaNguoi : View.presets.canMat);
  View.pan = 0;
  persistView();
}
function cycleView() { // nút 🔍: Toàn thân -> Nửa người -> Cận mặt -> Toàn thân
  const tb = tFromFrac(View.presets.nuaNguoi), tc = tFromFrac(View.presets.canMat);
  if (View.t < tb - 0.08) goPreset('bust');
  else if (View.t < tc - 0.08) goPreset('close');
  else goPreset('full');
}

$('btn-zoom').addEventListener('click', cycleView);
$('view-full').addEventListener('click', () => goPreset('full'));
$('view-bust').addEventListener('click', () => goPreset('bust'));
$('view-close').addEventListener('click', () => goPreset('close'));
$('zoomrange').addEventListener('input', (e) => { View.t = clamp01(Number(e.target.value) / 100); persistView(); });
$('panrange').addEventListener('input', (e) => { View.pan = clamp01(Number(e.target.value) / 100); persistView(); });
window.addEventListener('wheel', (e) => {
  if (e.target && e.target.closest && e.target.closest('.panel, #bubble')) return; // đang cuộn nội dung bảng/bong bóng thì thôi
  e.preventDefault();
  if (e.shiftKey) View.pan = clamp01(View.pan + e.deltaY * 0.001);                 // Shift + cuộn: trượt lên/xuống thân
  else View.t = clamp01(View.t - e.deltaY * 0.0009);                              // cuộn lên: phóng to, cuộn xuống: thu nhỏ
  persistView();
}, { passive: false });

async function loadLive2DModel(modelId, modelPath) {
  if (live2dLoading) return false;
  const target = live2dModels.find((m) => m.id === modelId);
  if (!target && !modelPath) return false;
  const pathToLoad = modelPath || target.path;
  live2dLoading = true;
  if (modelStatusEl) { modelStatusEl.textContent = appLanguage === 'en' ? 'Loading model…' : 'Đang tải model…'; modelStatusEl.className = ''; }

  try {
    const { Live2DModel } = PIXI.live2d;
    // Tải model mới trước; nếu tải lỗi thì model cũ vẫn còn nguyên.
    const model = await Live2DModel.from(pathToLoad);
    if (!pixiApp) throw new Error('PIXI chưa khởi tạo');

    const old = View.model;
    const oldHandler = View.modelUpdateHandler;

    // Dừng listener của model cũ trước khi destroy để không giữ closure/reference.
    if (old && oldHandler) {
      try { old.internalModel.off('beforeModelUpdate', oldHandler); } catch {}
    }

    if (old && old.parent) {
      try { old.parent.removeChild(old); } catch {}
    }

    if (old) {
      try {
        // Mỗi model có texture riêng; giải phóng texture + baseTexture khi đổi model
        // để RAM/GPU không tích lũy sau nhiều lần đổi model.
        old.destroy({ children: true, texture: true, baseTexture: true });
      } catch {
        try { old.destroy(); } catch {}
      }
    }

    pixiApp.stage.addChild(model);
    currentLive2DModelId = target ? target.id : modelId;

    emoInfo = Emo.attach(model);
    try { Emo.setModel(currentLive2DModelId); } catch {}

    const modelUpdateHandler = () => {
      const v = speaking ? Math.min(1, Math.max(0, updateMouthLevel() * 1.35)) : 0;
      if (!Emo.setParam('ParamMouthOpenY', v)) {
        try { model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', v); } catch {}
      }
      Emo.apply(speaking || speechBusy);
    };
    View.modelUpdateHandler = modelUpdateHandler;
    model.internalModel.on('beforeModelUpdate', modelUpdateHandler);

    Object.assign(View, { model, w0: model.width, h0: model.height });
    layoutView(View.tCur, View.panCur);

    // Chạy GC texture sau khi model cũ đã bị hủy. Đây chỉ là cleanup lúc đổi model,
    // không chạy liên tục trong render loop.
    try {
      if (pixiApp.renderer && pixiApp.renderer.textureGC) {
        pixiApp.renderer.textureGC.run();
      }
    } catch {}

    if (modelStatusEl) {
      const missing = emoInfo && emoInfo.missing && emoInfo.missing.length
        ? ` • thiếu ${emoInfo.missing.length} tham số biểu cảm`
        : '';
      modelStatusEl.textContent = appLanguage === 'en' ? `✓ Using ${currentLive2DModelId}${missing}` : `✓ Đang dùng ${currentLive2DModelId}${missing}`;
      modelStatusEl.className = 'ok';
    }
    return true;
  } catch (e) {
    console.error('[MODEL] Không tải được model:', e);
    if (modelStatusEl) {
      modelStatusEl.textContent = (appLanguage === 'en' ? 'Could not load model: ' : 'Không tải được model: ') + (e.message || e);
      modelStatusEl.className = 'err';
    }
    return false;
  } finally {
    live2dLoading = false;
  }
}

if (modelSelectEl) {
  modelSelectEl.addEventListener('change', async () => {
    const id = modelSelectEl.value;
    const r = await window.api.setLive2DModel(id);
    if (!r.ok) {
      if (modelStatusEl) { modelStatusEl.textContent = r.error || (appLanguage === 'en' ? 'Could not save model.' : 'Không lưu được model.'); modelStatusEl.className = 'err'; }
      return;
    }
    const m = live2dModels.find((x) => x.id === id);
    await loadLive2DModel(id, m && m.path);
  });
}

/* ---------- Vẫy tay chào lúc mở app ----------
   wave.motion3.json không được đăng ký trong akuro.model3.json (không có mục "Motions"),
   nên không gọi thẳng model.motion() được. Ở đây tự dựng lại đúng biên độ lắc tay
   (syHand1L2/2L2/3L2, ±24.487/±18.281/±30) và tư thế giơ tay (HandNormalButton/HandButton4)
   lấy từ 2 file wave.motion3.json + wave-expression.exp3.json gốc, chạy trong ~3.2 giây.
   Đã đối chiếu akuro_cdi3.json + akuro_physics3.json: syHand1L2/2L2/3L2 là nhóm tham số RIÊNG
   (ParamGroup, dùng cho vẫy tay), khác với syHand1L/2L/3L (ParamGroup32) mà physics3.json thật sự
   điều khiển theo chuyển động cơ thể -> không trùng, không "đánh nhau" như lo ngại trước đây.
*/
function playWaveOnce() {
  if (!View.model) return;
  const t0 = performance.now();
  const DUR_MS = 3200;
  const FREQ_HZ = 2.3;
  function tick(now) {
    if (!View.model) return;
    const el = now - t0;
    if (el >= DUR_MS) {
      Emo.setParam('HandNormalButton', 1);
      Emo.setParam('HandButton4', 0);
      Emo.setParam('syHand1L2', 0);
      Emo.setParam('syHand2L2', 0);
      Emo.setParam('syHand3L2', 0);
      return;
    }
    const t = el / 1000;
    const fadeIn = Math.min(1, t / 0.15);
    const fadeOut = Math.min(1, (DUR_MS / 1000 - t) / 0.3);
    const env = Math.min(fadeIn, fadeOut);
    const s = Math.sin(t * FREQ_HZ * Math.PI * 2) * env;
    // HandNormalButton/HandButton4 chuyển mượt theo cùng bao hình (env) với biên độ lắc tay,
    // để tay hạ xuống êm lúc kết thúc thay vì giữ nguyên tư thế giơ tay rồi giật về ở khung cuối.
    Emo.setParam('HandNormalButton', 1 - env);
    Emo.setParam('HandButton4', env);
    Emo.setParam('syHand1L2', s * 24.487);
    Emo.setParam('syHand2L2', s * 18.281);
    Emo.setParam('syHand3L2', s * 30);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------- Chạm/vuốt lên model (tóc = vui dần -> bối rối, vùng nhạy cảm = khó chịu -> giận) ----------
   Model Akuro không có HitAreas sẵn trong .model3.json, nên tự tính vùng theo tỉ lệ (0..1) trên khung
   hình thật của model (model.getBounds()), độc lập với zoom/pan hiện tại của View. Số liệu vùng lấy từ
   cai-dat.json (vungChamModel), có thể chỉnh lại không cần sửa file này. */
const canvasEl = $('canvas');
let touchZones = {
  dau: [{ x1: 0.32, y1: 0.0, x2: 0.68, y2: 0.16 }], // đỉnh đầu, ưu tiên trước vùng tóc hai bên bên dưới
  toc: [
    { x1: 0.0, y1: 0.0, x2: 1.0, y2: 0.32 },
    { x1: 0.0, y1: 0.0, x2: 0.22, y2: 0.75 },
    { x1: 0.78, y1: 0.0, x2: 1.0, y2: 0.75 },
  ],
  co: [{ x1: 0.28, y1: 0.32, x2: 0.72, y2: 0.45 }], // cổ + phần ngực trên (trên vùng nhạy cảm), phản ứng ngại
  nhayCam: [{ x1: 0.28, y1: 0.45, x2: 0.72, y2: 0.78 }], // ngực + váy + đùi trên đầu gối
  chan: [{ x1: 0.15, y1: 0.78, x2: 0.85, y2: 1.0 }], // từ đầu gối trở xuống
  soLanVuotDeBoiRoi: 5,
  giayResetDem: 4,
};
let touchDragging = false;
let lastTouchZone = null;
let headPatCount = 0;
let hairStrokeCount = 0;
let sensitiveTouchCount = 0;
let touchZoneResetTimer = null;
let lastDebugLogAt = 0;
let coordinateDebugEnabled = true;
let smallPupilsUsedSession = false; // chỉ dùng biểu cảm small-pupils 1 LẦN DUY NHẤT cho cả phiên mở app, không reset theo giờ chạm mà chỉ reset khi mở lại app

/* ---------- Câu nói phản ứng khi chạm/vuốt (bong bóng + giọng nói, đọc từ bieu-cam.json → cauNoiCham) ---------- */
let touchLines = null; // { toc: {1:[],2:[],3:[]}, nhayCam: {1:[],2:[],3:[]}, chan: [] }, gán lúc nhận get-state
let lastTouchLineText = null;
let lastTouchLineAt = 0;
const TOUCH_LINE_COOLDOWN_MS = 2600; // tránh spam bong bóng/giọng khi kéo chuột qua lại nhanh giữa các vùng

function pickTouchLine(pool) {
  const arr = Array.isArray(pool) ? pool.filter((s) => s && typeof s.vi === 'string' && s.vi.trim()) : [];
  if (!arr.length) return null;
  if (arr.length === 1) return arr[0];
  let pick;
  do { pick = arr[Math.floor(Math.random() * arr.length)]; } while (pick.vi === lastTouchLineText);
  return pick;
}

// Hiện bong bóng (tiếng Việt) + nói câu phản ứng ngắn (LUÔN bằng tiếng Anh, giống câu trả lời chat)
// cho một mức chạm. KHÔNG ghi vào lịch sử trò chuyện (đây là phản ứng vật lý tức thời, không phải
// một lượt hội thoại). Nếu đang bận nói câu khác (trả lời AI, câu chạm trước đó...) thì chỉ hiện
// bong bóng, không tranh giọng.
function sayTouch(pool) {
  const now = Date.now();
  if (now - lastTouchLineAt < TOUCH_LINE_COOLDOWN_MS) return;
  const item = pickTouchLine(pool);
  if (!item) return;
  lastTouchLineText = item.vi;
  lastTouchLineAt = now;
  showBubble(item.vi);
  if (item.en && !speaking && !speechBusy && !muted) {
    speak(item.en, { lang: 'en' }).catch(() => {});
  }
}

function insideAnyRect(rects, nx, ny) {
  if (!Array.isArray(rects)) return false;
  return rects.some((r) => nx >= r.x1 && nx <= r.x2 && ny >= r.y1 && ny <= r.y2);
}

function whichTouchZone(clientX, clientY) {
  if (!View.model || !canvasEl) return null;
  const rect = canvasEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const b = View.model.getBounds(); // khung hình thật trên màn hình, đã tính scale/pan hiện tại
  if (!b || b.width <= 0 || b.height <= 0) return null;
  if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) return null;
  const nx = (x - b.x) / b.width;
  const ny = (y - b.y) / b.height;
  if (insideAnyRect(touchZones.nhayCam, nx, ny)) return 'nhayCam';
  if (insideAnyRect(touchZones.co, nx, ny)) return 'co';
  if (insideAnyRect(touchZones.chan, nx, ny)) return 'chan';
  if (insideAnyRect(touchZones.dau, nx, ny)) return 'dau';
  if (insideAnyRect(touchZones.toc, nx, ny)) return 'toc';
  return null;
}

function scheduleTouchZoneReset() {
  clearTimeout(touchZoneResetTimer);
  const ms = Math.max(1, Number(touchZones.giayResetDem) || 4) * 1000;
  touchZoneResetTimer = setTimeout(() => {
    headPatCount = 0;
    hairStrokeCount = 0;
    sensitiveTouchCount = 0;
  }, ms);
}

function reactHeadPat() {
  headPatCount++;
  scheduleTouchZoneReset();
  const dau = touchLines && touchLines.dau;
  if (headPatCount <= 4) { Emo.set('vui', 2); sayTouch(dau && dau['1']); }
  else if (headPatCount <= 8) { Emo.set('vui', 3); sayTouch(dau && dau['2']); }
  else { Emo.set('hao_hung', 2); sayTouch(dau && dau['3']); }
  sendDevLog('touch', `TOUCH • xoa đầu lần ${headPatCount}`);
}

function reactHairStroke() {
  hairStrokeCount++;
  scheduleTouchZoneReset();
  const toc = touchLines && touchLines.toc;
  if (hairStrokeCount <= 4) { Emo.set('cham_squint', 2); sayTouch(toc && toc['1']); }
  else if (hairStrokeCount <= 8) { Emo.set('cham_shy', 2); sayTouch(toc && toc['2']); }
  else { Emo.set('cham_omouth', 2); sayTouch(toc && toc['3']); }
  sendDevLog('touch', `TOUCH • vuốt tóc lần ${hairStrokeCount}`);
}

function reactSensitiveTouch() {
  sensitiveTouchCount++;
  scheduleTouchZoneReset();
  const nc = touchLines && touchLines.nhayCam;
  if (!smallPupilsUsedSession) {
    smallPupilsUsedSession = true;
    Emo.set('cham_smallpupils', 2, undefined, true);
    sayTouch(nc && nc['1']);
    sendDevLog('touch', 'TOUCH • chạm vùng nhạy cảm lần đầu tiên (small-pupils, chỉ 1 lần/phiên)');
  } else if (sensitiveTouchCount <= 4) {
    Emo.set('buon', 2, undefined, true);
    sayTouch(nc && nc['2']);
    sendDevLog('touch', `TOUCH • chạm vùng nhạy cảm lần ${sensitiveTouchCount} (buồn)`);
  } else if (sensitiveTouchCount <= 7) {
    Emo.set('kho_chiu', 2, undefined, true);
    sayTouch(nc && nc['3']);
    sendDevLog('touch', `TOUCH • chạm vùng nhạy cảm lần ${sensitiveTouchCount} (khó chịu)`);
  } else if (sensitiveTouchCount <= 10) {
    Emo.set('gian', 3, undefined, true);
    sayTouch(nc && nc['4']);
    sendDevLog('touch', `TOUCH • chạm vùng nhạy cảm lần ${sensitiveTouchCount} (tức giận)`);
  } else {
    Emo.set('cham_dark', 3, undefined, true);
    sayTouch(nc && nc['5']);
    sendDevLog('touch', `TOUCH • chạm vùng nhạy cảm lần ${sensitiveTouchCount} (mặt tối - cảnh báo cuối)`);
  }
}

function reactLegTouch() {
  Emo.set('cham_shy', 2, undefined, true);
  sayTouch(touchLines && touchLines.chan);
  sendDevLog('touch', 'TOUCH • chạm vùng chân (shy-face)');
}

function reactNeckTouch() {
  Emo.set('cham_shy', 2, undefined, true);
  sayTouch(touchLines && touchLines.co);
  sendDevLog('touch', 'TOUCH • chạm vùng cổ/ngực trên (shy-face)');
}

window.api.onCoordinateDebugSetting((enabled) => {
  coordinateDebugEnabled = !!enabled;
  if (!coordinateDebugEnabled) lastDebugLogAt = 0;
});
window.api.getDevConsoleSettings().then((r) => {
  coordinateDebugEnabled = !!r?.coordinateTracking;
  if (r?.performanceModes && r?.performanceMode) runtimeSettings.performanceMode = r.performanceMode;
  if (r?.mouseTrackingMode) runtimeSettings.mouseTrackingMode = r.mouseTrackingMode;
  if (r?.toolPermissions) runtimeSettings.toolPermissions = r.toolPermissions;
  if (r?.desktopVoice) runtimeSettings.desktopVoice = r.desktopVoice;
  if (r?.screenWatch) runtimeSettings.screenWatch = r.screenWatch;
  const dv = r?.desktopVoice || {};
  desktopVoice.silenceMs = Number(dv.silenceMs) || 950;
  desktopVoice.maxTurnMs = (Number(dv.maxTurnSec) || 15) * 1000;
  desktopVoice.noiseMultiplier = Number(dv.noiseMultiplier) || 2.5;
  desktopVoice.autoListen = dv.autoListen === true;
  if (r?.screenWatch) {
    if (Number(r.screenWatch.intervalSec) > 0) watchIntervalMs = Number(r.screenWatch.intervalSec) * 1000;
    if (Number(r.screenWatch.maxMin) > 0) watchMaxMs = Number(r.screenWatch.maxMin) * 60000;
    proactiveEnabled = r.screenWatch.proactiveEnabled !== false;
    if (Number(r.screenWatch.proactiveIntervalSec) > 0) proactiveIntervalMs = Number(r.screenWatch.proactiveIntervalSec) * 1000;
  }
}).catch(() => {});

// Rê chuột qua model (KHÔNG cần giữ nút) để xem toạ độ nx/ny hiện tại trong Developer Console —
// dùng để tự canh mép vùng tóc/chân/vùng nhạy cảm cho khớp model thật, không cần đoán qua ảnh chụp màn hình.
canvasEl.addEventListener('pointermove', (e) => {
  if (!coordinateDebugEnabled) return;
  if (!View.model || !canvasEl) return;
  const now = performance.now();
  if (now - lastDebugLogAt < 350) return; // bớt spam log, ~3 lần/giây là đủ đọc
  const rect = canvasEl.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const b = View.model.getBounds();
  if (!b || b.width <= 0 || b.height <= 0) return;
  if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) return;
  lastDebugLogAt = now;
  const nx = (x - b.x) / b.width, ny = (y - b.y) / b.height;
  sendDevLog('touch-debug', `TOẠ ĐỘ • x=${nx.toFixed(3)}  y=${ny.toFixed(3)}`);
});

canvasEl.addEventListener('pointerdown', (e) => {
  touchDragging = true;
  lastTouchZone = null;
  const z = whichTouchZone(e.clientX, e.clientY);
  if (z === 'nhayCam') reactSensitiveTouch();
  else if (z === 'dau') reactHeadPat();
  else if (z === 'toc') reactHairStroke();
  else if (z === 'co') reactNeckTouch();
  else if (z === 'chan') reactLegTouch();
  if (z) lastTouchZone = z;
});

canvasEl.addEventListener('pointermove', (e) => {
  if (!touchDragging) return;
  const z = whichTouchZone(e.clientX, e.clientY);
  if (!z || z === lastTouchZone) return;
  lastTouchZone = z;
  if (z === 'toc') reactHairStroke();
  else if (z === 'dau') reactHeadPat();
  else if (z === 'nhayCam') reactSensitiveTouch();
  else if (z === 'co') reactNeckTouch();
  else if (z === 'chan') reactLegTouch();
});

window.addEventListener('pointerup', () => { touchDragging = false; });
window.addEventListener('pointercancel', () => { touchDragging = false; });

/* ---------- Khởi động ---------- */
(async () => {
  const state = await window.api.getState();
  appLanguage = state.language === 'en' ? 'en' : 'vi';
  applyLanguage(appLanguage);
  hasKey = state.hasKey;
  live2dModels = Array.isArray(state.live2dModels) ? state.live2dModels : [];
  currentLive2DModelId = state.live2dModel || (live2dModels[0] && live2dModels[0].id) || null;
  if (modelSelectEl) {
    modelSelectEl.innerHTML = '';
    live2dModels.forEach((m) => {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.label || m.id;
      modelSelectEl.appendChild(o);
    });
    if (currentLive2DModelId) modelSelectEl.value = currentLive2DModelId;
  }
  hasKey = !!state.geminiConfigured || hasKey;
  sendDevLog('system', 'LunAV khởi động • ' + (state.windowResize ? `window: ${state.windowResize.width}x${state.windowResize.height} • resize: ${state.windowResize.enabled ? 'on' : 'off'}` : 'window: unknown'));
  searchAvailable = state.searchEnabled !== false;
  searchBlocked = !!state.searchBlocked;
  refreshSearchButton();
  if (state.framing) {
    if (Number.isFinite(state.framing.nuaNguoi)) View.presets.nuaNguoi = Math.max(0.15, Math.min(0.95, state.framing.nuaNguoi));
    if (Number.isFinite(state.framing.canMat)) View.presets.canMat = Math.max(0.1, Math.min(0.95, state.framing.canMat));
    if (Number.isFinite(state.framing.gan_nhat)) View.fMin = Math.max(0.1, Math.min(0.6, state.framing.gan_nhat));
  }
  try {
    const sv = JSON.parse(localStorage.getItem('view'));
    if (sv) { View.t = View.tCur = clamp01(Number(sv.t) || 0); View.pan = View.panCur = clamp01(Number(sv.pan) || 0); }
  } catch {}
  syncViewUI();
  if (state.touchZones && (Array.isArray(state.touchZones.toc) || Array.isArray(state.touchZones.nhayCam) || Array.isArray(state.touchZones.chan) || Array.isArray(state.touchZones.dau))) {
    touchZones = {
      dau: Array.isArray(state.touchZones.dau) ? state.touchZones.dau : touchZones.dau,
      toc: Array.isArray(state.touchZones.toc) ? state.touchZones.toc : touchZones.toc,
      nhayCam: Array.isArray(state.touchZones.nhayCam) ? state.touchZones.nhayCam : touchZones.nhayCam,
      co: Array.isArray(state.touchZones.co) ? state.touchZones.co : touchZones.co,
      chan: Array.isArray(state.touchZones.chan) ? state.touchZones.chan : touchZones.chan,
      soLanVuotDeBoiRoi: state.touchZones.soLanVuotDeBoiRoi ?? touchZones.soLanVuotDeBoiRoi,
      giayResetDem: state.touchZones.giayResetDem ?? touchZones.giayResetDem,
    };
  }
  if (state.touchLines && typeof state.touchLines === 'object') touchLines = state.touchLines;
  Emo.setDefs(state.emotionDefs, state.emotionNeutral, state.emotionModelProfiles);
  Emo.enable(state.emotionsEnabled !== false);
  Emo.config({ holdSec: state.emotionHoldSec, halfLifeMin: state.moodHalfLifeMin, moodRest: state.moodRest });
  if (state.mood) Emo.setMood(state.mood);
  if (Number.isFinite(state.watchIntervalSec) && state.watchIntervalSec > 0) watchIntervalMs = state.watchIntervalSec * 1000;
  if (!watching) seeBtn.title = watchOffTitle();
  if (Number.isFinite(state.watchMaxMin) && state.watchMaxMin > 0) watchMaxMs = state.watchMaxMin * 60000;
  if (state.proactive) {
    proactiveEnabled = state.proactive.enabled !== false;
    if (Number.isFinite(state.proactive.quietAfterMin) && state.proactive.quietAfterMin > 0) proactiveQuietMs = state.proactive.quietAfterMin * 60000;
    if (Number.isFinite(state.proactive.intervalSec) && state.proactive.intervalSec > 0) proactiveIntervalMs = state.proactive.intervalSec * 1000;
    if (Number.isFinite(state.proactive.awayAfterMin) && state.proactive.awayAfterMin > 0) proactiveAwayMs = state.proactive.awayAfterMin * 60000;
    if (Number.isFinite(state.proactive.cooldownMin) && state.proactive.cooldownMin > 0) proactiveCooldownMinMs = state.proactive.cooldownMin * 60000;
    if (Number.isFinite(state.proactive.cooldownMax) && state.proactive.cooldownMax > 0) proactiveCooldownMaxMs = state.proactive.cooldownMax * 60000;
    proactiveState = state.proactive.presence || 'ACTIVE';
    attentionMode = (state.attention && state.attention.mode) || 'PASSIVE';
  }
  if (state.runtimeSettings) {
    runtimeSettings = state.runtimeSettings;
  }
  if (state.windowResize) {
    resizeEnableEl.checked = state.windowResize.enabled === true;
    resizeWidthEl.value = Math.max(260, Math.min(1000, Number(state.windowResize.width) || 360));
    resizeHeightEl.value = Math.max(400, Math.min(1000, Number(state.windowResize.height) || 620));
    refreshResizeUI();
  }
  if (state.edgeVoice) {
    const sel = $('voice');
    if (![...sel.options].some((o) => o.value === state.edgeVoice)) {
      const o = document.createElement('option'); o.value = state.edgeVoice; o.textContent = state.edgeVoice; sel.appendChild(o);
    }
    sel.value = state.edgeVoice;
  }
  const savedPitch = parseInt(state.edgePitch, 10);
  if (Number.isFinite(savedPitch)) {
    basePitchHz = savedPitch;
    $('voicepitch').value = savedPitch;
    $('voicepitchval').textContent = pitchStr(savedPitch);
  }
  if (Number.isFinite(Number(state.doCaoGiong))) windowsPitch = Number(state.doCaoGiong);
  if (state.speechPacing) { pacingCfg.enabled = state.speechPacing.enabled !== false; pacingCfg.scale = Number.isFinite(Number(state.speechPacing.scale)) ? Number(state.speechPacing.scale) : 1; }
  state.history.forEach((m) => addLog(m.role, m.text));

  if (!hasKey) showBubble(appLanguage === 'en' ? 'Gemini API key is not configured yet. Open Developer Console (🛠) to add it.' : 'Bạn chưa cấu hình Gemini API key. Mở Developer Console (🛠) để thêm key nhé.', 'err');
  else if (!state.history.length) showBubble(appLanguage === 'en' ? "Hi! I'm LunAV. Say something to me." : 'Chào bạn! Mình là LunAV. Nhắn gì đó cho mình nhé.');
  else showBubble(appLanguage === 'en' ? 'Welcome back! What are you up to today?' : 'Bạn quay lại rồi! Hôm nay có gì vui không?');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) markOffline(false); // mở app khi đang mất mạng

  /* ---- Nhân vật Live2D ---- */
  try {
    const { Live2DModel } = PIXI.live2d;
    const W = window.innerWidth, H = window.innerHeight;
    const avail = H - 56; // chừa chỗ cho ô nhập ở dưới

    pixiApp = new PIXI.Application({
      view: $('canvas'), width: W, height: H, backgroundAlpha: 0, autoStart: true,
    });
    const app = pixiApp;

    // Bố trí cửa sổ trước; model được tải qua hàm dùng chung để có thể đổi model ngay trong Settings.
    Object.assign(View, { W, H, avail });
    const selected = live2dModels.find((m) => m.id === currentLive2DModelId) || live2dModels[0];
    if (!selected) throw new Error(L('Không tìm thấy model Live2D trong thư mục models.', 'No Live2D model was found in the models folder.'));
    if (!(await loadLive2DModel(selected.id, selected.path))) throw new Error(L('Không tải được model Live2D.', 'Could not load the Live2D model.'));
    playWaveOnce(); // chào tay 1 lần lúc vừa mở app
    if (app.ticker) {
      // Giới hạn tốc độ dựng hình Live2D ở 30fps thay vì chạy KHÔNG GIỚI HẠN theo tần số quét màn
      // hình (mặc định của Pixi ticker) - avatar chỉ có hoạt ảnh thở/nhìn theo chuột rất nhẹ nhàng,
      // không cần 60-144fps như game, nên hạ xuống 30fps giảm đáng kể tải GPU/CPU liên tục trong lúc
      // app chạy nền mà hầu như không ai nhận ra khác biệt về độ mượt.
      app.ticker.maxFPS = Number(runtimeSettings.performance?.fps || 30);
      app.ticker.add(viewStep);
    }

    // Tự căn lại canvas + Live2D mỗi khi cửa sổ đổi kích thước.
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        const nw = window.innerWidth;
        const nh = window.innerHeight;
        if (pixiApp && pixiApp.renderer) pixiApp.renderer.resize(nw, nh);
        View.W = nw;
        View.H = nh;
        View.avail = Math.max(1, nh - 56);
        layoutView(View.tCur, View.panCur);
      });
    });

    // Theo dõi chuột nhẹ: mắt bám theo hướng chuột, đầu chỉ nghiêng/xoay nhẹ.
    // Tọa độ từ main.js đã là tọa độ tương đối với cửa sổ Electron.
    // Không giới hạn theo vùng quanh đầu để khi chuột ở ô chat model vẫn nhìn đúng hướng.
    let lastCursorX = NaN;
    let lastCursorY = NaN;

    // pixi-live2d-display mặc định có thể xoay đầu tới khoảng 30 độ.
    // Gửi trực tiếp một giá trị focus nhỏ hơn 1 để chuyển động tự nhiên hơn:
    // - ngang: tối đa ~9 độ AngleX / ~3 độ BodyAngleX
    // - dọc: tối đa ~6 độ AngleY
    // - Z chỉ nghiêng rất nhẹ khi nhìn chéo.
    const TRACK_X_GAIN = Number(runtimeSettings.tracking?.x ?? 0.30);
    const TRACK_Y_GAIN = Number(runtimeSettings.tracking?.y ?? 0.20);

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const setSoftCursorFocus = (pos) => {
      if (!View.model || !View.model.internalModel || !View.model.internalModel.focusController) return;

      if (runtimeSettings.mouseTrackingMode === 'off') { View.targetFocusX = 0; View.targetFocusY = 0; return; }
      const model = View.model;
      const centerX = model.x + model.width * 0.5;
      const centerY = model.y + model.height * 0.5;

      // Chuẩn hóa vị trí chuột theo kích thước model rồi giảm biên độ.
      // Cursor xuống thấp => model chỉ nhìn xuống nhẹ, không cúi sâu.
      const dx = (pos.x - centerX) / Math.max(1, model.width * 0.5);
      const dy = (pos.y - centerY) / Math.max(1, model.height * 0.5);

      const focusX = clamp(dx * TRACK_X_GAIN, -TRACK_X_GAIN, TRACK_X_GAIN);
      // focusController dùng Y dương = nhìn lên, nên đảo chiều trục Y màn hình.
      const focusY = clamp(-dy * TRACK_Y_GAIN, -TRACK_Y_GAIN, TRACK_Y_GAIN);

      View.targetFocusX = focusX;
      View.targetFocusY = focusY;
    };

    window.api.onCursor((pos) => {
      if (!pos) return;
      if (pos.presence) handleProactivePresence(pos.presence);
      if (!View.model) return;

      lastCursorX = pos.x;
      lastCursorY = pos.y;
      setSoftCursorFocus(pos);
    });

    if (window.api.onRuntimeSettings) {
      window.api.onRuntimeSettings((settings) => {
        runtimeSettings = settings || runtimeSettings;
        if (runtimeSettings.desktopVoice) {
          desktopVoice.silenceMs = Math.min(3000, Math.max(300, Number(runtimeSettings.desktopVoice.silenceMs) || 950));
          desktopVoice.maxTurnMs = Math.min(60000, Math.max(5000, (Number(runtimeSettings.desktopVoice.maxTurnSec) || 15) * 1000));
          desktopVoice.noiseMultiplier = Math.min(6, Math.max(1.2, Number(runtimeSettings.desktopVoice.noiseMultiplier) || 2.5));
          desktopVoice.autoListen = runtimeSettings.desktopVoice.autoListen !== false;
        }
        if (runtimeSettings.screenWatch) {
          if (Number(runtimeSettings.screenWatch.intervalSec) > 0) watchIntervalMs = Number(runtimeSettings.screenWatch.intervalSec) * 1000;
          if (Number(runtimeSettings.screenWatch.maxMin) > 0) watchMaxMs = Number(runtimeSettings.screenWatch.maxMin) * 60000;
          proactiveEnabled = runtimeSettings.screenWatch.proactiveEnabled !== false;
          if (Number(runtimeSettings.screenWatch.proactiveIntervalSec) > 0) proactiveIntervalMs = Number(runtimeSettings.screenWatch.proactiveIntervalSec) * 1000;
        }
        if (runtimeSettings.toolPermissions?.desktopVoice === false && desktopVoice.listening) stopDesktopVoice();
        if (runtimeSettings.toolPermissions?.screenWatch === false) {
          if (watching) stopWatching(L('Mình đã tắt quyền theo dõi màn hình.', 'Screen Watching permission was disabled.'));
          if (proactiveWatching) stopProactiveWatching();
        } else if (autoObserverOn()) {
          startAutoCuriousObserver();
        } else {
          // Người dùng vừa tắt Curious Observer: dừng quan sát nền ngay, trừ khi đang ở chế độ im lặng lâu (QUIET).
          autoCuriousStarted = false;
          if (proactiveWatching && proactiveState !== 'QUIET') stopProactiveWatching();
        }
        if (app.ticker) app.ticker.maxFPS = Number(runtimeSettings.performance?.fps || 45);
        if (View.model) {
          const mode = runtimeSettings.mouseTrackingMode;
          if (mode === 'off') { View.targetFocusX = 0; View.targetFocusY = 0; }
          else if (lastCursorX === lastCursorX && lastCursorY === lastCursorY) setSoftCursorFocus({ x: lastCursorX, y: lastCursorY });
        }
      });
    }

    // Một lượt nói chuyện qua voice Discord (nghe bạn nói -> Gemini hiểu & trả lời -> đã tự nói lại
    // thẳng vào kênh voice từ phía main.js rồi) - ở đây chỉ cần hiện chữ + đổi nét mặt, KHÔNG gọi speak()
    // nữa vì gọi thêm sẽ phát trùng audio 2 nơi cùng lúc (loa máy + kênh voice).
    window.api.onVoiceTurn(({ heard, reply, speechEn, emotion, intensity, mood, source }) => {
      if (speaking || speechBusy) stopSpeaking();
      addLog('user', heard);
      addLog('model', reply);
      sendDevLog('system', source === 'desktop' ? 'DESKTOP VOICE • nhận câu nói và trả lời xong' : 'VOICE • nhận câu nói từ Discord và trả lời xong');
      showBubble(reply);
      if (runtimeSettings.toolPermissions?.emotion !== false && mood) Emo.setMood(mood);
      if (runtimeSettings.toolPermissions?.emotion !== false && emotion) Emo.set(emotion, intensity || 2);
      else if (runtimeSettings.toolPermissions?.emotion !== false) Emo.clear();
      if (source === 'desktop' && speechEn && !muted && runtimeSettings.toolPermissions?.tts !== false) {
        speak(speechEn, buildSpeechOpts(emotion, intensity)).catch(() => {});
      }
      if (source === 'desktop' && runtimeSettings.desktopVoice?.autoListen && runtimeSettings.toolPermissions?.desktopVoice !== false) {
        setTimeout(() => { if (!desktopVoice.listening && !busy) startDesktopVoice(); }, 350);
      }
    });
  } catch (err) {
    sendDevLog('error', 'Renderer không tải được nhân vật: ' + String(err && err.stack || err));
    showBubble(L('Không tải được nhân vật. Kiểm tra lại thư mục models và tên file trong renderer.js nhé.', 'Could not load the character. Check the models folder and the model filename in renderer.js.'), 'err');
  }

/* ---------- Character Behavior 2.0: sparse, contextual, local ---------- */
let microReactionTimer = null;
let microReactionLastAt = 0;
function scheduleMicroReaction() {
  if (microReactionTimer) clearTimeout(microReactionTimer);
  const delay = 35000 + Math.random() * 45000;
  microReactionTimer = setTimeout(() => {
    microReactionTimer = null;
    const emotionAllowed = runtimeSettings.toolPermissions?.emotion !== false;
    const attentionMode = (window.__lunavAttentionMode || 'IDLE').toUpperCase();
    const idleSec = Math.max(0, Number(window.__lunavIdleSec || 0));
    const screenEventKind = window.__lunavScreenEventKind || '';
    if (emotionAllowed && !busy && !speaking && !speechBusy && !desktopVoice.listening) {
      try {
        const result = typeof Emo.microReact === 'function'
          ? Emo.microReact({ attentionMode, idleSec, screenEventKind, cooldownMs: 42000 })
          : { ok: false, reason: 'behavior-api-missing' };
        if (result.ok) {
          const missing = typeof Emo.missingParams === 'function' ? Emo.missingParams().length : 0;
          sendDevLog('system', `CHARACTER BEHAVIOR • ${result.name} • intensity=${result.intensity} • ${result.duration}ms • missingParams=${missing}`);
          microReactionLastAt = Date.now();
        }
      } catch (e) {
        sendDevLog('warn', 'CHARACTER BEHAVIOR • reaction failed: ' + String(e?.message || e));
      }
    }
    scheduleMicroReaction();
  }, delay);
}
scheduleMicroReaction();
})();
