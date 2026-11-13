/**
 * moments.js - 动态
 * · 对方可以从「字卡库 / 表情包」发布动态
 * · 我方可以自定义发布（文字 + 图片）
 * · 双方可以点赞、评论；对方会按字卡库与表情包回复我的评论（次数不限）
 * · 对方发布概率可在「聊天设置 · 节奏」中调节（5% - 100%）
 */

let momentsData = [];            // [{ id, author, text, image, time, likes:[{by,time}], comments:[{id,by,text,image,time}] }]
let momentsLoaded = false;
let momentsPanelOpen = false;
let momentsUnread = 0;
let momentsComposerImage = null;
let momentsTicker = null;
const momentCommentDrafts = {};

const MOMENTS_MIN_GAP = 5 * 60 * 1000;   // 对方两条动态之间的最短间隔
const MOMENTS_TICK = 3 * 60 * 1000;      // 概率判定间隔

function mEsc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function momentName(author) {
    if (author === 'user') return (settings && settings.myName) || '我';
    return (settings && settings.partnerName) || '对方';
}

function momentAvatar(author) {
    try {
        const el = author === 'user' ? DOMElements.me.avatar : DOMElements.partner.avatar;
        const img = el ? el.querySelector('img') : null;
        if (img) return `<img src="${mEsc(img.src)}" alt="">`;
    } catch (e) {}
    return `<i class="fas ${author === 'user' ? 'fa-user' : 'fa-user-circle'}"></i>`;
}

function momentTimeLabel(ts) {
    const diff = Date.now() - Number(ts || 0);
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function pickRandom(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function getMomentReplyPool() {
    try {
        let disabled = new Set();
        try {
            const raw = localStorage.getItem('disabledReplyItems');
            if (raw) disabled = new Set(JSON.parse(raw));
        } catch (e) {}
        const groupDisabled = new Set();
        (window.customReplyGroups || []).forEach(g => {
            if (g.disabled && Array.isArray(g.items)) g.items.forEach(i => groupDisabled.add(i));
        });
        return (customReplies || [])
            .filter(r => !disabled.has(r) && !groupDisabled.has(r))
            .map(r => String(r || '').trim())
            .filter(Boolean);
    } catch (e) { return []; }
}

function getPartnerStickerPool() {
    try {
        let disabled = new Set();
        try {
            const raw = localStorage.getItem('disabledStickerItems');
            if (raw) disabled = new Set(JSON.parse(raw));
        } catch (e) {}
        return (stickerLibrary || []).filter(s => s && !disabled.has(s));
    } catch (e) { return []; }
}

function getMomentChance() {
    const v = Number(settings && settings.momentPostChance);
    const chance = isNaN(v) ? 0.3 : v;
    return Math.min(1, Math.max(0.05, chance));
}

/* ---------------- 存储 ---------------- */
async function loadMomentsData() {
    if (momentsLoaded) return true;
    if (typeof SESSION_ID === 'undefined' || !SESSION_ID) {
        if (typeof window.__waitSession === 'function') window.__waitSession(function () { loadMomentsData(); });
        return false;
    }
    try {
        const saved = await localforage.getItem(getStorageKey('moments'));
        if (Array.isArray(saved)) {
            momentsData = saved.map(p => ({
                ...p,
                likes: Array.isArray(p.likes) ? p.likes : [],
                comments: Array.isArray(p.comments) ? p.comments : []
            }));
        }
        momentsLoaded = true;
        return true;
    } catch (e) {
        // SESSION_ID 可能还未就绪，稍后重试
        momentsLoaded = false;
        return false;
    }
}

async function ensureMomentsLoaded(attempt = 0) {
    if (momentsLoaded) return true;
    const ok = await loadMomentsData();
    if (ok) {
        renderMomentsFeed();
        return true;
    }
    if (attempt < 30) {
        setTimeout(() => ensureMomentsLoaded(attempt + 1), 1000);
    }
    return false;
}

function saveMomentsData() {
    try {
        localforage.setItem(getStorageKey('moments'), momentsData);
    } catch (e) {
        console.warn('[moments] 保存失败', e);
    }
}

/* ---------------- 渲染 ---------------- */
function renderMomentsFeed() {
    const feed = document.getElementById('moments-feed');
    if (!feed) return;

    // 按时间倒序（最新在前），保证发表记录按时间顺序依次展示
    const sorted = [...momentsData].sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));

    if (!sorted.length) {
        feed.innerHTML = `<div class="moments-empty"><i class="fas fa-seedling"></i>还没有动态<br>发布第一条，让 Ta 来点赞吧</div>`;
        return;
    }

    feed.innerHTML = sorted.map(post => {
        const likedByMe = post.likes.some(l => l.by === 'user');
        const likedByPartner = post.likes.some(l => l.by === 'partner');
        const likeCount = post.likes.length;
        const likeTitle = [
            likedByMe ? '我' : null,
            likedByPartner ? momentName('partner') : null
        ].filter(Boolean).join('、');

        const commentsHtml = post.comments.map(c => `
            <div class="moment-comment">
                <span class="mc-name">${mEsc(momentName(c.by))}</span>${c.text ? mEsc(c.text) : ''}
                ${c.image ? `<img class="mc-img" src="${mEsc(c.image)}" alt="表情" data-act="view-image" data-src="${mEsc(c.image)}">` : ''}
            </div>
        `).join('');

        return `<article class="moment-card" data-post="${mEsc(post.id)}">
            <div class="moment-head">
                <div class="moment-avatar">${momentAvatar(post.author)}</div>
                <div class="moment-meta">
                    <div class="moment-name">${mEsc(momentName(post.author))}</div>
                    <div class="moment-time">${momentTimeLabel(post.time)}</div>
                </div>
            </div>
            ${post.text ? `<div class="moment-text">${mEsc(post.text)}</div>` : ''}
            ${post.image ? `<div class="moment-img"><img src="${mEsc(post.image)}" alt="动态图片" data-act="view-image" data-src="${mEsc(post.image)}"></div>` : ''}
            <div class="moment-actions">
                <button class="moment-act${likedByMe ? ' liked' : ''}" data-act="like" title="${likeTitle ? mEsc(likeTitle) + ' 赞过' : '点赞'}">
                    <i class="fa${likedByMe ? 's' : 'r'} fa-heart"></i><span>${likeCount || '赞'}</span>
                </button>
                <button class="moment-act" data-act="focus-comment">
                    <i class="far fa-comment"></i><span>${post.comments.length || '评论'}</span>
                </button>
            </div>
            <div class="moment-comments">
                ${commentsHtml}
                <div class="moment-comment-input">
                    <input type="text" data-comment-input="${mEsc(post.id)}" placeholder="说点什么…" value="${mEsc(momentCommentDrafts[post.id] || '')}">
                    <button data-act="send-comment" title="发送"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        </article>`;
    }).join('');

    updateMomentsDot();
}

