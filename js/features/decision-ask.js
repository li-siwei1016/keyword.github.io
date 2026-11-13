/**
 * decision-ask.js - 询问 · 抉择
 * 我方自定义问题 + 自定义答案，发送到聊天页面由对方选择，并保存使用记录。
 */

let decisionHistory = [];        // [{ id, question, options:[], chosen, time }]
let decisionDraftOptions = ['', ''];

function adEscape(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function adTimeLabel(ts) {
    const diff = Date.now() - Number(ts || 0);
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

async function loadDecisionHistory() {
    try {
        const saved = await localforage.getItem(getStorageKey('decisionHistory'));
        if (Array.isArray(saved)) decisionHistory = saved;
    } catch (e) {
        console.warn('[decision-ask] 记录读取失败', e);
    }
}

function saveDecisionHistory() {
    try {
        localforage.setItem(getStorageKey('decisionHistory'), decisionHistory);
    } catch (e) {
        console.warn('[decision-ask] 记录保存失败', e);
    }
}

/* ---------- 选项编辑 ---------- */
function renderDecisionOptions() {
    const list = document.getElementById('ad-options-list');
    const countEl = document.getElementById('ad-option-count');
    if (!list) return;

    list.innerHTML = decisionDraftOptions.map((val, i) => `
        <div class="ad-option-row">
            <span class="ad-option-index">${i + 1}</span>
            <input class="ad-option-input" type="text" data-index="${i}" value="${adEscape(val)}" placeholder="答案 ${i + 1}">
            ${decisionDraftOptions.length > 2 ? `<button class="ad-option-remove" data-remove="${i}" title="删除"><i class="fas fa-times"></i></button>` : ''}
        </div>
    `).join('');

    if (countEl) countEl.textContent = decisionDraftOptions.length + ' 项';

    list.querySelectorAll('.ad-option-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            decisionDraftOptions[idx] = e.target.value;
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
        });
    });

    list.querySelectorAll('.ad-option-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.remove, 10);
            decisionDraftOptions.splice(idx, 1);
            if (decisionDraftOptions.length < 2) decisionDraftOptions.push('');
            renderDecisionOptions();
        });
    });
}

