const PROJECT_ID = (() => {
    const m = window.location.pathname.match(/\/project\/(\d+)/);
    return m ? parseInt(m[1]) : null;
})();

const API_BASE = `http://localhost:8012/api/projects/${PROJECT_ID}`;

const state = {
    title: '',
    description: '',
    tags: {},
    characters: [],
    chapters: [],
    editingCharIndex: null,
    editingChapterId: null,
    charImgData: null,
    charImgFull: null,
    panelHidden: false,
    editMode: false,
    cropImg: null,
    cropScale: 1,
    cropImgX: 0,
    cropImgY: 0,
    _lastPinchDist: null,
};

function $(id) { return document.getElementById(id); }

function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );
}

function closeModal(id, event) {
    if (event && event.target !== event.currentTarget) return;
    $(id).style.display = 'none';
}

function openModal(id) { $(id).style.display = 'flex'; }

function getToken() { return localStorage.getItem('access_token'); }

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
            ...(options.headers || {})
        }
    });
    if (res.status === 401) {
        notifications.error('Сессия истекла. Войдите снова.');
        window.location.href = 'http://localhost:8010';
        return null;
    }
    return res;
}

async function loadProject() {
    if (!PROJECT_ID) { notifications.error('Неверный URL проекта'); return; }

    const res = await apiFetch(API_BASE);
    if (!res) return;

    if (!res.ok) {
        notifications.error('Не удалось загрузить проект');
        return;
    }

    const project = await res.json();

    state.title       = project.title;
    state.description = project.description || '';
    state.characters  = project.characters;
    state.chapters    = project.chapters;

    state.tags = {};
    if (project.parts)  state.tags['parts']  = project.parts;
    if (project.genre)  state.tags['genre']  = project.genre;
    if (project.status) state.tags['status'] = project.status;

    $('projectTitle').value       = state.title;
    $('projectTitleDisplay').textContent = state.title;
    $('projectDesc').value        = state.description;

    Object.entries(state.tags).forEach(([group, val]) => {
        const el = document.querySelector(`.tag[data-group="${group}"][data-value="${val}"]`);
        if (el) el.classList.add('active');
    });

    renderTagsView();
    renderCharacters();
    renderChapters();
}

function toggleRightPanel() {
    state.panelHidden = !state.panelHidden;
    const panel     = $('rightPanel');
    const showBtn   = $('btnShowPanel');
    const toggleBtn = $('btnTogglePanel');
    const wrapper   = $('projectWrapper');

    if (state.panelHidden) {
        panel.classList.add('hidden');
        showBtn.style.display = 'flex';
        if (toggleBtn) toggleBtn.textContent = '›';
        wrapper.classList.remove('panel-visible');
    } else {
        panel.classList.remove('hidden');
        showBtn.style.display = 'none';
        if (toggleBtn) toggleBtn.textContent = '‹';
        wrapper.classList.add('panel-visible');
    }
}

function toggleEditMode() {
    state.editMode = !state.editMode;
    const desc     = $('projectDesc');
    const saveBtn  = $('btnSaveProject');
    const editBtn  = $('btnEditProject');
    const tagsView = $('tagsViewMode');
    const tagsEdit = $('tagsEditMode');

    if (state.editMode) {
        desc.disabled = false;
        saveBtn.style.display = 'flex';
        editBtn.classList.add('active');
        tagsView.style.display = 'none';
        tagsEdit.style.display = 'block';
    } else {
        saveProjectInfo();
    }
}

async function saveProjectInfo() {
    state.editMode = false;
    const desc = $('projectDesc');
    desc.disabled = true;
    $('btnSaveProject').style.display = 'none';
    $('btnEditProject').classList.remove('active');
    $('tagsViewMode').style.display = 'flex';
    $('tagsEditMode').style.display = 'none';
    renderTagsView();

    const body = {
        title:       $('projectTitle').value.trim() || state.title,
        description: desc.value.trim() || null,
        genre:       state.tags['genre']  || null,
        status:      state.tags['status'] || null,
        parts:       state.tags['parts']  || null,
    };

    const res = await apiFetch(API_BASE, { method: 'PATCH', body: JSON.stringify(body) });
    if (!res) return;

    if (res.ok) {
        const updated = await res.json();
        state.title       = updated.title;
        state.description = updated.description || '';
        $('projectTitleDisplay').textContent = state.title;
        notifications.success('Информация о проекте обновлена');
    } else {
        notifications.error('Ошибка при сохранении');
    }
}

