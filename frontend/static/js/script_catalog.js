const API_BASE = '/api/catalog/projects';
function getToken() {
    return localStorage.getItem('access_token');
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, { ...options, headers: authHeaders() });
    if (res.status === 401) {
        notifications.error('Сессия истекла. Войдите снова.');
        window.location.href = 'http://localhost:8010';
        return null;
    }
    return res;
}

const PROJECTS_PER_PAGE = 20;
let currentPage = 1;
let allProjects = [];
let lastLoadParams = {};

async function loadProjects(params = {}) {
    lastLoadParams = { ...params };
    currentPage = 1;

    const url = new URL(API_BASE, window.location.origin);
    url.searchParams.set('page', 1);
    url.searchParams.set('size', 10000);
    Object.entries(lastLoadParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
            url.searchParams.set(k, v);
        }
    });

    const res = await apiFetch(url.toString());
    if (!res) return;

    const data = await res.json();
    allProjects = data.items || data;

    renderCurrentPage();
}

function renderCurrentPage() {
    const start = (currentPage - 1) * PROJECTS_PER_PAGE;
    const pageItems = allProjects.slice(start, start + PROJECTS_PER_PAGE);
    renderProjects(pageItems);
    renderPagination();
}

function renderPagination() {
    document.getElementById('pagination')?.remove();

    const totalPages = Math.ceil(allProjects.length / PROJECTS_PER_PAGE);
    if (totalPages <= 1) return;

    const nav = document.createElement('div');
    nav.id = 'pagination';
    nav.className = 'pagination';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-arrow' + (currentPage === 1 ? ' disabled' : '');
    prevBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>`;
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => goToPage(currentPage - 1);
    nav.appendChild(prevBtn);

    const pages = getPaginationRange(currentPage, totalPages);
    pages.forEach(p => {
        if (p === '...') {
            const dots = document.createElement('span');
            dots.className = 'page-dots';
            dots.textContent = '…';
            nav.appendChild(dots);
        } else {
            const btn = document.createElement('button');
            btn.className = 'page-num' + (p === currentPage ? ' active' : '');
            btn.textContent = p;
            btn.onclick = () => goToPage(p);
            nav.appendChild(btn);
        }
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-arrow' + (currentPage === totalPages ? ' disabled' : '');
    nextBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>`;
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => goToPage(currentPage + 1);
    nav.appendChild(nextBtn);

    document.querySelector('.container').appendChild(nav);
}

function getPaginationRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
}

function goToPage(page) {
    currentPage = page;
    renderCurrentPage();
    document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });
}

function renderProjects(projects) {
    const list = document.getElementById('projectsList');
    list.innerHTML = '';

    if (!projects || projects.length === 0) {
        list.innerHTML = '<div class="project-item"><div class="project-info"><span class="project-title">Нет проектов</span></div></div>';
        return;
    }

    projects.forEach(p => {
        const tags = [];
        if (p.chapter_count !== null && p.chapter_count !== undefined) {
            tags.push(p.chapter_count === 0 ? 'без глав' : `глав: ${p.chapter_count}`);
        }
        if (p.genre) tags.push(p.genre);
        if (p.status) tags.push(p.status);

        const tagsHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');

        list.insertAdjacentHTML('beforeend', `
            <div class="project-item" data-id="${p.id}">
                <div class="project-info">
                    <span class="project-title">${escapeHtml(p.title)}</span>
                    <div class="tags">${tagsHTML}</div>
                </div>
                <div class="project-actions">
                    <button class="action-btn edit-btn" onclick="openProject(${p.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteProject(${p.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `);
    });
}

function chapterLabel(n) {
    n = parseInt(n);
    if (isNaN(n) || n === 0) return 'без глав';
    if (n <= 10) return '1–10 глав';
    if (n <= 50) return '11–50 глав';
    return '50+ глав';
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );
}

let searchTimeout;
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        localStorage.setItem('access_token', token);
        window.history.replaceState({}, '', '/catalog');
    }

    loadProjects();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentPage = 1;
                const params = {
                    search: e.target.value,
                    ...getActiveFilters()
                };
                loadProjects(params);
            }, 300);
        });
    }

    updateFilterButtonsText();
});

const activeFilters = {};