function updateMomentsDot() {
    const dot = document.getElementById('moments-unread-dot');
    if (!dot) return;
    dot.style.display = momentsUnread > 0 ? 'block' : 'none';
}

function markMomentsUnread() {
    if (momentsPanelOpen) return;
    momentsUnread += 1;
    updateMomentsDot();
}

/* ---------------- 互动 ---------------- */
function likeMoment(postId, by) {
    const post = momentsData.find(p => String(p.id) === String(postId));
    if (!post) return;
    const idx = post.likes.findIndex(l => l.by === by);
    if (idx >= 0) {
        post.likes.splice(idx, 1);
    } else {
        post.likes.push({ by, time: Date.now() });
    }
    saveMomentsData();
    renderMomentsFeed();
}

function addMomentComment(postId, by, text, image) {
    const post = momentsData.find(p => String(p.id) === String(postId));
    if (!post) return;
    if (!text && !image) return;
    post.comments.push({
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        by,
        text: text || '',
        image: image || null,
        time: Date.now()
    });
    saveMomentsData();
    renderMomentsFeed();
    if (by === 'partner') markMomentsUnread();
}

/* 我方评论后，对方用字卡库 / 表情包回复（次数不限）
   回复等待时间可在 聊天设置→节奏 调节（默认 30s） */