function renderTagsView() {
    const container = $('tagsViewMode');
    container.innerHTML = '';
    Object.values(state.tags).forEach(val => {
        const span = document.createElement('span');
        span.className = 'tag active';
        span.textContent = val;
        container.appendChild(span);
    });
}

function syncTitle(val) {
    state.title = val || 'Название';
    $('projectTitleDisplay').textContent = state.title;
}

function toggleTag(el) {
    const group   = el.dataset.group;
    const val     = el.dataset.value;
    const isActive = el.classList.contains('active');

    document.querySelectorAll(`.tag[data-group="${group}"]`).forEach(t => t.classList.remove('active'));

    if (!isActive) {
        el.classList.add('active');
        state.tags[group] = val;
    } else {
        delete state.tags[group];
    }
}

function scrollChars(dir) {
    $('charactersList').scrollBy({ left: dir * 124, behavior: 'smooth' });
}

function renderCharacters() {
    const list = $('charactersList');
    list.innerHTML = '';

    state.characters.forEach((ch, i) => {
        const card = document.createElement('div');
        card.className = 'character-card';

        const imgHtml = ch.photo
            ? `<img src="${ch.photo}" alt="${escHtml(ch.name)}">`
            : `<span class="character-placeholder">${ch.short_desc ? escHtml(ch.short_desc) : 'нет фото'}</span>`;

        card.innerHTML = `
            <span class="character-name">${escHtml(ch.name)}</span>
            <div class="character-img" onclick="openCharView(${i})">
                ${imgHtml}
                <button class="char-edit-btn" onclick="event.stopPropagation(); openCharEditModal(${i})" title="Редактировать">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
            </div>
        `;

        card.querySelector('.character-name').onclick = (e) => {
            e.stopPropagation();
            openCharView(i);
        };

        list.appendChild(card);
    });
}

function openCharView(index) {
    const ch = state.characters[index];
    $('charViewName').textContent = ch.name;

    const photoImg         = $('charViewPhotoImg');
    const photoPlaceholder = $('charViewPhotoPlaceholder');
    const photoHint        = $('charViewPhotoHint');

    if (ch.photo) {
        photoImg.src = ch.photo;
        photoImg.dataset.full = ch.photo;
        photoImg.style.display = 'block';
        photoPlaceholder.style.display = 'none';
        photoHint.style.display = 'flex';
    } else {
        photoImg.style.display = 'none';
        photoImg.dataset.full = '';
        photoPlaceholder.style.display = 'block';
        photoHint.style.display = 'none';
    }

    const fields = $('charViewFields');
    fields.innerHTML = '';

    const fieldDefs = [
        ['Роль',           ch.role],
        ['Пол',            ch.gender === 'другое' ? ch.gender_other : ch.gender],
        ['Дата рождения',  ch.birthdate],
        ['Возраст',        ch.age ? `${ch.age} лет` : ''],
        ['Статус',         ch.char_status],
        ['Локация',        ch.location],
        ['Черты',          ch.features],
        ['Характер',       ch.personality],
        ['Описание',       ch.desc_full],
    ];

    fieldDefs.forEach(([label, val]) => {
        if (!val) return;
        const row = document.createElement('div');
        row.className = 'view-field-row';
        row.innerHTML = `<span class="view-field-label">${escHtml(label)}:</span><span class="view-field-value">${escHtml(String(val))}</span>`;
        fields.appendChild(row);
    });

    if (ch.custom_labels && ch.custom_labels.length) {
        ch.custom_labels.forEach(lb => {
            if (!lb.key && !lb.value) return;
            const row = document.createElement('div');
            row.className = 'view-field-row';
            row.innerHTML = `<span class="view-field-label">${escHtml(lb.key)}:</span><span class="view-field-value">${escHtml(lb.value || '')}</span>`;
            fields.appendChild(row);
        });
    }

    if (!fields.children.length) {
        fields.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">Дополнительных данных нет</span>';
    }

    openModal('charViewModal');
}

function openFullscreenPhoto() {
    const src = $('charViewPhotoImg').dataset.full;
    if (!src) return;
    $('fullscreenImg').src = src;
    $('fullscreenPhoto').style.display = 'flex';
}

