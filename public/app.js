document.addEventListener('DOMContentLoaded', () => {
  const notesContainer = document.getElementById('notesContainer');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const resetFilterBtn = document.getElementById('resetFilterBtn');
  const totalUploadsStat = document.getElementById('totalUploadsStat');
  const totalDownloadsStat = document.getElementById('totalDownloadsStat');

  // Modal elements
  const uploadModal = document.getElementById('uploadModal');
  const openUploadModalBtn = document.getElementById('openUploadModalBtn');
  const closeUploadModalBtn = document.getElementById('closeUploadModalBtn');
  const cancelUploadBtn = document.getElementById('cancelUploadBtn');
  const uploadForm = document.getElementById('uploadForm');
  const filterMyUploadsBtn = document.getElementById('filterMyUploadsBtn');

  // Load Notes from API
  async function fetchNotes(searchQuery = '') {
    try {
      let url = '/api/notes';
      if (searchQuery) {
        url += `?search=${encodeURIComponent(searchQuery)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      const notes = json.data || [];
      renderNotes(notes);

      // Update total uploads metric
      if (!searchQuery && totalUploadsStat) {
        totalUploadsStat.textContent = notes.length;
        const totalDls = notes.reduce((sum, item) => sum + (item.downloads || 0), 0);
        if (totalDownloadsStat) totalDownloadsStat.textContent = 100 + totalDls;
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
      notesContainer.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: red;">Gagal memuat catatan: ${err.message}</p>`;
    }
  }

  // Render cards
  function renderNotes(notes) {
    if (!notes || notes.length === 0) {
      notesContainer.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b;">
          <i class="fa-regular fa-folder-open" style="font-size: 40px; margin-bottom: 12px; color: #94a3b8;"></i>
          <p>Belum ada catatan yang sesuai dengan pencarian Anda.</p>
        </div>
      `;
      return;
    }

    notesContainer.innerHTML = notes.map(note => {
      return `
        <div class="note-card">
          <div class="note-preview">
            <span class="note-badge">${escapeHtml(note.course_code)}</span>
            <i class="fa-regular fa-file-pdf note-pdf-icon"></i>
          </div>
          <div class="note-info">
            <h3 class="note-title" title="${escapeHtml(note.title)}">${escapeHtml(note.title)}</h3>
            <p class="note-desc">${escapeHtml(note.description || 'Tidak ada deskripsi.')}</p>
            <div class="note-meta">
              <span><i class="fa-solid fa-user-pen"></i> ${escapeHtml(note.author || 'Mahasiswa')}</span>
              <button class="btn-download" onclick="downloadNote(${note.id})">
                <i class="fa-solid fa-download"></i> ${note.downloads || 0}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Trigger Download API
  window.downloadNote = async function(id) {
    try {
      const res = await fetch(`/api/notes/${id}/download`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(`Unduhan berhasil untuk: ${data.data.title}\nFile: ${data.data.file_name}`);
        fetchNotes(searchInput.value.trim());
      }
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  // Search Event
  function handleSearch() {
    const query = searchInput.value.trim();
    fetchNotes(query);
  }

  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  resetFilterBtn.addEventListener('click', () => {
    searchInput.value = '';
    fetchNotes();
  });

  if (filterMyUploadsBtn) {
    filterMyUploadsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      searchInput.value = 'Cybersmith';
      handleSearch();
    });
  }

  // Modal Triggers
  openUploadModalBtn.addEventListener('click', () => {
    uploadModal.classList.add('active');
  });

  function closeModal() {
    uploadModal.classList.remove('active');
    uploadForm.reset();
  }

  closeUploadModalBtn.addEventListener('click', closeModal);
  cancelUploadBtn.addEventListener('click', closeModal);
  uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) closeModal();
  });

  // Handle Note Submission (POST /api/notes)
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('noteTitle').value.trim(),
      course_code: document.getElementById('courseCode').value.trim(),
      author: document.getElementById('noteAuthor').value.trim() || 'Cybersmith',
      description: document.getElementById('noteDescription').value.trim(),
      file_name: document.getElementById('fileName').value.trim() || 'catatan-kuliah.pdf',
    };

    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 201) {
        alert('Catatan berhasil dipublikasikan!');
        closeModal();
        fetchNotes();
      } else {
        const errorData = await res.json();
        alert('Gagal mengunggah catatan: ' + (errorData.error || 'Server error'));
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi: ' + err.message);
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial Load
  fetchNotes();
});