function partnerReplyToComment(postId) {
    const textPool = getMomentReplyPool();
    const stickers = getPartnerStickerPool();
    const rounds = Math.random() < 0.68 ? 1 : 2;
    const base = ((typeof settings !== 'undefined' && Number(settings.momentReplyDelay)) || 30) * 1000;

    for (let i = 0; i < rounds; i++) {
        const wait = base + i * 3000 + Math.random() * 3000;
        setTimeout(() => {
            const post = momentsData.find(p => String(p.id) === String(postId));
            if (!post) return;

            const useSticker = stickers.length > 0 && Math.random() < 0.3;
            const image = useSticker ? pickRandom(stickers) : null;
            let text = '';
            if (!image || Math.random() < 0.55) {
                text = pickRandom(textPool) || '';
            }
            if (!text && !image) return;

            addMomentComment(postId, 'partner', text, image);
            if (Math.random() < 0.35) {
                const p = momentsData.find(p2 => String(p2.id) === String(postId));
                if (p && !p.likes.some(l => l.by === 'partner')) {
                    p.likes.push({ by: 'partner', time: Date.now() });
                    saveMomentsData();
                    renderMomentsFeed();
                }
            }
        }, wait);
    }
}

/* 我方发布后，对方点赞 / 评论 */
function partnerReactToMyPost(postId) {
    setTimeout(() => {
        const post = momentsData.find(p => String(p.id) === String(postId));
        if (!post) return;
        if (Math.random() < 0.7 && !post.likes.some(l => l.by === 'partner')) {
            post.likes.push({ by: 'partner', time: Date.now() });
            saveMomentsData();
            renderMomentsFeed();
        }
    }, 2200 + Math.random() * 3500);

    if (Math.random() < 0.65) {
        const textPool = getMomentReplyPool();
        const stickers = getPartnerStickerPool();
        setTimeout(() => {
            const post = momentsData.find(p => String(p.id) === String(postId));
            if (!post) return;
            const image = (stickers.length && Math.random() < 0.25) ? pickRandom(stickers) : null;
            const text = pickRandom(textPool) || '';
            if (!text && !image) return;
            addMomentComment(postId, 'partner', text, image);
        }, 6000 + Math.random() * 6000);
    }
}

/* ---------------- 发布 ---------------- */
function publishMoment() {
    const textEl = document.getElementById('moment-text-input');
    const text = textEl ? textEl.value.trim() : '';
    const image = momentsComposerImage;

    if (!text && !image) {
        showNotification('写点什么，或选一张图片吧', 'warning', 1800);
        return;
    }

    const post = {
        id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        author: 'user',
        text,
        image: image || null,
        time: Date.now(),
        likes: [],
        comments: []
    };
    momentsData.unshift(post);
    saveMomentsData();

    if (textEl) { textEl.value = ''; textEl.style.height = ''; }
    momentsComposerImage = null;
    renderMomentImagePreview();
    toggleMomentComposer(false);
    renderMomentsFeed();
    showNotification('已发布，等 Ta 来看看', 'success', 1800);

    partnerReactToMyPost(post.id);
}

function deleteMoment(postId) {
    const post = momentsData.find(p => String(p.id) === String(postId));
    if (!post) return;
    if (!confirm('删除这条动态？评论也会一起消失。')) return;
    momentsData = momentsData.filter(p => String(p.id) !== String(postId));
    saveMomentsData();
    renderMomentsFeed();
}

/* 对方发布：从字卡库 / 表情包取内容 */
function createPartnerMoment() {
    const textPool = getMomentReplyPool();
    const stickers = getPartnerStickerPool();

    let text = '';
    let image = null;

    const useSticker = stickers.length > 0 && Math.random() < 0.55;
    if (useSticker) image = pickRandom(stickers);
    if (!image || Math.random() < 0.7) {
        text = pickRandom(textPool) || '';
    }
    if (!text && !image) {
        // 字卡与表情都为空时，用一句默认心情
        text = '今天也想你一点。';
    }

    const post = {
        id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        author: 'partner',
        text,
        image,
        time: Date.now(),
        likes: [],
        comments: []
    };
    momentsData.unshift(post);
    saveMomentsData();
    if (momentsPanelOpen) renderMomentsFeed();
    markMomentsUnread();

    showNotification((settings.partnerName || '对方') + ' 发布了新动态 ✦', 'info', 2600);
    if (typeof window._sendPartnerNotification === 'function') {
        window._sendPartnerNotification((settings.partnerName || '对方') + ' 发布了新动态', text || '[表情]');
    }
    return true;
}

