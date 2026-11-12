/**
 * profiles.js - 对象管理
 * 可存档多个对象的档案；切换后对象的聊天等数据随之切换。
 * 实现：为每个对象建立独立存储前缀（getStorageKey 读取 window.__currentProfileId），
 * 切换时保存目标 id 并刷新页面重新加载。
 */
(function () {
    const PROFILES_KEY = (window.APP_PREFIX || 'CHAT_APP_V3_') + 'profiles';
    const CURRENT_KEY = (window.APP_PREFIX || 'CHAT_APP_V3_') + 'currentProfile';

    // 尽早注入当前对象 id（在 core 的数据加载之前）
    try {
        const cur = localStorage.getItem(CURRENT_KEY);
        window.__currentProfileId = cur || 'default';
    } catch (e) { window.__currentProfileId = 'default'; }

    function loadProfiles() {
        try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch (e) { return []; }
    }
    function saveProfiles(list) {
        try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch (e) {}
    }

    function renderProfiles() {
        const list = document.getElementById('profiles-list');
        if (!list) return;
        const profiles = loadProfiles();
        const cur = window.__currentProfileId;
        let html = `
            <div class="profile-card${cur === 'default' ? ' active' : ''}" data-id="default">
                <div class="profile-avatar"><i class="fas fa-user"></i></div>
                <div class="profile-info"><div class="profile-name">默认对象</div>
                <div class="profile-sub">原有的全部数据</div></div>
                ${cur === 'default' ? '<span class="profile-badge">使用中</span>' : '<button class="profile-switch-btn" data-id="default">切换</button>'}
            </div>`;
        html += profiles.map(p => `
            <div class="profile-card${cur === p.id ? ' active' : ''}" data-id="${p.id}">
                <div class="profile-avatar">${p.avatar ? `<img src="${p.avatar}">` : '<i class="fas fa-user"></i>'}</div>
                <div class="profile-info"><div class="profile-name">${(p.name || '').replace(/</g, '&lt;')}</div>
                <div class="profile-sub">创建于 ${p.createdAt || '—'}</div></div>
                ${cur === p.id ? '<span class="profile-badge">使用中</span>' : '<button class="profile-switch-btn" data-id="' + p.id + '">切换</button>'}
                <button class="profile-del" data-id="${p.id}" title="删除档案"><i class="fas fa-trash-can"></i></button>
            </div>`).join('');
        if (!profiles.length) {
            html += '<div class="ad-empty" style="padding:14px 0 4px;">还没有其他对象档案<br>在下方输入称呼即可新建</div>';
        }
        list.innerHTML = html;

        list.querySelectorAll('.profile-switch-btn').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const id = btn.dataset.id;
                if (typeof confirm !== 'undefined' && !confirm('切换对象后，当前页面的聊天等数据会随之切换（需要刷新页面）。确定切换吗？')) return;
                try { localStorage.setItem(CURRENT_KEY, id); } catch (e) {}
                location.reload();
            });
        });
        list.querySelectorAll('.profile-del').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const id = btn.dataset.id;
                const profiles2 = loadProfiles();
                const p = profiles2.find(x => x.id === id);
                if (!confirm(`删除「${p ? p.name : '该对象'}」的档案吗？其所有聊天数据将被清空且无法恢复。`)) return;
                saveProfiles(profiles2.filter(x => x.id !== id));
                renderProfiles();
                if (typeof showNotification === 'function') showNotification('档案已删除', 'success', 1500);
            });
        });
    }

    function openProfilesPanel() {
        const modal = document.getElementById('profiles-modal');
        if (!modal) return;
        hideModal(document.getElementById('settings-modal'));
        renderProfiles();
        showModal(modal);
    }

    function initProfiles() {
        const entry = document.getElementById('profiles-settings');
        if (entry && !entry.dataset.pfBound) {
            entry.dataset.pfBound = '1';
            entry.addEventListener('click', openProfilesPanel);
        }
        const addBtn = document.getElementById('profile-add-btn');
        if (addBtn && !addBtn.dataset.pfBound) {
            addBtn.dataset.pfBound = '1';
            addBtn.addEventListener('click', () => {
                const input = document.getElementById('profile-name-input');
                const name = (input.value || '').trim();
                if (!name) { if (typeof showNotification === 'function') showNotification('先给新对象起个称呼吧', 'warning'); return; }
                const profiles = loadProfiles();
                const id = 'pf' + Date.now();
                profiles.push({ id, name, createdAt: new Date().toISOString().slice(0, 10), avatar: '' });
                saveProfiles(profiles);
                input.value = '';
                renderProfiles();
                if (typeof showNotification === 'function') showNotification('✓ 档案已创建，点击「切换」开始使用', 'success', 2200);
            });
        }
        const closeBtn = document.getElementById('close-profiles');
        if (closeBtn && !closeBtn.dataset.pfBound) {
            closeBtn.dataset.pfBound = '1';
            closeBtn.addEventListener('click', () => hideModal(document.getElementById('profiles-modal')));
        }
    }

    window.openProfilesPanel = openProfilesPanel;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfiles);
    } else {
        initProfiles();
    }
})();