function closeFullscreen() {
    $('fullscreenPhoto').style.display = 'none';
}

function openCharEditModal(index) {
    state.editingCharIndex = (index !== null && index !== undefined) ? index : null;
    state.charImgData = null;

    const isEdit = state.editingCharIndex !== null;
    $('charEditModalTitle').textContent = isEdit ? 'Редактировать персонажа' : 'Новый персонаж';
    $('btnDeleteChar').style.display = isEdit ? 'inline-flex' : 'none';

    if (isEdit) {
        const ch = state.characters[index];
        $('charName').value        = ch.name || '';
        $('charShortDesc').value   = ch.short_desc || '';
        updateShortDescCounter($('charShortDesc'));
        $('charRole').value        = ch.role || '';
        $('charGender').value      = ch.gender || '';
        $('charGenderOther').value = ch.gender_other || '';
        $('charBirthdate').value   = ch.birthdate || '';
        $('charAge').value         = ch.age || '';
        $('charStatus').value      = ch.char_status || '';
        $('charLocation').value    = ch.location || '';
        $('charFeatures').value    = ch.features || '';
        $('charPersonality').value = ch.personality || '';
        $('charDescFull').value    = ch.desc_full || '';
        state.charImgData          = ch.photo || null;
        toggleGenderOther($('charGender'));
        renderCustomLabels(ch.custom_labels || []);
    } else {
        ['charName','charShortDesc','charRole','charGender','charGenderOther','charBirthdate',
         'charAge','charStatus','charLocation','charFeatures','charPersonality','charDescFull']
            .forEach(id => { $(id).value = ''; });
        updateShortDescCounter($('charShortDesc'));
        $('genderOtherWrap').style.display = 'none';
        renderCustomLabels([]);
    }

    updateCharImgPreviewUI();
    openModal('charEditModal');
    setTimeout(() => $('charName').focus(), 50);
}

function updateShortDescCounter(input) {
    const counter = $('charShortDescCounter');
    if (counter) counter.textContent = `${input.value.length} / 50`;
}

function updateCharImgPreviewUI() {
    const img         = $('charImgPreviewImg');
    const placeholder = $('charImgPlaceholder');
    if (state.charImgData) {
        img.src = state.charImgData;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        placeholder.style.display = 'block';
    }
}

function toggleGenderOther(sel) {
    $('genderOtherWrap').style.display = sel.value === 'другое' ? 'flex' : 'none';
}

function formatDate(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length >= 3) v = v.slice(0,2) + '.' + v.slice(2);
    if (v.length >= 6) v = v.slice(0,5) + '.' + v.slice(5,9);
    input.value = v;
}

function renderCustomLabels(labels) {
    const list = $('customLabelsList');
    list.innerHTML = '';
    labels.forEach(lb => addCustomLabelRow(lb.key, lb.value || ''));
}

function addCustomLabel() { addCustomLabelRow('', ''); }

function addCustomLabelRow(key, value) {
    const list = $('customLabelsList');
    const row  = document.createElement('div');
    row.className = 'custom-label-row';
    row.innerHTML = `
        <input type="text" class="field-input" placeholder="Название" value="${escHtml(key)}" data-field="key">
        <input type="text" class="field-input" placeholder="Значение" value="${escHtml(value)}" data-field="value">
        <button class="btn-remove-label" onclick="this.parentElement.remove()">×</button>
    `;
    list.appendChild(row);
}

function collectCustomLabels() {
    return Array.from($('customLabelsList').querySelectorAll('.custom-label-row')).map(row => ({
        key:   row.querySelector('[data-field="key"]').value.trim(),
        value: row.querySelector('[data-field="value"]').value.trim(),
    })).filter(lb => lb.key || lb.value);
}