/* 概率判定：受「聊天设置 · 节奏」里的概率控制 */
function maybePartnerPost() {
    if (!momentsLoaded) return false;

    const lastTime = momentsData
        .filter(p => p.author === 'partner')
        .reduce((max, p) => Math.max(max, Number(p.time) || 0), 0);

    if (Date.now() - lastTime < MOMENTS_MIN_GAP) return false;
    if (Math.random() > getMomentChance()) return false;

    return createPartnerMoment();
}

/* ---------------- 面板 ---------------- */
/* 封面：双方头像 + 头像框 + 我方自定义签名 */
function renderMomentsHeader() {
    const wrapP = document.getElementById('moments-av-partner');
    const wrapU = document.getElementById('moments-av-user');
    const fill = (wrap, author, frameKey) => {
        if (!wrap) return;
        const frame = (settings && settings[frameKey]) || null;
        wrap.innerHTML = momentAvatar(author) +
            (frame && frame.src ? `<img class="avatar-frame" src="${mEsc(frame.src)}" style="width:${frame.size || 100}%;height:${frame.size || 100}%;transform:translate(calc(-50% + ${frame.offsetX || 0}px), calc(-50% + ${frame.offsetY || 0}px));" alt="">` : '');
        const img = wrap.querySelector('img:not(.avatar-frame)');
        if (img) img.classList.add('m-av-img');
    };
    fill(wrapP, 'partner', 'partnerAvatarFrame');
    fill(wrapU, 'user', 'myAvatarFrame');

    // 我方头像下方：自定义签名（点击编辑）
    const sigEl = document.getElementById('moments-signature-text');
    if (sigEl) {
        sigEl.textContent = (settings && settings.momentsSignature) || '点击设置签名';
        if (!sigEl.dataset.sigBound) {
            sigEl.dataset.sigBound = '1';
            const edit = () => {
                const cur = (settings && settings.momentsSignature) || '';
                const v = prompt('设置你的朋友圈签名：', cur);
                if (v === null) return;
                settings.momentsSignature = v.trim().slice(0, 40);
                sigEl.textContent = settings.momentsSignature || '点击设置签名';
                if (typeof throttledSaveData === 'function') throttledSaveData();
                if (typeof showNotification === 'function' && settings.momentsSignature) showNotification('签名已更新', 'success', 1500);
            };
            sigEl.addEventListener('click', edit);
            const line = document.getElementById('mp-sigline');
            if (line) line.addEventListener('click', edit);
        }
    }
}

/* 封面下拉：参照微信朋友圈，下拉时封面随手指拉伸，松手回弹 */
function initCoverPull() {
    const scroll = document.querySelector('#moments-modal .mp-scroll');
    const cover = document.getElementById('mp-cover');
    if (!scroll || !cover || cover.dataset.pullBound) return;
    cover.dataset.pullBound = '1';
    const BASE_H = 190;
    let startY = 0, pulling = false;
    scroll.addEventListener('touchstart', (e) => {
        if (scroll.scrollTop <= 0) { startY = e.touches[0].clientY; pulling = true; }
        else pulling = false;
    }, { passive: true });
    scroll.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0 && scroll.scrollTop <= 0) {
            const grow = Math.min(dy * 0.55, 170);
            cover.style.transition = 'none';
            cover.style.height = (BASE_H + grow) + 'px';
        }
    }, { passive: true });
    const release = () => {
        if (!pulling) return;
        pulling = false;
        cover.style.transition = 'height 0.38s cubic-bezier(0.25,0.8,0.35,1.1)';
        cover.style.height = '';
        setTimeout(() => { cover.style.transition = ''; }, 420);
    };
    scroll.addEventListener('touchend', release);
    scroll.addEventListener('touchcancel', release);
}

function updateMeetDaysText() {
    const el = document.getElementById('moments-anniv-text');
    const dateInput = document.getElementById('moments-meet-date');
    if (!el) return;
    const v = (dateInput && dateInput.value) || (settings && settings.meetDate) || '';
    if (!v) {
        el.innerHTML = '相遇于 <em>–</em> · 选择日期开始计算';
        return;
    }
    const start = new Date(v + 'T00:00:00');
    if (isNaN(start.getTime())) {
        el.innerHTML = '已相遇 <em>–</em> 天';
        return;
    }
    const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000)) + 1;
    el.innerHTML = `相遇第 <em>${days}</em> 天`;
}

