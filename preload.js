const { contextBridge, ipcRenderer } = require('electron');

// Buffer thông báo single-instance để không bị mất nếu main gửi trước khi renderer đăng ký callback.
let pendingSingleInstanceNotice = null;
let singleInstanceNoticeCallback = null;
ipcRenderer.on('single-instance-notice', (_e, text) => {
  pendingSingleInstanceNotice = text;
  if (typeof singleInstanceNoticeCallback === 'function') {
    const cb = singleInstanceNoticeCallback;
    singleInstanceNoticeCallback = null;
    const msg = pendingSingleInstanceNotice;
    pendingSingleInstanceNotice = null;
    try { cb(msg); } catch {}
  }
});

contextBridge.exposeInMainWorld('api', {
  quit: () => ipcRenderer.send('quit'),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, pos) => cb(pos)),
  onDiscordEvent: (cb) => ipcRenderer.on('discord-event', (_e, ev) => cb(ev)),
  onMusicLocalEvent: (cb) => ipcRenderer.on('music-local-event', (_e, info) => cb(info)),
  onCredentialsUpdated: (cb) => ipcRenderer.on('credentials-updated', (_e, info) => cb(info)),
  onVoiceTurn: (cb) => ipcRenderer.on('voice-turn', (_e, data) => cb(data)),
  desktopVoiceTurn: (payload) => ipcRenderer.invoke('desktop-voice-turn', payload),
  onChatSpeechReady: (cb) => ipcRenderer.on('chat-speech-ready', (_e, payload) => cb(payload)),
  onChatSpeechChunk: (cb) => ipcRenderer.on('chat-speech-chunk', (_e, ch) => cb(ch)),
  onCompanionEvent: (cb) => ipcRenderer.on('companion-event', (_e, ev) => cb(ev)),
  companionOverview: () => ipcRenderer.invoke('companion-overview'),
  personalityGet: () => ipcRenderer.invoke('personality-get'),
  personalityReset: () => ipcRenderer.invoke('personality-reset'),
  companionForget: (kind, id, key) => ipcRenderer.invoke('companion-forget', kind, id, key),
  onSingleInstanceNotice: (cb) => {
    singleInstanceNoticeCallback = cb;
    if (pendingSingleInstanceNotice != null) {
      const msg = pendingSingleInstanceNotice;
      pendingSingleInstanceNotice = null;
      singleInstanceNoticeCallback = null;
      try { cb(msg); } catch {}
    }
  },
  getState: () => ipcRenderer.invoke('get-state'),
  setLive2DModel: (id) => ipcRenderer.invoke('set-live2d-model', id),
  setLanguage: (lang) => ipcRenderer.invoke('set-language', lang),
  saveKey: (k) => ipcRenderer.invoke('save-key', k),
  deleteKey: () => ipcRenderer.invoke('delete-key'),
  saveTavilyKey: (k) => ipcRenderer.invoke('save-tavily-key', k),
  deleteTavilyKey: () => ipcRenderer.invoke('delete-tavily-key'),
  chat: (t, opts) => ipcRenderer.invoke('chat', t, opts),
  tts: (t, o) => ipcRenderer.invoke('tts', t, o),
  setVoice: (o) => ipcRenderer.invoke('set-voice', o),
  discordJoin: () => ipcRenderer.invoke('discord-join'),
  discordLeave: () => ipcRenderer.invoke('discord-leave'),
  discordStatus: () => ipcRenderer.invoke('discord-status'),
  ping: () => ipcRenderer.invoke('ping'),
  setWindowSize: (o) => ipcRenderer.invoke('set-window-size', o),
  setAutoStart: (enable) => ipcRenderer.invoke('set-autostart', !!enable),
  getAutoStart: () => ipcRenderer.invoke('get-autostart'),
  openDevConsole: () => ipcRenderer.invoke('dev-console-open'),
  clearDevConsole: () => ipcRenderer.invoke('dev-console-clear'),
  devLog: (level, text) => ipcRenderer.invoke('dev-log', { level, text }),
  onDevLog: (cb) => ipcRenderer.on('dev-log', (_e, item) => cb(item)),
  onDevLogBatch: (cb) => ipcRenderer.on('dev-log-batch', (_e, items) => cb(items)),
  onDevLogClear: (cb) => ipcRenderer.on('dev-log-clear', () => cb()),
  getDevConsoleSettings: () => ipcRenderer.invoke('dev-console-get-settings'),
  saveDiscordConfig: (o) => ipcRenderer.invoke('dev-console-save-discord', o),
  deleteDiscordToken: () => ipcRenderer.invoke('dev-console-delete-discord-token'),
  setCoordinateDebug: (enabled) => ipcRenderer.invoke('dev-console-set-coordinate-debug', !!enabled),
  setPerformanceMode: (mode) => ipcRenderer.invoke('dev-console-set-performance', mode),
  setMouseTrackingMode: (mode) => ipcRenderer.invoke('dev-console-set-mouse-tracking', mode),
  getPerformanceStats: () => ipcRenderer.invoke('dev-console-performance-stats'),
  openMemoryManager: () => ipcRenderer.invoke('dev-console-memory-open'),
  getMemoryManager: () => ipcRenderer.invoke('dev-console-memory'),
  deleteMemoryFact: (index, expected) => ipcRenderer.invoke('dev-console-delete-memory-fact', index, expected),
  deleteMemoryStory: (index, expected) => ipcRenderer.invoke('dev-console-delete-memory-story', index, expected),
  forgetEverything: () => ipcRenderer.invoke('dev-console-forget-everything'),
  onRuntimeSettings: (cb) => ipcRenderer.on('runtime-settings', (_e, data) => cb(data)),
  getToolPermissions: () => ipcRenderer.invoke('dev-console-tool-permissions'),
  setToolPermission: (name, enabled) => ipcRenderer.invoke('dev-console-set-tool-permission', name, !!enabled),
  getDesktopVoiceSettings: () => ipcRenderer.invoke('dev-console-get-desktop-voice-settings'),
  setDesktopVoiceSettings: (o) => ipcRenderer.invoke('dev-console-set-desktop-voice-settings', o || {}),
  getScreenWatchSettings: () => ipcRenderer.invoke('dev-console-get-screen-watch-settings'),
  setScreenWatchSettings: (o) => ipcRenderer.invoke('dev-console-set-screen-watch-settings', o || {}),
  onCoordinateDebugSetting: (cb) => ipcRenderer.on('coordinate-debug-setting', (_e, enabled) => cb(!!enabled)),
  getProgramStorage: () => ipcRenderer.invoke('dev-console-storage'),
  getDevHealth: () => ipcRenderer.invoke('dev-console-health'),
  getUsage: () => ipcRenderer.invoke('dev-console-usage'),
  resetUsage: () => ipcRenderer.invoke('dev-console-usage-reset'),
  verifyIntegrity: () => ipcRenderer.invoke('dev-console-verify-integrity'),
  clearAll: () => ipcRenderer.invoke('clear-all'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
});
