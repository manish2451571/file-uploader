const API = 'http://localhost:5000';

let queue        = [];   // files staged for upload
let allFiles     = [];   // files on server
let currentView  = 'grid';
let deleteTarget = null;

// ── File type icons ───────────────────────────────────────────
function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️',
    mp4: '🎬', zip: '🗜️', txt: '📝', doc: '📘', docx: '📘',
    csv: '📊', xlsx: '📊'
  };
  return map[ext] || '📁';
}

function formatSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Drop Zone ─────────────────────────────────────────────────
const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  addToQueue([...e.dataTransfer.files]);
});

fileInput.addEventListener('change', () => addToQueue([...fileInput.files]));

// ── Queue ─────────────────────────────────────────────────────
function addToQueue(files) {
  files.forEach(f => {
    if (!queue.find(q => q.name === f.name && q.size === f.size)) {
      queue.push({ file: f, id: Date.now() + Math.random(), status: 'pending', progress: 0 });
    }
  });
  renderQueue();
}

function removeFromQueue(id) {
  queue = queue.filter(q => q.id !== id);
  renderQueue();
}

function renderQueue() {
  const wrap = document.getElementById('upload-queue');
  const list = document.getElementById('queue-list');
  document.getElementById('queue-count').textContent = queue.length;

  if (!queue.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  list.innerHTML = queue.map(q => `
    <div class="queue-item" id="qi-${q.id}">
      <span class="file-icon">${fileIcon(q.file.name)}</span>
      <div class="file-details">
        <div class="file-name">${q.file.name}</div>
        <div class="file-size">${formatSize(q.file.size)}</div>
        ${q.status === 'uploading' ? `
          <div class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill" id="pf-${q.id}" style="width:${q.progress}%"></div>
            </div>
          </div>` : ''}
        ${q.status === 'error' ? `<div style="font-size:0.78rem;color:var(--danger);margin-top:4px">${q.error}</div>` : ''}
      </div>
      <span class="status-icon ${q.status === 'done' ? 'success' : q.status === 'error' ? 'error' : ''}">
        ${q.status === 'done' ? '✅' : q.status === 'error' ? '❌' : ''}
      </span>
      ${q.status !== 'uploading' ? `
        <button class="remove-btn" onclick="removeFromQueue(${q.id})">
          <i class="fas fa-times"></i>
        </button>` : ''}
    </div>
  `).join('');
}

// ── Upload ────────────────────────────────────────────────────
document.getElementById('upload-btn').addEventListener('click', uploadAll);

async function uploadAll() {
  const pending = queue.filter(q => q.status === 'pending');
  if (!pending.length) return;

  for (const item of pending) {
    item.status = 'uploading';
    renderQueue();

    const formData = new FormData();
    formData.append('files', item.file);

    try {
      // Simulate progress with XHR for real progress bar
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API}/upload`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            item.progress = Math.round((e.loaded / e.total) * 100);
            const fill = document.getElementById(`pf-${item.id}`);
            if (fill) fill.style.width = item.progress + '%';
          }
        };

        xhr.onload = () => {
          const results = JSON.parse(xhr.responseText);
          const result  = results[0];
          if (result?.error) {
            item.status = 'error';
            item.error  = result.error;
            reject();
          } else {
            item.status   = 'done';
            item.progress = 100;
            resolve();
          }
          renderQueue();
        };

        xhr.onerror = () => {
          item.status = 'error';
          item.error  = 'Upload failed';
          renderQueue();
          reject();
        };

        xhr.send(formData);
      });
    } catch { /* error already set */ }
  }

  // Remove done items after delay, reload file list
  setTimeout(() => {
    queue = queue.filter(q => q.status !== 'done');
    renderQueue();
  }, 2000);

  loadFiles();
  showToast('Files uploaded successfully', 'success');
}

// ── Load server files ─────────────────────────────────────────
async function loadFiles() {
  try {
    const res = await fetch(`${API}/files`);
    allFiles  = await res.json();
    renderFiles(allFiles);
  } catch {
    document.getElementById('files-container').innerHTML =
      '<div class="empty-files"><i class="fas fa-exclamation-circle"></i>Could not connect to server.</div>';
  }
}

function renderFiles(files) {
  const container = document.getElementById('files-container');
  document.getElementById('file-count').textContent = files.length;

  if (!files.length) {
    container.innerHTML = '<div class="empty-files"><i class="fas fa-folder-open"></i>No files uploaded yet.</div>';
    return;
  }

  container.innerHTML = files.map(f => `
    <div class="file-card">
      <span class="big-icon">${fileIcon(f.name)}</span>
      <div class="fc-info">
        <div class="fc-name" title="${f.name}">${f.name}</div>
        <div class="fc-size">${formatSize(f.size)} · ${formatDate(f.uploaded_at)}</div>
      </div>
      <div class="fc-actions">
        <a class="fc-btn download" href="${API}/files/${encodeURIComponent(f.name)}" download title="Download">
          <i class="fas fa-download"></i> Download
        </a>
        <button class="fc-btn delete" onclick="confirmDelete('${f.name}')" title="Delete">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    </div>
  `).join('');
}

// ── Search ────────────────────────────────────────────────────
document.getElementById('search-files').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderFiles(allFiles.filter(f => f.name.toLowerCase().includes(q)));
});

// ── View toggle ───────────────────────────────────────────────
function setView(view) {
  currentView = view;
  const container = document.getElementById('files-container');
  container.classList.toggle('list-view', view === 'list');
  document.getElementById('grid-btn').classList.toggle('active', view === 'grid');
  document.getElementById('list-btn').classList.toggle('active', view === 'list');
}

// ── Delete ────────────────────────────────────────────────────
function confirmDelete(filename) {
  deleteTarget = filename;
  document.getElementById('delete-filename').textContent = filename;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  deleteTarget = null;
}

document.getElementById('confirm-delete').addEventListener('click', async () => {
  if (!deleteTarget) return;
  await fetch(`${API}/files/${encodeURIComponent(deleteTarget)}`, { method: 'DELETE' });
  closeModal();
  loadFiles();
  showToast('File deleted', 'error');
});

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'trash'} ${type}"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ── Init ──────────────────────────────────────────────────────
loadFiles();