/* 长按动态卡片删除 */
function initMomentsLongPress() {
    const feed = document.getElementById('moments-feed');
    if (!feed) return;
    let timer = null, startX = 0, startY = 0, targetId = null, fired = false;

    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

    const start = (x, y, card) => {
        if (!card) return;
        // 输入框 / 按钮上的长按不触发删除
        if (e_target_is_interactive(card, x, y)) return;
        targetId = card.dataset.post;
        fired = false;
        startX = x; startY = y;
        clear();
        timer = setTimeout(() => {
            fired = true;
            if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
            deleteMoment(targetId);
            clear();
        }, 500);
    };

    function e_target_is_interactive(card, x, y) {
        const el = document.elementFromPoint(x, y);
        return !!(el && el.closest('input, textarea, button, [data-act]'));
    }

    feed.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        start(t.clientX, t.clientY, e.target.closest('.moment-card'));
    }, { passive: true });
    feed.addEventListener('touchmove', (e) => {
        if (!timer) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) clear();
    }, { passive: true });
    feed.addEventListener('touchend', clear);
    feed.addEventListener('touchcancel', clear);

    feed.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        start(e.clientX, e.clientY, e.target.closest('.moment-card'));
    });
    feed.addEventListener('mousemove', (e) => {
        if (!timer) return;
        if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) clear();
    });
    feed.addEventListener('mouseup', clear);
    feed.addEventListener('mouseleave', clear);
    // 长按后阻止补发的 click
    feed.addEventListener('click', (e) => {
        if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; }
    }, true);
}

function renderMomentImagePreview() {
    const box = document.getElementById('moment-image-preview');
    if (!box) return;
    if (!momentsComposerImage) {
        box.innerHTML = '';
        return;
    }
    box.innerHTML = `<img src="${mEsc(momentsComposerImage)}" alt="预览"><button class="mp-clear" data-act="clear-image" title="移除"><i class="fas fa-times"></i></button>`;
}

function toggleMomentComposer(force) {
    const composer = document.getElementById('moments-composer');
    const btn = document.getElementById('moments-compose-toggle');
    if (!composer) return;
    const open = typeof force === 'boolean' ? force : !composer.classList.contains('open');
    composer.classList.toggle('open', open);
    if (btn) btn.classList.toggle('open', open);
    if (open) {
        const t = document.getElementById('moment-text-input');
        if (t) setTimeout(() => t.focus(), 120);
    }
}

async function openMomentsPanel() {
    await ensureMomentsLoaded();
    momentsUnread = 0;
    updateMomentsDot();
    renderMomentsHeader();
    renderMomentsFeed();
    renderMomentImagePreview();
    momentsPanelOpen = true;
    hideModal(document.getElementById('advanced-modal'));
    showModal(document.getElementById('moments-modal'));
    maybePartnerPost();
}

function closeMomentsPanel() {
    momentsPanelOpen = false;
    hideModal(document.getElementById('moments-modal'));
}