async function saveChar() {
    const name = $('charName').value.trim();
    if (!name) { $('charName').focus(); return; }

    const isEdit = state.editingCharIndex !== null;
    const gender = $('charGender').value;

    const body = {
        name,
        short_desc:   $('charShortDesc').value.trim() || null,
        role:         $('charRole').value || null,
        gender:       gender || null,
        gender_other: gender === 'другое' ? $('charGenderOther').value.trim() : null,
        birthdate:    $('charBirthdate').value.trim() || null,
        age:          parseInt($('charAge').value) || null,
        char_status:  $('charStatus').value || null,
        location:     $('charLocation').value.trim() || null,
        features:     $('charFeatures').value.trim() || null,
        personality:  $('charPersonality').value.trim() || null,
        desc_full:    $('charDescFull').value.trim() || null,
        photo:        state.charImgData || null,
        custom_labels: collectCustomLabels(),
    };

    let res;
    if (isEdit) {
        const charId = state.characters[state.editingCharIndex].id;
        res = await apiFetch(`${API_BASE}/characters/${charId}`, {
            method: 'PATCH', body: JSON.stringify(body)
        });
    } else {
        res = await apiFetch(`${API_BASE}/characters`, {
            method: 'POST', body: JSON.stringify(body)
        });
    }

    if (!res) return;

    if (res.ok || res.status === 201) {
        const saved = await res.json();
        if (isEdit) {
            state.characters[state.editingCharIndex] = saved;
            notifications.success('Карточка персонажа обновлена');
        } else {
            state.characters.push(saved);
            notifications.success('Персонаж добавлен');
        }
        closeModal('charEditModal');
        renderCharacters();
    } else {
        const err = await res.json().catch(() => ({}));
        notifications.error(err.detail || 'Ошибка при сохранении персонажа');
    }
}

async function deleteChar() {
    if (state.editingCharIndex === null) return;
    const char   = state.characters[state.editingCharIndex];
    const charId = char.id;

    const res = await apiFetch(`${API_BASE}/characters/${charId}`, { method: 'DELETE' });
    if (!res) return;

    if (res.status === 204) {
        state.characters.splice(state.editingCharIndex, 1);
        closeModal('charEditModal');
        renderCharacters();
        notifications.success('Персонаж удалён');
    } else {
        notifications.error('Ошибка при удалении персонажа');
    }
}

function openCropModal() { openModal('cropModal'); }

function loadCropImage(input) {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => { state.cropImg = img; initCrop(img); };
        img.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
}

function initCrop(img) {
    const container = $('cropContainer');
    const canvas    = $('cropCanvas');
    const frame     = $('cropFrame');
    const noImage   = $('cropNoImage');
    const cw = container.clientWidth, ch = container.clientHeight;

    const scale = Math.max(cw / img.width, ch / img.height);
    state.cropScale = scale;
    state.cropImgX  = (cw - img.width  * scale) / 2;
    state.cropImgY  = (ch - img.height * scale) / 2;

    canvas.width  = cw; canvas.height = ch;
    canvas.style.width  = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.style.display = 'block';
    frame.style.display  = 'block';
    noImage.style.display = 'none';

    drawCrop();
    setupCropDrag(canvas, container);
}

function drawCrop() {
    const canvas = $('cropCanvas');
    const ctx    = canvas.getContext('2d');
    if (!state.cropImg) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.cropImg, state.cropImgX, state.cropImgY,
        state.cropImg.width * state.cropScale, state.cropImg.height * state.cropScale);
}

function setupCropDrag(canvas) {
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);

    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

    newCanvas.addEventListener('mousedown', e => {
        dragging = true; sx = e.clientX; sy = e.clientY;
        ox = state.cropImgX; oy = state.cropImgY; e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        state.cropImgX = ox + (e.clientX - sx);
        state.cropImgY = oy + (e.clientY - sy);
        drawCrop();
    });
    window.addEventListener('mouseup', () => { dragging = false; });

    newCanvas.addEventListener('wheel', e => {
        e.preventDefault();
        const factor   = e.deltaY < 0 ? 1.1 : 0.9;
        const newScale = Math.max(0.2, state.cropScale * factor);
        const rect     = newCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        state.cropImgX  = cx - (cx - state.cropImgX) * (newScale / state.cropScale);
        state.cropImgY  = cy - (cy - state.cropImgY) * (newScale / state.cropScale);
        state.cropScale = newScale;
        drawCrop();
    }, { passive: false });

    newCanvas.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            dragging = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
            ox = state.cropImgX; oy = state.cropImgY;
        }
        e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', e => {
        if (e.touches.length === 1 && dragging) {
            state.cropImgX = ox + (e.touches[0].clientX - sx);
            state.cropImgY = oy + (e.touches[0].clientY - sy);
            drawCrop();
        } else if (e.touches.length === 2) {
            const d = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (state._lastPinchDist) {
                state.cropScale = Math.max(0.2, state.cropScale * (d / state._lastPinchDist));
                drawCrop();
            }
            state._lastPinchDist = d;
        }
    });
    window.addEventListener('touchend', e => {
        if (e.touches.length < 2) state._lastPinchDist = null;
        if (e.touches.length === 0) dragging = false;
    });
}

