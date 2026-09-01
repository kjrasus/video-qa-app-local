    // State Management
    let filesState = [];
    let trimmedFilesState = [];
    let currentIndex = -1;
    let currentQueueType = 'main';

    // Local Folder State (File System Access API)
    let inputDirHandle = null;
    let outputDirHandle = null;
    let currentObjectUrl = null;

    const MEDIA_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|mpg|mpeg|ogv|mp3|wav|m4a|aac|ogg|oga|flac)$/i;

    // Zoom & Pan State
    let zoomLevel = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let startPanX = 0;
    let startPanY = 0;

    // Focus Mode State
    let isFocusMode = false;

    // Trimming State
    let trimStartSec = 0;
    let trimEndSec = 0;
    let isDraggingIn = false;
    let isDraggingOut = false;
    let isRendering = false;
    let isTrimSeeking = false;

    // Crop Dragging State
    let isCropping = false;
    let cropBoxData = { x: 50, y: 50, w: 200, h: 150 };
    let dragMode = null;
    let dragStart = { x: 0, y: 0 };

    // DOM Elements
    const fileInput = document.getElementById('file-input');
    const fileListEl = document.getElementById('file-list');
    const trimmedFileListEl = document.getElementById('trimmed-file-list');
    const queueCountEl = document.getElementById('queue-count');

    // Local Folder / Session DOM
    const btnChooseInput = document.getElementById('btn-choose-input');
    const btnChooseOutput = document.getElementById('btn-choose-output');
    const btnResumeSession = document.getElementById('btn-resume-session');
    const btnClearSession = document.getElementById('btn-clear-session');
    const inputFolderLabel = document.getElementById('input-folder-label');
    const outputFolderLabel = document.getElementById('output-folder-label');
    const sessionStatusEl = document.getElementById('session-status');
    
    // Video Players
    const videoPlayer = document.getElementById('video-player');
    const trimVideoPlayer = document.getElementById('trim-video-player');

    const emptyState = document.getElementById('empty-state');
    const dropZone = document.getElementById('drop-zone');

    const statTotal = document.getElementById('stat-total');
    const statPending = document.getElementById('stat-pending');
    const statPassed = document.getElementById('stat-passed');
    const statRejected = document.getElementById('stat-rejected');
    const statTrimmed = document.getElementById('stat-trimmed');
    const currentFilename = document.getElementById('current-filename');
    const currentStatusBadge = document.getElementById('current-status-badge');

    const timecodeDisplay = document.getElementById('timecode-display');
    const frameCounter = document.getElementById('frame-counter');
    const btnMainPlay = document.getElementById('btn-main-play');
    const btnTrimPlay = document.getElementById('btn-trim-play');
    const btnNavPlayPause = document.getElementById('btn-nav-playpause');
    const floatBtnPlay = document.getElementById('float-btn-play');
    const mainTimeDisplay = document.getElementById('main-time-display');

    const dockTrim = document.getElementById('dock-trim-tools');
    const dockCrop = document.getElementById('dock-crop-tools');

    // Focus & Zoom DOM
    const mainHeader = document.getElementById('main-header');
    const mainSidebar = document.getElementById('main-sidebar');
    const focusFloatingDock = document.getElementById('focus-floating-dock');
    const zoomContainer = document.getElementById('zoom-container');
    const zoomViewport = document.getElementById('zoom-viewport');
    const zoomLevelDisplay = document.getElementById('zoom-level-display');

    // Trim Bar DOM
    const trimBarContainer = document.getElementById('trim-bar-container');
    const trimTrackActive = document.getElementById('trim-track-active');
    const trimHandleIn = document.getElementById('trim-handle-in');
    const trimHandleOut = document.getElementById('trim-handle-out');
    const trimPlayhead = document.getElementById('trim-playhead');
    const trimInLabel = document.getElementById('trim-in-label');
    const trimOutLabel = document.getElementById('trim-out-label');
    const trimDurationLabel = document.getElementById('trim-duration-label');

    // Main Seekbar DOM
    const mainSeekContainer = document.getElementById('main-seek-container');
    const mainSeekFill = document.getElementById('main-seek-fill');
    const mainSeekThumb = document.getElementById('main-seek-thumb');

    // Crop Box DOM
    const cropBox = document.getElementById('crop-box');

    // ---------------------------------------------------------------
    // Session Persistence (localStorage) — remembers per-file progress
    // so a closed browser can resume exactly where the review stopped.
    // ---------------------------------------------------------------
    const SESSION_KEY = 'genz-media-qa.session.v1';

    let session = {
      inputFolderName: null,
      outputFolderName: null,
      files: {},      // "<input folder>/<file name>" -> { status, processed }
      trimmed: [],    // [{ name, sourceName, status }]
      updatedAt: null
    };

    function loadSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          session = {
            inputFolderName: parsed.inputFolderName || null,
            outputFolderName: parsed.outputFolderName || null,
            files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
            trimmed: Array.isArray(parsed.trimmed) ? parsed.trimmed : [],
            updatedAt: parsed.updatedAt || null
          };
        }
      } catch (err) {
        console.warn('Could not read saved session', err);
      }
    }

    function saveSession() {
      session.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch (err) {
        console.warn('Could not persist session', err);
      }
      renderSessionStatus();
    }

    function sessionKeyFor(name) {
      return `${session.inputFolderName || 'local'}/${name}`;
    }

    function recordFileProgress(item) {
      if (!item || item.queue !== 'main') return;
      session.files[sessionKeyFor(item.name)] = {
        status: item.status,
        processed: !!item.processed
      };
      saveSession();
    }

    function recordTrimmedOutput(item) {
      const existing = session.trimmed.find(t => t.name === item.name);
      if (existing) {
        existing.status = item.status;
        existing.sourceName = item.sourceName || existing.sourceName || null;
      } else {
        session.trimmed.push({
          name: item.name,
          sourceName: item.sourceName || null,
          status: item.status
        });
      }
      saveSession();
    }

    function applySessionProgress(item) {
      const saved = session.files[sessionKeyFor(item.name)];
      if (!saved) return item;
      item.status = saved.status || item.status;
      item.processed = !!saved.processed;
      return item;
    }

    function clearSession() {
      session = {
        inputFolderName: session.inputFolderName,
        outputFolderName: session.outputFolderName,
        files: {},
        trimmed: [],
        updatedAt: null
      };
      filesState.forEach(item => {
        item.status = 'pending';
        item.processed = false;
      });
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (err) {
        console.warn('Could not clear session', err);
      }
      saveSession();
      updateUI();
    }

    function renderSessionStatus() {
      const reviewed = Object.values(session.files).filter(f => f.status && f.status !== 'pending').length;
      if (!reviewed && !session.trimmed.length) {
        sessionStatusEl.textContent = 'No saved progress';
      } else {
        sessionStatusEl.textContent = `Session: ${reviewed} reviewed · ${session.trimmed.length} processed`;
      }
    }

    // ---------------------------------------------------------------
    // Directory handle persistence (IndexedDB) so "Resume Last Folders"
    // can re-open the same input/output directories after a restart.
    // ---------------------------------------------------------------
    const HANDLE_DB = 'genz-media-qa-handles';
    const HANDLE_STORE = 'handles';

    function openHandleDb() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open(HANDLE_DB, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(HANDLE_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function storeHandle(key, handle) {
      try {
        const db = await openHandleDb();
        if (!db) return;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(HANDLE_STORE, 'readwrite');
          tx.objectStore(HANDLE_STORE).put(handle, key);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.warn('Could not store directory handle', err);
      }
    }

    async function readHandle(key) {
      try {
        const db = await openHandleDb();
        if (!db) return null;
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(HANDLE_STORE, 'readonly');
          const req = tx.objectStore(HANDLE_STORE).get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        console.warn('Could not read directory handle', err);
        return null;
      }
    }

    // ---------------------------------------------------------------
    // Two-Folder Local Workflow
    // ---------------------------------------------------------------
    function supportsFileSystemAccess() {
      return typeof window.showDirectoryPicker === 'function';
    }

    async function ensurePermission(handle, mode) {
      if (!handle || !handle.queryPermission) return true;
      const opts = { mode };
      if ((await handle.queryPermission(opts)) === 'granted') return true;
      return (await handle.requestPermission(opts)) === 'granted';
    }

    function renderFolderLabels() {
      inputFolderLabel.textContent = inputDirHandle
        ? inputDirHandle.name
        : (session.inputFolderName ? `${session.inputFolderName} (not connected)` : 'Not selected');
      outputFolderLabel.textContent = outputDirHandle
        ? outputDirHandle.name
        : (session.outputFolderName ? `${session.outputFolderName} (not connected)` : 'Not selected');
    }

    async function loadFilesFromInputDirectory() {
      if (!inputDirHandle) return;

      // Only the handles are kept in memory — file bytes are read on demand
      // when a clip is selected, so huge folders never hit the ~2GB cap.
      const items = [];
      for await (const entry of inputDirHandle.values()) {
        if (entry.kind !== 'file') continue;
        if (!MEDIA_EXTENSIONS.test(entry.name)) continue;
        items.push(applySessionProgress({
          handle: entry,
          file: null,
          name: entry.name,
          status: 'pending',
          processed: false,
          queue: 'main'
        }));
      }

      items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      filesState = items;
      currentIndex = -1;
      currentQueueType = 'main';
      updateUI();

      const firstPending = filesState.findIndex(f => f.status === 'pending');
      if (filesState.length) selectFile(firstPending === -1 ? 0 : firstPending, 'main');
    }

    async function chooseInputFolder() {
      if (!supportsFileSystemAccess()) {
        alert('This browser does not support local folder access. Use Chrome or Edge (desktop), or the "Upload Files" button.');
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ id: 'media-qa-input', mode: 'read' });
        if (!(await ensurePermission(handle, 'read'))) return;
        inputDirHandle = handle;
        if (session.inputFolderName !== handle.name) {
          // Different folder: progress is tracked per folder, so start clean.
          session.files = {};
        }
        session.inputFolderName = handle.name;
        saveSession();
        await storeHandle('input', handle);
        renderFolderLabels();
        await loadFilesFromInputDirectory();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
        alert('Could not open the input folder: ' + (err && err.message ? err.message : err));
      }
    }

    async function chooseOutputFolder() {
      if (!supportsFileSystemAccess()) {
        alert('This browser does not support local folder access. Use Chrome or Edge (desktop).');
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ id: 'media-qa-output', mode: 'readwrite' });
        if (!(await ensurePermission(handle, 'readwrite'))) return;
        outputDirHandle = handle;
        session.outputFolderName = handle.name;
        saveSession();
        await storeHandle('output', handle);
        renderFolderLabels();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
        alert('Could not open the output folder: ' + (err && err.message ? err.message : err));
      }
    }

    async function resumeSavedFolders() {
      const savedInput = await readHandle('input');
      const savedOutput = await readHandle('output');

      if (savedInput && await ensurePermission(savedInput, 'read')) {
        inputDirHandle = savedInput;
        session.inputFolderName = savedInput.name;
      }
      if (savedOutput && await ensurePermission(savedOutput, 'readwrite')) {
        outputDirHandle = savedOutput;
        session.outputFolderName = savedOutput.name;
      }
      saveSession();
      renderFolderLabels();
      if (inputDirHandle) await loadFilesFromInputDirectory();
      if (!inputDirHandle && !outputDirHandle) {
        alert('Could not reconnect to the saved folders. Please choose them again.');
      }
    }

    // Writes a processed/trimmed file straight into the output folder.
    // Returns the written file name, or null when no output folder is set.
    async function writeToOutputFolder(name, blob) {
      if (!outputDirHandle) return null;
      if (!(await ensurePermission(outputDirHandle, 'readwrite'))) return null;

      const fileName = await uniqueOutputName(name);
      const fileHandle = await outputDirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return fileName;
    }

    async function uniqueOutputName(name) {
      const base = name.replace(/\.[^/.]+$/, '');
      const extMatch = name.match(/\.[^/.]+$/);
      const ext = extMatch ? extMatch[0] : '';
      let candidate = name;
      let counter = 1;
      // getFileHandle throws NotFoundError when the name is still free.
      while (true) {
        try {
          await outputDirHandle.getFileHandle(candidate);
          candidate = `${base}_${counter++}${ext}`;
        } catch (err) {
          if (err && err.name === 'NotFoundError') return candidate;
          return candidate;
        }
      }
    }

    // Resolves the bytes for a queue item, reading from disk on demand.
    async function resolveMediaFile(item) {
      if (item.file) return item.file;
      if (item.handle) {
        if (!(await ensurePermission(item.handle, 'read'))) return null;
        return await item.handle.getFile();
      }
      return null;
    }

    btnChooseInput.onclick = chooseInputFolder;
    btnChooseOutput.onclick = chooseOutputFolder;
    btnResumeSession.onclick = resumeSavedFolders;
    btnClearSession.onclick = () => {
      if (confirm('Clear saved review progress for this folder? Files on disk are untouched.')) clearSession();
    };

    function pickRecorderMime() {
      const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];
      for (const type of candidates) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
      }
      return '';
    }

    function seekTo(player, time) {
      return new Promise((resolve) => {
        const target = Math.max(0, Math.min(time, (player.duration || 0)));
        if (Math.abs(player.currentTime - target) < 0.01) return resolve();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          player.removeEventListener('seeked', finish);
          resolve();
        };
        player.addEventListener('seeked', finish);
        player.currentTime = target;
        setTimeout(finish, 1500);
      });
    }

    function getActivePlayer() {
      return !dockTrim.classList.contains('hidden') ? trimVideoPlayer : videoPlayer;
    }

    // --- Focus Mode Toggle Logic ---
    function toggleFocusMode() {
      isFocusMode = !isFocusMode;
      if (isFocusMode) {
        mainHeader.classList.add('hidden');
        mainSidebar.classList.add('hidden');
        focusFloatingDock.classList.remove('hidden');
      } else {
        mainHeader.classList.remove('hidden');
        mainSidebar.classList.remove('hidden');
        focusFloatingDock.classList.add('hidden');
      }
    }

    document.getElementById('btn-toggle-focus').onclick = toggleFocusMode;
    document.getElementById('float-btn-exit-focus').onclick = toggleFocusMode;

    // --- Zoom & Pan Engine ---
    function updateZoomTransform() {
      zoomContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
      zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
    }

    function setZoom(level) {
      zoomLevel = Math.max(1, Math.min(5, level));
      if (zoomLevel === 1) {
        panX = 0;
        panY = 0;
      }
      updateZoomTransform();
    }

    document.getElementById('btn-zoom-in').onclick = () => setZoom(zoomLevel + 0.25);
    document.getElementById('btn-zoom-out').onclick = () => setZoom(zoomLevel - 0.25);
    document.getElementById('btn-zoom-reset').onclick = () => setZoom(1);
    document.getElementById('float-btn-zoom-reset').onclick = () => setZoom(1);

    zoomViewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.15 : -0.15;
      setZoom(zoomLevel + zoomFactor);
    }, { passive: false });

    zoomViewport.addEventListener('mousedown', (e) => {
      if (zoomLevel > 1 && !isCropping) {
        isPanning = true;
        startPanX = e.clientX - panX;
        startPanY = e.clientY - panY;
        zoomViewport.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isPanning) {
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        updateZoomTransform();
      }
    });

    document.addEventListener('mouseup', () => {
      isPanning = false;
      zoomViewport.style.cursor = 'grab';
    });

    // Global Blur to avoid button spacebar focus stealing
    document.addEventListener('click', (e) => {
      if (['BUTTON', 'A', 'INPUT', 'SELECT'].includes(e.target.tagName)) {
        e.target.blur();
      }
    });

    // Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt.files && dt.files.length > 0) handleFiles(dt.files);
    });

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
      if (!files.length) return;
      Array.from(files).forEach((file) => {
        if (file.type.startsWith('video/') || file.type.startsWith('audio/') || MEDIA_EXTENSIONS.test(file.name)) {
          filesState.push(applySessionProgress({
            file: file,
            handle: null,
            name: file.name,
            status: 'pending',
            processed: false,
            queue: 'main'
          }));
        }
      });
      updateUI();
      if (currentIndex === -1 && filesState.length > 0) selectFile(0, 'main');
    }

    function updateUI() {
      const total = filesState.length;
      const passed = filesState.filter(f => f.status === 'approved').length + trimmedFilesState.filter(f => f.status === 'approved').length;
      const rejected = filesState.filter(f => f.status === 'rejected').length + trimmedFilesState.filter(f => f.status === 'rejected').length;
      const pending = total - filesState.filter(f => f.status !== 'pending').length;

      statTotal.textContent = total;
      statPending.textContent = pending;
      statPassed.textContent = passed;
      statRejected.textContent = rejected;
      statTrimmed.textContent = trimmedFilesState.length;
      if (queueCountEl) queueCountEl.textContent = `(${total})`;

      // Primary Queue List
      fileListEl.innerHTML = '';
      if (filesState.length === 0) {
        fileListEl.innerHTML = '<li class="text-slate-500 p-3 text-center italic">No media loaded yet</li>';
      } else {
        filesState.forEach((item, index) => {
          const li = document.createElement('li');
          const isSelected = currentQueueType === 'main' && index === currentIndex;
          li.className = `p-2 rounded-lg cursor-pointer flex justify-between items-center transition ${isSelected ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200 font-semibold' : 'hover:bg-slate-800 text-slate-300'}`;
          
          let statusIcon = '<span class="text-slate-500">⚪</span>';
          if (item.status === 'approved') statusIcon = '<span class="text-emerald-400 font-bold">✓</span>';
          if (item.status === 'rejected') statusIcon = '<span class="text-rose-400 font-bold">✕</span>';
          if (item.processed) statusIcon = `<span class="text-sky-400" title="Processed to output folder">✂️</span>${statusIcon}`;

          li.innerHTML = `<span class="truncate max-w-[170px] text-xs">${index + 1}. ${item.name}</span><span class="flex items-center gap-1 shrink-0">${statusIcon}</span>`;
          li.onclick = () => selectFile(index, 'main');
          fileListEl.appendChild(li);
        });
      }

      // Trimmed Queue List
      trimmedFileListEl.innerHTML = '';
      if (trimmedFilesState.length === 0) {
        trimmedFileListEl.innerHTML = '<li class="text-slate-500 p-2 text-center italic">No trimmed files saved yet</li>';
      } else {
        trimmedFilesState.forEach((item, index) => {
          const li = document.createElement('li');
          const isSelected = currentQueueType === 'trimmed' && index === currentIndex;
          li.className = `p-2 rounded-lg cursor-pointer flex justify-between items-center transition ${isSelected ? 'bg-sky-600/30 border border-sky-500/50 text-sky-200 font-semibold' : 'hover:bg-slate-800 text-slate-300'}`;
          
          let statusIcon = '<span class="text-emerald-400 font-bold">✓</span>';
          if (item.status === 'rejected') statusIcon = '<span class="text-rose-400 font-bold">✕</span>';

          const savedBadge = item.savedTo
            ? '<span class="text-emerald-400" title="Written to output folder">💾</span>'
            : '';
          li.innerHTML = `<span class="truncate max-w-[170px] text-xs">✂️ ${item.name}</span><span class="flex items-center gap-1 shrink-0">${savedBadge}${statusIcon}</span>`;
          li.onclick = () => selectFile(index, 'trimmed');
          trimmedFileListEl.appendChild(li);
        });
      }

      const activeItem = currentQueueType === 'main' ? filesState[currentIndex] : trimmedFilesState[currentIndex];
      if (activeItem) {
        currentFilename.textContent = activeItem.name;
        if (activeItem.status === 'approved') {
          currentStatusBadge.className = 'bg-emerald-950/90 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/50';
          currentStatusBadge.innerHTML = '<span>🟢</span> <span>APPROVED</span>';
        } else if (activeItem.status === 'rejected') {
          currentStatusBadge.className = 'bg-rose-950/90 text-rose-300 px-3 py-1 rounded-full text-xs font-bold border border-rose-500/50';
          currentStatusBadge.innerHTML = '<span>🔴</span> <span>REJECTED</span>';
        } else {
          currentStatusBadge.className = 'bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs font-bold border border-slate-700';
          currentStatusBadge.innerHTML = '<span>⚪</span> <span>Pending Review</span>';
        }
      }
    }

    async function selectFile(index, queueType = 'main') {
      exitCropMode();
      exitTrimMode();
      setZoom(1);

      currentQueueType = queueType;
      currentIndex = index;
      
      const item = currentQueueType === 'main' ? filesState[currentIndex] : trimmedFilesState[currentIndex];
      if (!item) return;

      updateUI();

      const media = await resolveMediaFile(item);
      if (!media) {
        alert(`Could not read "${item.name}" from the input folder.`);
        return;
      }

      // Selection may have moved on while the file was being read from disk.
      const stillCurrent = currentQueueType === queueType && currentIndex === index;
      if (!stillCurrent) return;

      emptyState.classList.add('hidden');
      trimVideoPlayer.classList.add('hidden');
      videoPlayer.classList.remove('hidden');

      // Only one decoded blob URL is alive at a time so large folders never
      // pile up in memory.
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(media);
      trimVideoPlayer.removeAttribute('src');
      videoPlayer.src = currentObjectUrl;
      videoPlayer.load();

      videoPlayer.onloadedmetadata = () => {
        trimStartSec = 0;
        trimEndSec = videoPlayer.duration;
        updateMainSeekbar();
      };

      updateUI();
    }

    // Toggle Play/Pause Engine
    function togglePlayPause() {
      const activePlayer = getActivePlayer();
      if (!activePlayer.src) return;

      if (activePlayer.paused) {
        if (!dockTrim.classList.contains('hidden')) {
          if (trimVideoPlayer.currentTime < trimStartSec || trimVideoPlayer.currentTime >= trimEndSec - 0.1) {
            trimVideoPlayer.currentTime = trimStartSec;
          }
        }
        activePlayer.play().catch(e => console.log('Playback error:', e));
        syncPlayPauseUI(true);
      } else {
        activePlayer.pause();
        syncPlayPauseUI(false);
      }
    }

    function syncPlayPauseUI(isPlaying) {
      const label = isPlaying ? '⏸ Pause' : '▶ Play';
      const icon = isPlaying ? '⏸' : '▶';
      btnMainPlay.textContent = icon;
      btnTrimPlay.textContent = icon;
      floatBtnPlay.textContent = icon;
      btnNavPlayPause.textContent = label;
    }

    btnMainPlay.onclick = togglePlayPause;
    btnTrimPlay.onclick = togglePlayPause;
    floatBtnPlay.onclick = togglePlayPause;
    btnNavPlayPause.onclick = togglePlayPause;

    // Queue Navigation
    function navigateQueue(direction) {
      if (direction === 'prev') {
        if (currentQueueType === 'main') {
          if (currentIndex > 0) selectFile(currentIndex - 1, 'main');
        } else if (currentQueueType === 'trimmed') {
          if (currentIndex > 0) {
            selectFile(currentIndex - 1, 'trimmed');
          } else if (filesState.length > 0) {
            selectFile(filesState.length - 1, 'main');
          }
        }
      } else if (direction === 'next') {
        if (currentQueueType === 'main') {
          if (currentIndex < filesState.length - 1) {
            selectFile(currentIndex + 1, 'main');
          } else if (trimmedFilesState.length > 0) {
            selectFile(0, 'trimmed');
          }
        } else if (currentQueueType === 'trimmed') {
          if (currentIndex < trimmedFilesState.length - 1) {
            selectFile(currentIndex + 1, 'trimmed');
          }
        }
      }
    }

    document.getElementById('btn-nav-prev').onclick = () => navigateQueue('prev');
    document.getElementById('btn-nav-next').onclick = () => navigateQueue('next');
    document.getElementById('float-btn-prev').onclick = () => navigateQueue('prev');
    document.getElementById('float-btn-next').onclick = () => navigateQueue('next');

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      }
      else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        navigateQueue('prev');
      }
      else if (e.code === 'ArrowRight') {
        e.preventDefault();
        navigateQueue('next');
      }
    });

    const FRAME_TIME = 1 / 30;

    function handleTimeUpdate(player) {
      const cur = player.currentTime;
      const dur = player.duration || 0;
      const frame = Math.floor(cur / FRAME_TIME);

      const formattedCur = formatTime(cur);
      const formattedDur = formatTime(dur);

      timecodeDisplay.textContent = `${formattedCur} / ${formattedDur}`;
      mainTimeDisplay.textContent = `${formattedCur} / ${formattedDur}`;
      frameCounter.textContent = frame;

      // Loop inside active trim bounds
      if (!dockTrim.classList.contains('hidden') && !isTrimSeeking && !isRendering) {
        if (cur >= trimEndSec) {
          player.currentTime = trimStartSec;
          player.pause();
          syncPlayPauseUI(false);
        }
      }

      syncPlayPauseUI(!player.paused);
      updateMainSeekbar();
      updatePlayheadPosition();
    }

    videoPlayer.ontimeupdate = () => handleTimeUpdate(videoPlayer);
    trimVideoPlayer.ontimeupdate = () => handleTimeUpdate(trimVideoPlayer);

    // Responsive Bar Seekers
    mainSeekContainer.addEventListener('click', (e) => {
      const player = getActivePlayer();
      if (!player.duration) return;
      const rect = mainSeekContainer.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      player.currentTime = percentage * player.duration;
    });

    // Instant Trim Bar Seeking
    trimBarContainer.addEventListener('click', (e) => {
      if (isDraggingIn || isDraggingOut) return;
      if (!trimVideoPlayer.duration) return;
      const rect = trimBarContainer.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetTime = Math.max(trimStartSec, Math.min(trimEndSec, percentage * trimVideoPlayer.duration));
      
      trimVideoPlayer.currentTime = targetTime;
    });

    function updateMainSeekbar() {
      const player = getActivePlayer();
      const dur = player.duration || 1;
      const curPct = (player.currentTime / dur) * 100;
      mainSeekFill.style.width = `${curPct}%`;
      mainSeekThumb.style.left = `${curPct}%`;
    }

    document.getElementById('btn-step-fwd').onclick = () => {
      const player = getActivePlayer();
      player.pause();
      player.currentTime = Math.min(player.duration || 0, player.currentTime + FRAME_TIME);
    };

    document.getElementById('btn-step-back').onclick = () => {
      const player = getActivePlayer();
      player.pause();
      player.currentTime = Math.max(0, player.currentTime - FRAME_TIME);
    };

    document.getElementById('speed-select').onchange = (e) => {
      const rate = parseFloat(e.target.value);
      videoPlayer.playbackRate = rate;
      trimVideoPlayer.playbackRate = rate;
    };

    function formatTime(sec) {
      if (isNaN(sec)) return "00:00.00";
      const m = Math.floor(sec / 60);
      const s = (sec % 60).toFixed(2);
      return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // QA Decisions
    function setCurrentStatus(status) {
      if (currentIndex === -1) return;
      const item = currentQueueType === 'main' ? filesState[currentIndex] : trimmedFilesState[currentIndex];
      if (!item) return;
      item.status = status;
      if (currentQueueType === 'main') recordFileProgress(item);
      else recordTrimmedOutput(item);
      updateUI();
    }

    function approveCurrent() {
      setCurrentStatus('approved');
    }

    function rejectCurrent() {
      setCurrentStatus('rejected');
    }

    document.getElementById('btn-approve').onclick = approveCurrent;
    document.getElementById('btn-reject').onclick = rejectCurrent;
    document.getElementById('float-btn-approve').onclick = approveCurrent;
    document.getElementById('float-btn-reject').onclick = rejectCurrent;

    // Fast Trim Mode Engine
    function enableTrimMode() {
      if (currentIndex === -1) return;
      
      const item = currentQueueType === 'main' ? filesState[currentIndex] : trimmedFilesState[currentIndex];
      if (!item) return;

      videoPlayer.pause();
      videoPlayer.classList.add('hidden');
      trimVideoPlayer.classList.remove('hidden');

      const startTrimUI = () => {
        trimStartSec = 0;
        trimEndSec = trimVideoPlayer.duration || 0;
        trimVideoPlayer.currentTime = 0;
        updateTrimBarPositions();
      };

      if (trimVideoPlayer.src !== videoPlayer.src) {
        trimVideoPlayer.onloadedmetadata = startTrimUI;
        trimVideoPlayer.preload = 'auto';
        trimVideoPlayer.src = videoPlayer.src;
      } else if (trimVideoPlayer.readyState >= 1) {
        startTrimUI();
      }

      dockTrim.classList.remove('hidden');
      dockCrop.classList.add('hidden');
      exitCropMode();
    }

    document.getElementById('btn-enable-trim-mode').onclick = enableTrimMode;
    document.getElementById('float-btn-trim').onclick = enableTrimMode;

    document.getElementById('btn-exit-trim').onclick = exitTrimMode;
    
    function exitTrimMode() { 
      dockTrim.classList.add('hidden');
      trimVideoPlayer.pause();
      trimVideoPlayer.classList.add('hidden');
      videoPlayer.classList.remove('hidden');
    }

    trimHandleIn.addEventListener('mousedown', () => { isDraggingIn = true; isTrimSeeking = true; trimVideoPlayer.pause(); });
    trimHandleOut.addEventListener('mousedown', () => { isDraggingOut = true; isTrimSeeking = true; trimVideoPlayer.pause(); });

    document.addEventListener('mouseup', () => {
      isDraggingIn = false;
      isDraggingOut = false;
      isTrimSeeking = false;
    });

    let pendingTrimSeek = null;
    let trimSeekQueued = false;
    function queueTrimSeek(time) {
      pendingTrimSeek = time;
      if (trimSeekQueued) return;
      trimSeekQueued = true;
      requestAnimationFrame(() => {
        trimSeekQueued = false;
        if (pendingTrimSeek == null || !trimVideoPlayer.duration) return;
        if (trimVideoPlayer.fastSeek) trimVideoPlayer.fastSeek(pendingTrimSeek);
        else trimVideoPlayer.currentTime = pendingTrimSeek;
      });
    }

    document.addEventListener('mousemove', (e) => {
      if (!isDraggingIn && !isDraggingOut) return;
      const rect = trimBarContainer.getBoundingClientRect();
      const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = offsetX / rect.width;
      const calcTime = percentage * (trimVideoPlayer.duration || 1);

      if (isDraggingIn) {
        if (calcTime < trimEndSec - 0.2) {
          trimStartSec = calcTime;
          queueTrimSeek(trimStartSec);
        }
      } else if (isDraggingOut) {
        if (calcTime > trimStartSec + 0.2) {
          trimEndSec = calcTime;
          queueTrimSeek(trimEndSec);
        }
      }
      updateTrimBarPositions();
    });

    function updateTrimBarPositions() {
      const dur = trimVideoPlayer.duration || 1;
      const startPct = (trimStartSec / dur) * 100;
      const endPct = (trimEndSec / dur) * 100;

      trimHandleIn.style.left = `${startPct}%`;
      trimHandleOut.style.left = `${endPct}%`;
      
      trimTrackActive.style.left = `${startPct}%`;
      trimTrackActive.style.width = `${endPct - startPct}%`;

      trimInLabel.textContent = formatTime(trimStartSec);
      trimOutLabel.textContent = formatTime(trimEndSec);
      trimDurationLabel.textContent = `Duration: ${formatTime(trimEndSec - trimStartSec)}`;

      updatePlayheadPosition();
    }

    function updatePlayheadPosition() {
      const player = getActivePlayer();
      const dur = player.duration || 1;
      const curPct = (player.currentTime / dur) * 100;
      trimPlayhead.style.left = `${curPct}%`;
    }

    // Save Trim Copy
    document.getElementById('btn-trim-copy').onclick = async () => {
      if (currentIndex === -1) return;
      const curItem = currentQueueType === 'main' ? filesState[currentIndex] : trimmedFilesState[currentIndex];

      const btnTrimCopy = document.getElementById('btn-trim-copy');
      btnTrimCopy.textContent = "Rendering...";
      btnTrimCopy.disabled = true;

      isRendering = true;
      const prevRate = trimVideoPlayer.playbackRate;

      try {
        trimVideoPlayer.pause();
        trimVideoPlayer.playbackRate = 1;
        await seekTo(trimVideoPlayer, trimStartSec);

        const stream = trimVideoPlayer.captureStream
          ? trimVideoPlayer.captureStream()
          : (trimVideoPlayer.mozCaptureStream ? trimVideoPlayer.mozCaptureStream() : null);
        if (!stream) throw new Error("Stream capture not supported");

        const mimeType = pickRecorderMime();
        if (!mimeType) throw new Error("MediaRecorder not supported");

        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
        const chunks = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

        const finished = new Promise(resolve => { recorder.onstop = resolve; });

        // Start playback first, then record, so the first frames are never blank.
        await trimVideoPlayer.play();
        await new Promise(r => setTimeout(r, 120));
        recorder.start(200);

        await new Promise(resolve => {
          const tick = () => {
            if (trimVideoPlayer.currentTime >= trimEndSec - 0.02 || trimVideoPlayer.ended) return resolve();
            if (trimVideoPlayer.paused) return resolve();
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });

        trimVideoPlayer.pause();
        if (recorder.state !== 'inactive') recorder.stop();
        await finished;
        stream.getTracks().forEach(t => { if (t.readyState === 'live' && t.stop) t.stop(); });

        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        if (!blob.size) throw new Error("Empty recording");

        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        await finalizeProcessedOutput(curItem, blob, `${curItem.name.replace(/\.[^/.]+$/, "")}_trimmed.${ext}`);

        trimVideoPlayer.playbackRate = prevRate;
        isRendering = false;
        btnTrimCopy.textContent = "Save as copy";
        btnTrimCopy.disabled = false;

      } catch (err) {
        console.error(err);
        trimVideoPlayer.playbackRate = prevRate;
        isRendering = false;
        alert("Frame-accurate render is not supported by this browser, saving the original as a copy instead.");
        const original = await resolveMediaFile(curItem);
        if (original) {
          await finalizeProcessedOutput(curItem, original, `${curItem.name.replace(/\.[^/.]+$/, "")}_trimmed.webm`);
        }
        btnTrimCopy.textContent = "Save as copy";
        btnTrimCopy.disabled = false;
      }
    };

    // Shared post-processing step for trim/crop results: write the new file to
    // the output folder, reject the pre-processed original, and keep the
    // selection anchored on that original so the audit trail stays readable.
    async function finalizeProcessedOutput(sourceItem, blob, outputName) {
      const anchorIndex = currentIndex;
      const anchorQueue = currentQueueType;

      let savedTo = null;
      try {
        savedTo = await writeToOutputFolder(outputName, blob);
      } catch (err) {
        console.error(err);
        alert('Could not write to the output folder: ' + (err && err.message ? err.message : err));
      }

      const processedItem = {
        file: blob,
        handle: null,
        name: savedTo || outputName,
        sourceName: sourceItem ? sourceItem.name : null,
        status: 'approved',
        savedTo: savedTo,
        queue: 'trimmed'
      };
      trimmedFilesState.push(processedItem);
      recordTrimmedOutput(processedItem);

      if (sourceItem && anchorQueue === 'main') {
        // The pre-trimmed input is superseded by the new output file.
        sourceItem.status = 'rejected';
        sourceItem.processed = true;
        recordFileProgress(sourceItem);
      }

      exitTrimMode();
      exitCropMode();
      currentIndex = anchorIndex;
      currentQueueType = anchorQueue;
      updateUI();

      if (!savedTo) {
        alert('No output folder selected — the processed file is only in the Trimmed queue. Choose an output folder to write results to disk.');
      }
    }

    // Crop Tool Engine
    function enableCropMode() {
      if (currentIndex === -1) return;
      dockCrop.classList.remove('hidden');
      dockTrim.classList.add('hidden');
      exitTrimMode();

      // Zoom/pan applies a CSS transform to the video, which would make the
      // crop box coordinates disagree with the real pixels. Always crop at 1x.
      setZoom(1);

      cropBox.classList.remove('hidden');
      // Wait a frame so layout (docks shown, zoom reset) settles before measuring.
      requestAnimationFrame(() => resetCropBox());
    }

    document.getElementById('btn-enable-crop-mode').onclick = enableCropMode;
    document.getElementById('float-btn-crop').onclick = enableCropMode;

    document.getElementById('btn-exit-crop').onclick = exitCropMode;
    document.getElementById('crop-reset').onclick = resetCropBox;

    function exitCropMode() {
      cropBox.classList.add('hidden');
      dockCrop.classList.add('hidden');
      isCropping = false;
    }

    // Returns the on-screen rect of the actual video picture, expressed in
    // coordinates of #media-wrapper (the crop box's positioning parent).
    function getDisplayedVideoRect() {
      const wrapper = document.getElementById('media-wrapper');
      const wrapRect = wrapper.getBoundingClientRect();
      const elRect = videoPlayer.getBoundingClientRect();

      const vw = videoPlayer.videoWidth;
      const vh = videoPlayer.videoHeight;

      if (!vw || !vh || !elRect.width || !elRect.height) {
        return {
          left: elRect.left - wrapRect.left,
          top: elRect.top - wrapRect.top,
          width: elRect.width,
          height: elRect.height,
        };
      }

      // object-contain letterboxing inside the element box.
      const videoRatio = vw / vh;
      const boxRatio = elRect.width / elRect.height;
      let renderW, renderH;
      if (boxRatio > videoRatio) {
        renderH = elRect.height;
        renderW = renderH * videoRatio;
      } else {
        renderW = elRect.width;
        renderH = renderW / videoRatio;
      }

      return {
        left: elRect.left - wrapRect.left + (elRect.width - renderW) / 2,
        top: elRect.top - wrapRect.top + (elRect.height - renderH) / 2,
        width: renderW,
        height: renderH,
      };
    }

    function resetCropBox() {
      const vRect = getDisplayedVideoRect();
      cropBoxData = {
        x: vRect.left + vRect.width * 0.1,
        y: vRect.top + vRect.height * 0.1,
        w: vRect.width * 0.8,
        h: vRect.height * 0.8
      };
      renderCropBox();
    }

    // Keep the crop box inside the visible video picture.
    function clampCropBox() {
      const r = getDisplayedVideoRect();
      if (!r.width || !r.height) return;
      cropBoxData.w = Math.min(Math.max(30, cropBoxData.w), r.width);
      cropBoxData.h = Math.min(Math.max(30, cropBoxData.h), r.height);
      cropBoxData.x = Math.min(Math.max(cropBoxData.x, r.left), r.left + r.width - cropBoxData.w);
      cropBoxData.y = Math.min(Math.max(cropBoxData.y, r.top), r.top + r.height - cropBoxData.h);
    }

    function renderCropBox() {
      clampCropBox();
      cropBox.style.left = `${cropBoxData.x}px`;
      cropBox.style.top = `${cropBoxData.y}px`;
      cropBox.style.width = `${cropBoxData.w}px`;
      cropBox.style.height = `${cropBoxData.h}px`;
    }

    cropBox.addEventListener('mousedown', (e) => {
      isCropping = true;
      dragStart = { x: e.clientX, y: e.clientY };
      if (e.target.classList.contains('crop-handle')) {
        if (e.target.classList.contains('handle-tl')) dragMode = 'tl';
        if (e.target.classList.contains('handle-tr')) dragMode = 'tr';
        if (e.target.classList.contains('handle-bl')) dragMode = 'bl';
        if (e.target.classList.contains('handle-br')) dragMode = 'br';
      } else {
        dragMode = 'move';
      }
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isCropping) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      dragStart = { x: e.clientX, y: e.clientY };

      if (dragMode === 'move') {
        cropBoxData.x += dx;
        cropBoxData.y += dy;
      } else if (dragMode === 'br') {
        cropBoxData.w = Math.max(30, cropBoxData.w + dx);
        cropBoxData.h = Math.max(30, cropBoxData.h + dy);
      } else if (dragMode === 'tl') {
        cropBoxData.x += dx;
        cropBoxData.y += dy;
        cropBoxData.w = Math.max(30, cropBoxData.w - dx);
        cropBoxData.h = Math.max(30, cropBoxData.h - dy);
      } else if (dragMode === 'tr') {
        cropBoxData.y += dy;
        cropBoxData.w = Math.max(30, cropBoxData.w + dx);
        cropBoxData.h = Math.max(30, cropBoxData.h - dy);
      } else if (dragMode === 'bl') {
        cropBoxData.x += dx;
        cropBoxData.w = Math.max(30, cropBoxData.w - dx);
        cropBoxData.h = Math.max(30, cropBoxData.h + dy);
      }
      renderCropBox();
    });

    document.addEventListener('mouseup', () => { isCropping = false; dragMode = null; });

    // Process Crop
    document.getElementById('btn-apply-crop').onclick = async () => {
      if (currentIndex === -1) return;

      const btnApplyCrop = document.getElementById('btn-apply-crop');
      btnApplyCrop.textContent = "Processing Crop...";
      btnApplyCrop.disabled = true;

      try {
        const vRect = getDisplayedVideoRect();
        if (!videoPlayer.videoWidth || !vRect.width) {
          throw new Error("Video not ready for cropping");
        }

        const scaleX = videoPlayer.videoWidth / vRect.width;
        const scaleY = videoPlayer.videoHeight / vRect.height;

        // Map the crop box (wrapper coordinates) onto the source video pixels.
        let cropX = Math.round((cropBoxData.x - vRect.left) * scaleX);
        let cropY = Math.round((cropBoxData.y - vRect.top) * scaleY);
        let cropW = Math.round(cropBoxData.w * scaleX);
        let cropH = Math.round(cropBoxData.h * scaleY);

        cropX = Math.min(Math.max(0, cropX), videoPlayer.videoWidth - 2);
        cropY = Math.min(Math.max(0, cropY), videoPlayer.videoHeight - 2);
        cropW = Math.max(2, Math.min(cropW, videoPlayer.videoWidth - cropX));
        cropH = Math.max(2, Math.min(cropH, videoPlayer.videoHeight - cropY));

        const canvas = document.getElementById('hidden-canvas');
        // Even dimensions keep encoders happy.
        canvas.width = cropW - (cropW % 2);
        canvas.height = cropH - (cropH % 2);
        const ctx = canvas.getContext('2d');

        // Reset to the start and paint the first frame BEFORE recording, so the
        // stream never starts with an empty (black) canvas.
        videoPlayer.pause();
        videoPlayer.playbackRate = 1;
        await seekTo(videoPlayer, 0);
        ctx.drawImage(videoPlayer, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

        const canvasStream = canvas.captureStream(30);

        try {
          const origStream = videoPlayer.captureStream
            ? videoPlayer.captureStream()
            : videoPlayer.mozCaptureStream();
          if (origStream && origStream.getAudioTracks().length > 0) {
            origStream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
          }
        } catch (audioErr) {
          console.warn("Audio capture unavailable for crop", audioErr);
        }

        const cropMime = pickRecorderMime();
        if (!cropMime) throw new Error("MediaRecorder not supported");
        const recorder = new MediaRecorder(canvasStream, { mimeType: cropMime, videoBitsPerSecond: 8000000 });
        const chunks = [];
        const ext = cropMime.includes('mp4') ? 'mp4' : 'webm';

        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

        const done = new Promise(resolve => { recorder.onstop = resolve; });

        recorder.start(200);

        // Play through once, drawing every frame into the crop canvas.
        await videoPlayer.play();

        await new Promise(resolve => {
          function drawCropFrame() {
            if (videoPlayer.ended || videoPlayer.paused) {
              resolve();
              return;
            }
            ctx.drawImage(videoPlayer, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
            requestAnimationFrame(drawCropFrame);
          }
          drawCropFrame();
        });

        if (recorder.state === 'recording') recorder.stop();
        await done;

        const croppedBlob = new Blob(chunks, { type: cropMime.split(';')[0] });
        if (croppedBlob.size === 0) throw new Error("Crop produced an empty file");

        const target = currentQueueType === 'main' ? filesState : trimmedFilesState;
        const sourceItem = target[currentIndex];
        const baseName = sourceItem.name.replace(/\.[^.]+$/, '');

        await finalizeProcessedOutput(sourceItem, croppedBlob, `${baseName}_cropped.${ext}`);

        btnApplyCrop.textContent = "Apply Crop (Save to Output)";
        btnApplyCrop.disabled = false;

      } catch (err) {
        console.error(err);
        btnApplyCrop.textContent = "Apply Crop (Save to Output)";
        btnApplyCrop.disabled = false;
        alert("Failed to render video crop: " + (err && err.message ? err.message : err));
      }
    };

    // Export Handler — writes to the output folder when one is connected,
    // otherwise falls back to a normal browser download.
    document.getElementById('btn-save-current').onclick = async () => {
      if (currentIndex === -1) return;
      const item = currentQueueType === 'main' ? filesState[currentIndex] : trimmedFilesState[currentIndex];
      if (!item) return;

      const media = await resolveMediaFile(item);
      if (!media) return;
      const name = `${item.status === 'rejected' ? 'REJECTED_' : 'APPROVED_'}${item.name}`;

      if (outputDirHandle) {
        try {
          const savedTo = await writeToOutputFolder(name, media);
          if (savedTo) return;
        } catch (err) {
          console.error(err);
        }
      }
      saveAs(media, name);
    };

    // Boot: restore saved progress and offer to reconnect the last folders.
    (async () => {
      loadSession();
      renderSessionStatus();
      renderFolderLabels();

      if (!supportsFileSystemAccess()) {
        btnChooseInput.disabled = true;
        btnChooseOutput.disabled = true;
        btnChooseInput.title = 'Local folder access requires Chrome or Edge on desktop';
        btnChooseOutput.title = btnChooseInput.title;
        btnChooseInput.classList.add('opacity-50', 'cursor-not-allowed');
        btnChooseOutput.classList.add('opacity-50', 'cursor-not-allowed');
        return;
      }

      const savedInput = await readHandle('input');
      const savedOutput = await readHandle('output');
      if (savedInput || savedOutput) btnResumeSession.classList.remove('hidden');
    })();