/* ---------------- 事件绑定 ---------------- */
function initMomentsModule() {
    // 顶栏动态按钮（聊天界面右上角）
    const topBtn = document.getElementById('moments-top-btn');
    if (topBtn && !topBtn.dataset.momentsBound) {
        topBtn.dataset.momentsBound = '1';
        topBtn.addEventListener('click', () => { openMomentsPanel(); });
    }

    // 封面上的空白发表框：点框或点 + 号展开编辑
    const publisher = document.getElementById('moments-publisher');
    if (publisher && !publisher.dataset.momentsBound) {
        publisher.dataset.momentsBound = '1';
        publisher.addEventListener('click', () => toggleMomentComposer(true));
    }

    const entry = document.getElementById('moments-function');
    if (entry && !entry.dataset.momentsBound) {
        entry.dataset.momentsBound = '1';
        entry.addEventListener('click', () => { openMomentsPanel(); });
    }

    const closeBtn = document.getElementById('close-moments');
    if (closeBtn && !closeBtn.dataset.momentsBound) {
        closeBtn.dataset.momentsBound = '1';
        closeBtn.addEventListener('click', closeMomentsPanel);
    }

    const composeToggle = document.getElementById('moments-compose-toggle');
    if (composeToggle && !composeToggle.dataset.momentsBound) {
        composeToggle.dataset.momentsBound = '1';
        composeToggle.addEventListener('click', () => toggleMomentComposer());
    }

    const pickBtn = document.getElementById('moment-pick-image');
    const fileInput = document.getElementById('moment-image-input');
    if (pickBtn && fileInput && !pickBtn.dataset.momentsBound) {
        pickBtn.dataset.momentsBound = '1';
        pickBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            if (file.size > MAX_IMAGE_SIZE) {
                showNotification('图片大小不能超过 5MB', 'error');
                fileInput.value = '';
                return;
            }
            const done = (src) => {
                momentsComposerImage = src;
                renderMomentImagePreview();
                fileInput.value = '';
            };
            if (typeof optimizeImage === 'function') {
                optimizeImage(file).then(done).catch(() => showNotification('图片处理失败', 'error'));
            } else {
                const reader = new FileReader();
                reader.onload = e => done(e.target.result);
                reader.readAsDataURL(file);
            }
        });
    }

    const publishBtn = document.getElementById('moment-publish');
    if (publishBtn && !publishBtn.dataset.momentsBound) {
        publishBtn.dataset.momentsBound = '1';
        publishBtn.addEventListener('click', publishMoment);
    }

    const textInput = document.getElementById('moment-text-input');
    if (textInput && !textInput.dataset.momentsBound) {
        textInput.dataset.momentsBound = '1';
        textInput.addEventListener('input', () => {
            textInput.style.height = 'auto';
            textInput.style.height = Math.min(textInput.scrollHeight, 140) + 'px';
        });
    }

    const feed = document.getElementById('moments-feed');
    if (feed && !feed.dataset.momentsBound) {
        feed.dataset.momentsBound = '1';

        feed.addEventListener('click', (e) => {
            const card = e.target.closest('.moment-card');
            if (!card) return;
            const postId = card.dataset.post;
            const actEl = e.target.closest('[data-act]');
            if (!actEl) return;
            const act = actEl.dataset.act;

            if (act === 'like') {
                likeMoment(postId, 'user');
            } else if (act === 'delete') {
                deleteMoment(postId);
            } else if (act === 'view-image') {
                if (typeof viewImage === 'function') viewImage(actEl.dataset.src);
            } else if (act === 'focus-comment') {
                const input = card.querySelector('[data-comment-input]');
                if (input) input.focus();
            } else if (act === 'send-comment') {
                const input = card.querySelector('[data-comment-input]');
                submitMomentComment(postId, input);
            } else if (act === 'clear-image') {
                momentsComposerImage = null;
                renderMomentImagePreview();
            }
        });

        feed.addEventListener('input', (e) => {
            if (e.target.matches('[data-comment-input]')) {
                momentCommentDrafts[e.target.dataset.commentInput] = e.target.value;
            }
        });

        feed.addEventListener('keydown', (e) => {
            if (e.target.matches('[data-comment-input]') && e.key === 'Enter') {
                e.preventDefault();
                const card = e.target.closest('.moment-card');
                if (card) submitMomentComment(card.dataset.post, e.target);
            }
        });
    }

    initMomentsLongPress();
    initCoverPull();

    // 定时按概率判定对方是否发布动态
    if (!momentsTicker) {
        momentsTicker = setInterval(() => { if (!document.hidden && momentsLoaded) maybePartnerPost(); }, MOMENTS_TICK);
    }

    ensureMomentsLoaded().then(ok => {
        if (!ok) return;
        renderMomentsFeed();
        if (momentsData.length) return;
        // 首次进入：给对方一次按概率发布的机会
        setTimeout(maybePartnerPost, 8000);
    });
}

function submitMomentComment(postId, input) {
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    delete momentCommentDrafts[postId];
    addMomentComment(postId, 'user', text, null);
    partnerReplyToComment(postId);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initMomentsModule());
} else {
    initMomentsModule();
}

window.initMomentsModule = initMomentsModule;
window.openMomentsPanel = openMomentsPanel;
window.maybePartnerPost = maybePartnerPost;
