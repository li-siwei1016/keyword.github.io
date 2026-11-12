/**
 * memo.js - 备忘录
 * 供我方记录待办事项；由对方在聊天界面适时提醒（每 5 分钟检查一次，未到期事项按概率提醒，每条每天最多一次）。
 */
(function () {
    let memoData = []; // {id, text, due, done, remindedDay}
    let memoLoaded = false;
    let memoTimer = null;

    async function loadMemo() {
        if (memoLoaded) return;
        if (typeof SESSION_ID === 'undefined' || !SESSION_ID) {
            if (typeof window.__waitSession === 'function') window.__waitSession(loadMemo);
            return;
        }
        try {
            const saved = await localforage.getItem(getStorageKey('memo'));
            if (Array.isArray(saved)) memoData = saved;
        } catch (e) { console.warn('[memo] 读取失败', e); }
        memoLoaded = true;
    }

    function saveMemo() {
        try { localforage.setItem(getStorageKey('memo'), memoData); } catch (e) {}
    }

    function todayStr() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function renderMemoList() {
        const list = document.getElementById('memo-list');
        if (!list) return;
        const pending = memoData.filter(m => !m.done);
        const done = memoData.filter(m => m.done);
        const renderItem = (m) => `
            <div class="memo-item${m.done ? ' done' : ''}" data-id="${m.id}">
                <button class="memo-check" title="${m.done ? '标记未完成' : '标记完成'}"><i class="fas ${m.done ? 'fa-circle-check' : 'fa-circle'}"></i></button>
                <div class="memo-body">
                    <div class="memo-text">${(m.text || '').replace(/</g, '&lt;')}</div>
                    ${m.due ? `<div class="memo-due"><i class="fas fa-calendar"></i> ${m.due}${m.due < todayStr() && !m.done ? ' · 已过期' : ''}</div>` : ''}
                    ${!m.done && m.remindedDay === todayStr() ? '<div class="memo-reminded"><i class="fas fa-bell"></i> Ta 提醒过啦</div>' : ''}
                </div>
                <button class="memo-del" title="删除"><i class="fas fa-trash-can"></i></button>
            </div>`;
        let html = '';
        if (pending.length) html += '<div class="memo-group-label">待完成</div>' + pending.map(renderItem).join('');
        if (done.length) html += '<div class="memo-group-label">已完成</div>' + done.map(renderItem).join('');
        if (!memoData.length) html = '<div class="ad-empty">还没有待办事项<br>把想做的事记下来，让 Ta 陪着你完成</div>';
        list.innerHTML = html;

        list.querySelectorAll('.memo-item').forEach(item => {
            const id = item.dataset.id;
            item.querySelector('.memo-check').addEventListener('click', () => {
                const m = memoData.find(x => String(x.id) === String(id));
                if (m) { m.done = !m.done; saveMemo(); renderMemoList(); }
            });
            item.querySelector('.memo-del').addEventListener('click', () => {
                memoData = memoData.filter(x => String(x.id) !== String(id));
                saveMemo();
                renderMemoList();
                if (typeof showNotification === 'function') showNotification('已删除', 'success', 1200);
            });
        });
    }

    function openMemoPanel() {
        const modal = document.getElementById('memo-modal');
        if (!modal) return;
        hideModal(document.getElementById('advanced-modal'));
        loadMemo().then(() => {
            renderMemoList();
            const dateInput = document.getElementById('memo-date-input');
            if (dateInput) dateInput.value = '';
            const textInput = document.getElementById('memo-text-input');
            if (textInput) textInput.value = '';
            showModal(modal);
        });
    }

    /* -------- 对方提醒 -------- */
    const REMINDER_TEMPLATES = [
        t => `备忘录里还挂着「${t}」呢，别忘了呀。`,
        t => `提醒你一下，你的待办「${t}」还没完成哦，要不要现在去做？`,
        t => `看到你备忘录里写着「${t}」，我很期待你完成它的样子。`,
        t => `别忘了「${t}」呀，做完记得来告诉我。`
    ];

    function maybeRemind() {
        if (document.hidden) return;
        if (typeof settings !== 'undefined' && settings.memoRemindEnabled === false) return;
        const pending = memoData.filter(m => !m.done && m.remindedDay !== todayStr());
        if (!pending.length) return;
        if (Math.random() > 0.35) return;
        const m = pending[Math.floor(Math.random() * pending.length)];
        const tpl = REMINDER_TEMPLATES[Math.floor(Math.random() * REMINDER_TEMPLATES.length)];
        m.remindedDay = todayStr();
        saveMemo();
        if (typeof addMessage === 'function') {
            addMessage({ sender: 'partner', type: 'normal', text: tpl(m.text) });
        }
        const list = document.getElementById('memo-list');
        if (list && document.getElementById('memo-modal') && document.getElementById('memo-modal').style.display === 'flex') renderMemoList();
    }

    function initMemoModule() {
        const entry = document.getElementById('memo-function');
        if (entry && !entry.dataset.memoBound) {
            entry.dataset.memoBound = '1';
            entry.addEventListener('click', openMemoPanel);
        }
        const addBtn = document.getElementById('memo-add-btn');
        if (addBtn && !addBtn.dataset.memoBound) {
            addBtn.dataset.memoBound = '1';
            addBtn.addEventListener('click', () => {
                const textInput = document.getElementById('memo-text-input');
                const dateInput = document.getElementById('memo-date-input');
                const text = (textInput.value || '').trim();
                if (!text) { if (typeof showNotification === 'function') showNotification('先写下要做什么吧', 'warning'); return; }
                loadMemo().then(() => {
                    memoData.unshift({
                        id: Date.now() + '_' + Math.floor(Math.random() * 999),
                        text: text,
                        due: dateInput.value || '',
                        done: false,
                        remindedDay: ''
                    });
                    saveMemo();
                    renderMemoList();
                    textInput.value = ''; dateInput.value = '';
                    if (typeof showNotification === 'function') showNotification('✓ 已加入备忘录，Ta 会提醒你的', 'success', 1800);
                });
            });
        }
        const closeBtn = document.getElementById('close-memo');
        if (closeBtn && !closeBtn.dataset.memoBound) {
            closeBtn.dataset.memoBound = '1';
            closeBtn.addEventListener('click', () => hideModal(document.getElementById('memo-modal')));
        }
        // 回车快速添加
        const textInput = document.getElementById('memo-text-input');
        if (textInput && !textInput.dataset.memoBound) {
            textInput.dataset.memoBound = '1';
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
            });
        }
        // 定时提醒
        if (!memoTimer) {
            loadMemo();
            memoTimer = setInterval(maybeRemind, 5 * 60 * 1000);
        }
    }

    window.openMemoPanel = openMemoPanel;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMemoModule);
    } else {
        initMemoModule();
    }
})();