function getActiveFilters() {
    const filters = {};

    if (activeFilters.chapters_min !== undefined || activeFilters.chapters_max !== undefined) {
        if (activeFilters.chapters_min !== undefined) {
            filters.chapters_min = activeFilters.chapters_min;
        }
        if (activeFilters.chapters_max !== undefined) {
            filters.chapters_max = activeFilters.chapters_max;
        }
    }

    if (activeFilters.genre) {
        filters.genre = activeFilters.genre;
    }

    if (activeFilters.status) {
        filters.status = activeFilters.status;
    }

    return filters;
}

function updateFiltersAndLoad() {
    currentPage = 1;
    const searchValue = document.getElementById('searchInput')?.value || '';
    loadProjects({
        search: searchValue,
        ...getActiveFilters()
    });
    updateFilterButtonsText();
}

function updateFilterButtonsText() {
    const chaptersBtn = document.querySelector('.filter-wrapper .filter-btn[onclick*="chapters"]');
    if (chaptersBtn) {
        if (activeFilters.chapters_min !== undefined) {
            let label = '';
            if (activeFilters.chapters_min === 1 && activeFilters.chapters_max === 10) {
                label = '1–10 глав';
            } else if (activeFilters.chapters_min === 11 && activeFilters.chapters_max === 50) {
                label = '11–50 глав';
            } else if (activeFilters.chapters_min === 51 && activeFilters.chapters_max === null) {
                label = '50+ глав';
            }
            chaptersBtn.innerHTML = `${label} <svg class="dropdown-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`;
            chaptersBtn.style.backgroundColor = '#8fa8c8';
            chaptersBtn.style.color = 'white';
            chaptersBtn.style.borderColor = '#7a96b8';
        } else {
            chaptersBtn.innerHTML = `по кол-ву глав <svg class="dropdown-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`;
            chaptersBtn.style.backgroundColor = 'white';
            chaptersBtn.style.color = '#4a5568';
            chaptersBtn.style.borderColor = '#d0dce8';
        }
    }

    const genreBtn = document.querySelector('.filter-wrapper .filter-btn[onclick*="genre"]');
    if (genreBtn) {
        if (activeFilters.genre) {
            genreBtn.innerHTML = `${activeFilters.genre} <svg class="dropdown-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`;
            genreBtn.style.backgroundColor = '#8fa8c8';
            genreBtn.style.color = 'white';
            genreBtn.style.borderColor = '#7a96b8';
        } else {
            genreBtn.innerHTML = `по жанру <svg class="dropdown-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`;
            genreBtn.style.backgroundColor = 'white';
            genreBtn.style.color = '#4a5568';
            genreBtn.style.borderColor = '#d0dce8';
        }
    }

    const statusBtn = document.querySelector('.filter-wrapper .filter-btn[onclick*="status"]');
    if (statusBtn) {
        if (activeFilters.status) {
            statusBtn.innerHTML = `${activeFilters.status} <svg class="dropdown-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`;
            statusBtn.style.backgroundColor = '#8fa8c8';
            statusBtn.style.color = 'white';
            statusBtn.style.borderColor = '#7a96b8';
        } else {
            statusBtn.innerHTML = `по статусу <svg class="dropdown-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`;
            statusBtn.style.backgroundColor = 'white';
            statusBtn.style.color = '#4a5568';
            statusBtn.style.borderColor = '#d0dce8';
        }
    }
}

const filterOptions = {
    chapters: [
        { label: '1–10 глав', min: 1, max: 10 },
        { label: '11–50 глав', min: 11, max: 50 },
        { label: '50+ глав', min: 51, max: null }
    ],
    genre: ['роман', 'рассказ', 'повесть', 'стихи'],
    status: ['в процессе', 'завершен', 'на паузе']
};

function toggleDropdown(type) {
    closeAllDropdowns();

    const btn = document.querySelector(`[onclick="toggleDropdown('${type}')"]`);
    if (!btn) return;

    const wrapper = btn.closest('.filter-wrapper');
    if (!wrapper) return;

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.id = `dropdown-${type}`;

    const options = filterOptions[type];

    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';

        if (type === 'chapters') {
            item.textContent = opt.label;
            item.dataset.min = opt.min;
            item.dataset.max = opt.max || '';
        } else {
            item.textContent = opt;
            item.dataset.value = opt;
        }

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            applyFilter(type, opt);
        });

        menu.appendChild(item);
    });

    const resetItem = document.createElement('div');
    resetItem.className = 'dropdown-item dropdown-reset';
    resetItem.textContent = '✕ сбросить фильтр';
    resetItem.addEventListener('click', (e) => {
        e.stopPropagation();
        resetFilter(type);
    });
    menu.appendChild(resetItem);

    const oldMenu = wrapper.querySelector('.dropdown-menu');
    if (oldMenu) oldMenu.remove();

    wrapper.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