function applyCrop() {
    const frame     = $('cropFrame');
    const container = $('cropContainer');
    if (!state.cropImg) return;

    const cr = container.getBoundingClientRect();
    const fr = frame.getBoundingClientRect();
    const fx = fr.left - cr.left, fy = fr.top - cr.top;

    const out = document.createElement('canvas');
    out.width = out.height = 200;
    out.getContext('2d').drawImage(
        state.cropImg,
        (fx - state.cropImgX) / state.cropScale,
        (fy - state.cropImgY) / state.cropScale,
        fr.width  / state.cropScale,
        fr.height / state.cropScale,
        0, 0, 200, 200
    );

    state.charImgData = out.toDataURL('image/jpeg', 0.9);
    updateCharImgPreviewUI();
    closeModal('cropModal');
}

function openChapterModal(index) {
    state.editingChapterId = null;

    if (index !== null && index !== undefined) {
        const ch = state.chapters[index];
        state.editingChapterId = ch.id;
        $('chapterModalTitle').textContent = 'Редактировать главу';
        $('chapterName').value = ch.title;
    } else {
        $('chapterModalTitle').textContent = 'Новая глава';
        $('chapterName').value = '';
    }

    openModal('chapterModal');
    setTimeout(() => $('chapterName').focus(), 50);
}

async function saveChapter() {
    const name = $('chapterName').value.trim();
    if (!name) { $('chapterName').focus(); return; }

    const isEdit = state.editingChapterId !== null;
    let res;

    if (isEdit) {
        res = await apiFetch(`${API_BASE}/chapters/${state.editingChapterId}`, {
            method: 'PATCH',
            body: JSON.stringify({ title: name })
        });
    } else {
        res = await apiFetch(`${API_BASE}/chapters`, {
            method: 'POST',
            body: JSON.stringify({ title: name, order: state.chapters.length })
        });
    }

    if (!res) return;

    if (res.ok || res.status === 201) {
        const saved = await res.json();
        if (isEdit) {
            const idx = state.chapters.findIndex(c => c.id === state.editingChapterId);
            if (idx !== -1) state.chapters[idx] = saved;
            notifications.success(`Глава «${name}» обновлена`);
        } else {
            state.chapters.push(saved);
            notifications.success(`Глава «${name}» добавлена`);
        }
        closeModal('chapterModal');
        renderChapters();
    } else {
        const err = await res.json().catch(() => ({}));
        notifications.error(err.detail || 'Ошибка при сохранении главы');
    }
}

function renderChapters() {
    const list  = $('chaptersList');
    const empty = $('chaptersEmpty');
    list.innerHTML = '';

    $('chapterBadge').textContent = `Глав: ${state.chapters.length}`;

    if (state.chapters.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    state.chapters.forEach((ch, i) => {
        const item = document.createElement('div');
        item.className = 'chapter-item';
        item.innerHTML = `
            <span class="chapter-title">${escHtml(ch.title)}</span>
            <span class="chapter-chars">символов: ${(ch.char_count || 0).toLocaleString('ru')}</span>
            <button class="btn-edit-chapter" onclick="openChapterModal(${i})" title="Редактировать">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
        `;
        list.appendChild(item);
    });
}

function confirmDelete() { openModal('deleteModal'); }

async function deleteProject() {
    closeModal('deleteModal');
    const res = await apiFetch(API_BASE, { method: 'DELETE' });
    if (!res) return;
    if (res.status === 204) {
        window.location.href = 'http://localhost:8011/catalog';
    } else {
        notifications.error('Ошибка при удалении проекта');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
        localStorage.setItem('access_token', urlToken);
        window.history.replaceState({}, '', window.location.pathname);
    }

    loadProject();
    toggleRightPanel();

    const shortDescInput = $('charShortDesc');
    if (shortDescInput) {
        shortDescInput.addEventListener('input', () => updateShortDescCounter(shortDescInput));
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['charViewModal','charEditModal','cropModal','chapterModal','deleteModal','fullscreenPhoto']
                .forEach(id => { $(id).style.display = 'none'; });
        }
    });
});
function goBack() { window.location.href = 'http://localhost:8011/catalog'; }