/* ---------- 使用记录 ---------- */
function renderDecisionHistory() {
    const list = document.getElementById('ad-history-list');
    const countEl = document.getElementById('ad-history-count');
    if (!list) return;

    if (countEl) countEl.textContent = decisionHistory.length;

    if (!decisionHistory.length) {
        list.innerHTML = '<div class="ad-empty">还没有记录，问 Ta 一个问题吧</div>';
        return;
    }

    list.innerHTML = decisionHistory.slice(0, 30).map(item => `
        <div class="ad-history-item" data-record="${adEscape(item.id)}">
            <div class="ad-history-q">${adEscape(item.question)}</div>
            <div class="ad-history-a">${adEscape(item.chosen || '—')}
                <span class="ad-history-time">${adTimeLabel(item.time)}</span>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.ad-history-item').forEach(el => {
        el.addEventListener('click', () => {
            const rec = decisionHistory.find(r => String(r.id) === String(el.dataset.record));
            if (!rec) return;
            const qEl = document.getElementById('ad-question-input');
            if (qEl) qEl.value = rec.question || '';
            decisionDraftOptions = (rec.options && rec.options.length >= 2) ? rec.options.slice() : ['', ''];
            renderDecisionOptions();
            if (typeof showNotification === 'function') showNotification('已填入问题，可修改后再问一次', 'info', 1600);
        });
    });
}

function openDecisionPanel() {
    const qEl = document.getElementById('ad-question-input');
    if (qEl && !qEl.value) qEl.value = '';
    renderDecisionOptions();
    renderDecisionHistory();
    loadDecisionHistory().then(renderDecisionHistory);
}

/* ---------- 发送问题 ---------- */
function sendDecisionQuestion() {
    const qEl = document.getElementById('ad-question-input');
    const question = (qEl ? qEl.value : '').trim();

    const inputs = Array.from(document.querySelectorAll('#ad-options-list .ad-option-input'));
    const options = inputs
        .map(i => i.value.trim())
        .filter(Boolean);

    if (!question) {
        showNotification('先写下要问的问题吧', 'warning');
        if (qEl) qEl.focus();
        return;
    }
    if (options.length < 2) {
        showNotification('至少填写两个答案', 'warning');
        return;
    }

    const chosen = options[Math.floor(Math.random() * options.length)];
    const record = {
        id: 'dec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        question,
        options,
        chosen,
        time: Date.now()
    };

    decisionHistory.unshift(record);
    if (decisionHistory.length > 60) decisionHistory.length = 60;
    saveDecisionHistory();

    // 问题以卡片形式发送到聊天页面
    addMessage({
        id: Date.now(),
        sender: 'user',
        text: question,
        timestamp: new Date(),
        status: 'sent',
        favorited: false,
        note: null,
        type: 'decision',
        decisionOptions: options,
        decisionChosen: null,
        decisionRecordId: record.id
    });

    if (typeof playSound === 'function') playSound('send');

    // 重置输入，保留记录
    if (qEl) qEl.value = '';
    decisionDraftOptions = ['', ''];
    renderDecisionOptions();
    renderDecisionHistory();

    hideModal(document.getElementById('decision-menu-modal'));
    showNotification('已发送，等待 Ta 选择…', 'info', 1800);

    // 对方在等待时间后给出选择
    const minDelay = Number(settings && settings.replyDelayMin) || 3000;
    const maxDelay = Number(settings && settings.replyDelayMax) || 7000;
    const delay = minDelay + Math.random() * Math.max(0, maxDelay - minDelay);

    const tiWrapper = document.getElementById('typing-indicator-wrapper');
    const tiLabel = document.getElementById('typing-indicator-label');
    if (settings && settings.typingIndicatorEnabled && tiWrapper) {
        if (tiLabel) tiLabel.textContent = (settings.partnerName || '对方') + ' 正在想';
        if (typeof positionTypingIndicator === 'function') positionTypingIndicator();
        tiWrapper.style.display = 'block';
        requestAnimationFrame(() => { DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight; });
    }

    setTimeout(() => {
        if (tiWrapper) tiWrapper.style.display = 'none';

        addMessage({
            id: Date.now() + 1,
            sender: (settings && settings.partnerName) || '对方',
            text: chosen,
            timestamp: new Date(),
            status: 'received',
            favorited: false,
            note: null,
            type: 'normal'
        });
        if (typeof playSound === 'function') playSound('message');
        if (typeof window._sendPartnerNotification === 'function') {
            window._sendPartnerNotification((settings && settings.partnerName) || '对方', '我选「' + chosen + '」');
        }

        const card = messages.find(m => m.type === 'decision' && m.decisionRecordId === record.id);
        if (card) {
            card.decisionChosen = chosen;
            if (typeof renderMessages === 'function') renderMessages(true);
        }
        decisionHistory.forEach(r => {
            if (r.id === record.id) r.chosen = chosen;
        });
        saveDecisionHistory();
        if (typeof throttledSaveData === 'function') throttledSaveData();
    }, delay);
}

function initDecisionAskModule() {
    const modal = document.getElementById('decision-menu-modal');
    if (!modal) return;

    // 打开面板时刷新内容（捕获阶段，先于展开动作）
    document.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('#decision-function')) {
            openDecisionPanel();
        }
    }, true);

    const addBtn = document.getElementById('ad-add-option');
    if (addBtn && !addBtn.dataset.bound) {
        addBtn.dataset.bound = '1';
        addBtn.addEventListener('click', () => {
            if (decisionDraftOptions.length >= 10) {
                showNotification('最多 10 个答案', 'info', 1500);
                return;
            }
            decisionDraftOptions.push('');
            renderDecisionOptions();
            const inputs = document.querySelectorAll('#ad-options-list .ad-option-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
        });
    }

    const sendBtn = document.getElementById('ad-send-btn');
    if (sendBtn && !sendBtn.dataset.bound) {
        sendBtn.dataset.bound = '1';
        sendBtn.addEventListener('click', sendDecisionQuestion);
    }

    const clearBtn = document.getElementById('ad-clear-history');
    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.dataset.bound = '1';
        clearBtn.addEventListener('click', () => {
            if (!decisionHistory.length) {
                showNotification('暂无使用记录', 'info', 1400);
                return;
            }
            if (!confirm('确定清空全部使用记录吗？聊天里的记录不会受影响。')) return;
            decisionHistory = [];
            saveDecisionHistory();
            renderDecisionHistory();
            showNotification('使用记录已清空', 'success');
        });
    }

    loadDecisionHistory().then(renderDecisionHistory);
    renderDecisionOptions();
}

window.initDecisionAskModule = initDecisionAskModule;
window.sendDecisionQuestion = sendDecisionQuestion;