function applyFilter(type, opt) {
    if (type === 'chapters') {
        activeFilters.chapters_min = opt.min;
        activeFilters.chapters_max = opt.max;
        delete activeFilters.chapters;
    } else {
        activeFilters[type] = opt;
    }

    updateFiltersAndLoad();
    closeAllDropdowns();
}

function resetFilter(type) {
    if (type === 'chapters') {
        delete activeFilters.chapters_min;
        delete activeFilters.chapters_max;
    } else {
        delete activeFilters[type];
    }

    updateFiltersAndLoad();
    closeAllDropdowns();
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
}

function openModal(title, fields, onSave) {
    closeAllDropdowns();
    document.getElementById('modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'modal-overlay';

    const fieldsHTML = fields.map(f => {
        if (f.type === 'select') {
            const opts = f.options.map(o =>
                `<option value="${o.value}" ${f.value === o.value ? 'selected' : ''}>${o.label}</option>`
            ).join('');
            return `<label>${f.label}<select id="field-${f.key}">${opts}</select></label>`;
        }
        return `<label>${f.label}<input type="${f.type || 'text'}" id="field-${f.key}" value="${escapeHtml(f.value || '')}" placeholder="${escapeHtml(f.placeholder || '')}"></label>`;
    }).join('');

    overlay.innerHTML = `
        <div class="modal">
            <h3>${escapeHtml(title)}</h3>
            <div class="modal-fields">${fieldsHTML}</div>
            <div class="modal-actions">
                <button class="modal-cancel" onclick="document.getElementById('modal-overlay').remove()">Отмена</button>
                <button class="modal-save new-project-btn" id="modal-save-btn">Сохранить</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('modal-save-btn').onclick = () => {
        const values = {};
        fields.forEach(f => {
            const element = document.getElementById(`field-${f.key}`);
            if (element) {
                values[f.key] = element.value;
            }
        });
        onSave(values);
    };
}

function addNewProject() {
    openModal('Новый проект', [
        { key: 'title', label: 'Название', placeholder: 'Введите название' },
        { key: 'genre', label: 'Жанр', type: 'select', value: '', options: [
            { value: '', label: '— не выбрано —' },
            { value: 'роман', label: 'Роман' },
            { value: 'рассказ', label: 'Рассказ' },
            { value: 'повесть', label: 'Повесть' },
            { value: 'стихи', label: 'Стихи' }
        ]},
    ], async (values) => {
        if (!values.title.trim()) {
            notifications.warning('Введите название проекта');
            return;
        }

        const body = {
            title: values.title.trim()
        };

        if (values.genre) body.genre = values.genre;

        const res = await apiFetch(API_BASE, {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (!res) return;

        if (res.status === 201) {
            document.getElementById('modal-overlay').remove();
            notifications.success('Проект создан');
            loadProjects({ search: document.getElementById('searchInput')?.value || '' });
        } else {
            const err = await res.json();
            notifications.error(err.detail || 'Ошибка при создании');
        }
    });
}

function openProject(id) {
    const token = localStorage.getItem('access_token');
    window.location.href = `http://localhost:8012/project/${id}?token=${token}`;
}

async function deleteProject(id) {
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <h3>Удалить проект?</h3>
            <p style="color:#718096;font-size:14px;margin-bottom:20px">Это действие нельзя отменить.</p>
            <div class="modal-actions">
                <button class="modal-cancel" onclick="document.getElementById('modal-overlay').remove()">Отмена</button>
                <button class="new-project-btn" style="background:#e53e3e" id="confirm-delete">Удалить</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    document.getElementById('confirm-delete').onclick = async () => {
        const res = await apiFetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        if (!res) return;

        document.getElementById('modal-overlay').remove();

        if (res.status === 204) {
            const item = document.querySelector(`[data-id="${id}"]`);
            if (item) {
                item.style.cssText = 'opacity:0;transform:translateX(-20px);transition:all .3s';
                setTimeout(() => {
                    item.remove();
                    notifications.success('Проект удалён');
                }, 300);
            }
        } else {
            notifications.error('Ошибка при удалении');
        }
    };
}
window.toggleDropdown = toggleDropdown;
window.addNewProject = addNewProject;
window.openEditModal = openEditModal;
window.deleteProject = deleteProject;

function logout() {
    localStorage.removeItem('access_token');
    window.location.href = 'http://localhost:8010';
}
window.logout = logout;