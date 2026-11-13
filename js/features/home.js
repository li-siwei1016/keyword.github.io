/**
 * home.js - 主页
 * 公告/声明结束后进入主页；包含：头像+链接波纹+随机签名、三合一相框、
 * 时间/对方状态/相遇纪念日、聊天/朋友圈/信件、字卡库/高级功能/设置。
 * 主页主题色/相框颜色/背景图可在 外观设置→主页主题 自定义。
 */
(function () {
    const PHOTOS_KEY = 'homePhotoFrames'; // localStorage
    const SIG_KEY = 'homeSignatures';     // localStorage {partner:'', me:'', day:'YYYY-MM-DD'}

    // 默认主页主题：雪白相框 + 雪灰蓝点缀（保证白底文字可读）
    const DEFAULT_ACCENT = '#7f93a6';
    const DEFAULT_FRAME = '#ffffff';

    const SIG_POOL_PARTNER = [
        '在想你的第一百种方式', '今天的晚霞很好看，想分你一半', '把日子过成诗，把你放进日子里',
        '风很温柔，像你说话的语气', '攒了一口袋的开心，见了你就倒出来', '月亮不睡我不睡，我是人间小美味',
        '和你有关的部分，都值得纪念', '保持热爱，奔赴山海', '偷偷把喜欢调成了置顶',
        '今天也是离你更近的一天', '山野万里，你是我藏在星星里的浪漫', '慢慢来，反正有你'
    ];
    const SIG_POOL_ME = [
        '所有的温柔都源于你', '今天也要好好爱你', '把心事泡进茶里，慢慢想你',
        '世界很大，我的世界很小，小到只有你', '想你的日子都发着光', '晴天雨天，都想见你',
        '收集了一整天的浪漫，讲给你听', '今日份的喜欢已签收', '你是我藏在春风里的欢喜',
        '从遇见你开始，万物皆可爱', '日子平平，有你则甜', '星光不问赶路人，时光不负有心人'
    ];
    const GREETINGS = [
        [5, 8, '早上好，新的一天也要元气满满'],
        [8, 12, '上午好，愿今天的每件事都顺心'],
        [12, 14, '午安，记得吃午饭呀'],
        [14, 18, '下午好，来杯下午茶歇一歇'],
        [18, 22, '晚上好，今天辛苦了'],
        [22, 24, '夜深了，早点休息'],
        [0, 5, '夜深了，做一个有我的好梦']
    ];

    let homeOpen = false;
    let clockTimer = null;

    /* ---------------- 显隐 ---------------- */
    function showHomePage() {
        const page = document.getElementById('home-page');
        if (!page) return;
        page.style.display = 'block';
        homeOpen = true;
        renderHome();
        // 头像可能异步加载，补两次重试确保上传的头像显示
        setTimeout(renderAvatars, 800);
        setTimeout(renderAvatars, 2400);
        if (!clockTimer) clockTimer = setInterval(renderClock, 1000);
    }

    function hideHomePage() {
        const page = document.getElementById('home-page');
        if (!page) return;
        page.style.display = 'none';
        homeOpen = false;
    }

    window.showHomePage = showHomePage;
    window.hideHomePage = hideHomePage;
    window.isHomeOpen = () => homeOpen;

    /* ---------------- 聊天未读红点 ---------------- */
    let chatUnread = 0;
    function updateChatDot() {
        const dot = document.getElementById('chat-unread-dot');
        if (dot) dot.style.display = chatUnread > 0 ? 'block' : 'none';
    }
    function markChatUnread() {
        // 主页打开、或有弹窗盖住聊天页时记为未读（聊天页正面可见时不记）
        let covered = homeOpen;
        if (!covered) {
            try {
                covered = [...document.querySelectorAll('.modal')].some(m => {
                    const cs = getComputedStyle(m);
                    return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0;
                });
            } catch (e) {}
        }
        if (!covered) return;
        chatUnread += 1;
        updateChatDot();
    }
    function clearChatUnread() {
        chatUnread = 0;
        updateChatDot();
    }
    window.markChatUnread = markChatUnread;
    window.clearChatUnread = clearChatUnread;

    /* ---------------- 渲染 ---------------- */
    function renderHome() {
        renderAvatars();
        renderSignatures();
        renderFrames();
        renderClock();
        renderPartnerStatus();
        renderAnniversary();
        applyHomeTheme();
        // 首行左框：链接状态条（与聊天顶栏下方同款）
        if (typeof renderLinkStatus === 'function') renderLinkStatus();
    }

    /* ---------------- 头像（使用「我的头像 / 对方头像」上传的图片） ---------------- */
    const _avCache = { partner: null, me: null };   // 兜底缓存，避免初始化竞态
    let _avLoading = false;

    function _avatarSrcFromDom(id) {
        const el = document.getElementById(id);
        const img = el ? el.querySelector('img') : null;
        return img ? (img.getAttribute('src') || '') : '';
    }
    function _paintAvatarBox(box, src, ready) {
        if (!box) return;
        if (src) {
            let img = box.querySelector('img');
            if (!img) {
                box.innerHTML = '<img alt="avatar">';
                img = box.querySelector('img');
            }
            if (img.getAttribute('src') !== src) img.setAttribute('src', src);
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        } else if (ready) {
            // 明确没有上传头像 → 显示默认图标
            if (!box.querySelector('i')) box.innerHTML = '<i class="fas fa-user"></i>';
        }
    }
    async function _loadAvatarFromStore(needPartner, needMe) {
        if (_avLoading) return;
        if (typeof localforage === 'undefined' || typeof getStorageKey === 'undefined') return;
        _avLoading = true;
        try {
            if (needPartner) {
                const src = await localforage.getItem(getStorageKey('partnerAvatar'));
                if (src) { _avCache.partner = src; _paintAvatarBox(document.getElementById('home-av-partner'), src, false); }
            }
            if (needMe) {
                const src = await localforage.getItem(getStorageKey('myAvatar'));
                if (src) { _avCache.me = src; _paintAvatarBox(document.getElementById('home-av-me'), src, false); }
            }
        } catch (e) {} finally { _avLoading = false; }
    }
    function renderAvatars() {
        const pEl = document.getElementById('partner-avatar');
        const mEl = document.getElementById('my-avatar');
        // 聊天头像容器里有内容 = 初始化完成，此时以它为准；否则先用缓存 / 本地存储兜底
        const pReady = !!(pEl && pEl.childElementCount > 0);
        const mReady = !!(mEl && mEl.childElementCount > 0);
        const pDomSrc = pReady ? _avatarSrcFromDom('partner-avatar') : '';
        const mDomSrc = mReady ? _avatarSrcFromDom('my-avatar') : '';
        if (pDomSrc) _avCache.partner = pDomSrc; else if (pReady) _avCache.partner = null;
        if (mDomSrc) _avCache.me = mDomSrc; else if (mReady) _avCache.me = null;

        _paintAvatarBox(document.getElementById('home-av-partner'), pReady ? pDomSrc : _avCache.partner, pReady);
        _paintAvatarBox(document.getElementById('home-av-me'), mReady ? mDomSrc : _avCache.me, mReady);

        if (!pReady || !mReady) _loadAvatarFromStore(!pReady, !mReady);
    }
    window.addEventListener('app:avatar-updated', () => { if (homeOpen) renderAvatars(); });

    function todayStr() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function renderSignatures() {
        const pe = document.getElementById('home-sig-partner');
        const me = document.getElementById('home-sig-me');
        if (!pe || !me) return;
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(SIG_KEY) || 'null'); } catch (e) {}
        if (!saved || saved.day !== todayStr() || !saved.partner || !saved.me) {
            saved = {
                day: todayStr(),
                partner: SIG_POOL_PARTNER[Math.floor(Math.random() * SIG_POOL_PARTNER.length)],
                me: SIG_POOL_ME[Math.floor(Math.random() * SIG_POOL_ME.length)]
            };
            try { localStorage.setItem(SIG_KEY, JSON.stringify(saved)); } catch (e) {}
        }
        pe.textContent = saved.partner;
        me.textContent = saved.me;
        // 点击签名换一条
        pe.onclick = () => { pe.textContent = SIG_POOL_PARTNER[Math.floor(Math.random() * SIG_POOL_PARTNER.length)]; };
        me.onclick = () => { me.textContent = SIG_POOL_ME[Math.floor(Math.random() * SIG_POOL_ME.length)]; };
    }

    function renderClock() {
        const dEl = document.getElementById('home-clock-date');
        const tEl = document.getElementById('home-clock-time');
        const gEl = document.getElementById('home-clock-greet');
        if (!dEl || !tEl || !gEl) return;
        const d = new Date();
        const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
        // 窄屏用紧凑日期，避免换行挤压
        const narrow = (window.innerWidth || 400) < 380;
        dEl.textContent = narrow
            ? `${d.getMonth() + 1}/${d.getDate()} 周${week}`
            : `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week}`;
        tEl.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const h = d.getHours();
        let greet = '你好呀';
        for (const [a, b, t] of GREETINGS) { if (h >= a && h < b) { greet = t; break; } }
        gEl.textContent = greet;
    }

    /* ---------------- Ta 的手机卡片 ---------------- */
    function renderHomePhoneCard() {
        const moodEl = document.getElementById('home-status-mood-text');
        const statusEl = document.getElementById('home-status-status-text');
        const slackEl = document.getElementById('home-status-slacking-text');
        // 心情：心晴手账今日记录
        if (moodEl) {
            try {
                const data = window.moodData || {};
                const entry = data[todayStr()] || {};
                let moodTxt = '心情：还没有记录';
                const opts = (typeof customMoodOptions !== 'undefined' && customMoodOptions.length ? customMoodOptions : (typeof MOOD_OPTIONS !== 'undefined' ? MOOD_OPTIONS : []));
                if (entry.partner) {
                    const opt = opts.find(o => o.key === entry.partner);
                    moodTxt = '心情：' + (opt ? `${opt.kaomoji} ${opt.label}` : entry.partner);
                }
                moodEl.textContent = moodTxt;
            } catch (e) {}
        }
        // 状态：抓取字卡库的状态字卡（settings.partnerStatus 由状态库轮换取）
        if (statusEl) {
            try {
                const st = (typeof settings !== 'undefined' && settings.partnerStatus) || '';
                statusEl.textContent = '状态：' + (st || '—');
            } catch (e) {}
        }
        // 摸鱼状态（触发时显示）
        if (slackEl) {
            try {
                const txt = (typeof window.getSlackingText === 'function') ? window.getSlackingText() : '';
                if (txt) {
                    slackEl.textContent = '摸鱼中 · ' + txt;
                    slackEl.style.display = '';
                } else {
                    slackEl.style.display = 'none';
                }
            } catch (e) {}
        }
    }
    window.renderHomePhoneCard = renderHomePhoneCard;

    function renderPartnerStatus() { renderHomePhoneCard(); }

    /* ---------------- Ta 的手机弹窗 ---------------- */
    let phoneViewKey = '';

    function openPhoneModal() {
        const modal = document.getElementById('phone-modal');
        if (!modal) return;
        showPhoneMenu();
        showModal(modal);
    }

    function showPhoneMenu() {
        phoneViewKey = '';
        const menu = document.getElementById('phone-menu');
        const view = document.getElementById('phone-view');
        if (menu) menu.style.display = '';
        if (view) view.style.display = 'none';
    }

    function showPhoneView(key) {
        phoneViewKey = key;
        const menu = document.getElementById('phone-menu');
        const view = document.getElementById('phone-view');
        if (menu) menu.style.display = 'none';
        if (view) view.style.display = '';
        renderPhoneView(key);
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderPhoneView(key) {
        const body = document.getElementById('phone-view-body');
        if (!body) return;
        const name = (typeof settings !== 'undefined' && settings.partnerName) || 'Ta';

        if (key === 'status') {
            // Ta 的状态：字卡库状态字卡 + 心情 + 摸鱼
            const st = (typeof settings !== 'undefined' && settings.partnerStatus) || '—';
            let moodTxt = '还没有记录';
            try {
                const data = window.moodData || {};
                const entry = data[todayStr()] || {};
                const opts = (typeof customMoodOptions !== 'undefined' && customMoodOptions.length ? customMoodOptions : (typeof MOOD_OPTIONS !== 'undefined' ? MOOD_OPTIONS : []));
                if (entry.partner) {
                    const opt = opts.find(o => o.key === entry.partner);
                    moodTxt = opt ? `${opt.kaomoji} ${opt.label}` : entry.partner;
                }
            } catch (e) {}
            const slackTxt = (typeof window.getSlackingText === 'function') ? window.getSlackingText() : '';
            body.innerHTML = `
                <div class="pv-title">${esc(name)} 的状态</div>
                <div class="pv-card">
                    <div class="pv-row"><span class="pv-k">当前状态</span><span class="pv-v">${esc(st)}</span></div>
                    <div class="pv-row"><span class="pv-k">今日心情</span><span class="pv-v">${esc(moodTxt)}</span></div>
                    ${slackTxt ? `<div class="pv-row"><span class="pv-k">摸鱼状态</span><span class="pv-v pv-slacking">${esc(slackTxt)}</span></div>` : ''}
                </div>
                <button class="pv-btn" id="pv-status-refresh"><i class="fas fa-rotate"></i> 换一条状态</button>
                <div class="pv-hint">状态抓取自「字卡库 → 回复库管理 → 状态字卡」中的状态字卡</div>`;
            const btn = body.querySelector('#pv-status-refresh');
            if (btn) btn.addEventListener('click', () => {
                if (typeof window._triggerStatusChange === 'function') window._triggerStatusChange();
                setTimeout(() => renderPhoneView('status'), 150);
                renderHomePhoneCard();
            });
            return;
        }

        if (key === 'moments') {
            // Ta 的朋友圈：对方自主发布的动态
            let posts = [];
            try { posts = (typeof momentsData !== 'undefined' ? momentsData : []).filter(p => p.author === 'partner'); } catch (e) {}
            posts = posts.slice().sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 30);
            if (!posts.length) {
                body.innerHTML = `<div class="pv-title">${esc(name)} 的朋友圈</div><div class="pv-empty">Ta 还没有发布动态<br>等 Ta 想起来就会发啦</div>`;
                return;
            }
            body.innerHTML = `<div class="pv-title">${esc(name)} 的朋友圈</div>` + posts.map(p => `
                <div class="pv-card pv-moment">
                    ${p.text ? `<div class="pv-m-text">${esc(p.text)}</div>` : ''}
                    ${p.image ? `<img class="pv-m-img" src="${p.image}" alt="">` : ''}
                    <div class="pv-m-meta">${new Date(p.time || Date.now()).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${(p.likes || []).length} 赞 · ${(p.comments || []).length} 评论</div>
                </div>`).join('');
            return;
        }

        if (key === 'letters') {
            // Ta 的信笺：对方投递/回复的信封（收件箱）
            let inbox = [];
            try { inbox = (typeof envelopeData !== 'undefined' && envelopeData.inbox) ? envelopeData.inbox : []; } catch (e) {}
            inbox = inbox.slice().sort((a, b) => (b.receivedTime || 0) - (a.receivedTime || 0)).slice(0, 30);
            if (!inbox.length) {
                body.innerHTML = `<div class="pv-title">${esc(name)} 的信笺</div><div class="pv-empty">还没有收到 Ta 的信<br>给 Ta 寄一封信，就会收到回音啦</div>`;
                return;
            }
            body.innerHTML = `<div class="pv-title">${esc(name)} 的信笺</div>` + inbox.map(l => `
                <div class="pv-card pv-letter" data-letter="${esc(l.id)}">
                    <div class="pv-l-content">${esc((l.content || '').slice(0, 120))}${(l.content || '').length > 120 ? '…' : ''}</div>
                    <div class="pv-m-meta">${new Date(l.receivedTime || Date.now()).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>`).join('');
            body.querySelectorAll('.pv-letter').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.dataset.letter;
                    hideModal(document.getElementById('phone-modal'));
                    if (typeof window.viewEnvLetter === 'function') window.viewEnvLetter('inbox', id);
                });
            });
            return;
        }

        if (key === 'slacking') {
            // 摸鱼小记：往日摸鱼状态记录
            const log = (typeof window.getSlackingLog === 'function') ? window.getSlackingLog() : [];
            if (!log.length) {
                body.innerHTML = `<div class="pv-title">摸鱼小记</div><div class="pv-empty">还没有摸鱼记录<br>Ta 偶尔摸鱼时会记在这里</div>`;
                return;
            }
            body.innerHTML = `<div class="pv-title">摸鱼小记</div>` + log.map(r => `
                <div class="pv-card pv-slack">
                    <div class="pv-m-text"><i class="fas fa-coffee pv-s-ico"></i>${esc(r.text || '')}</div>
                    <div class="pv-m-meta">${new Date(r.time || Date.now()).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${r.mins ? ' · 约 ' + r.mins + ' 分钟' : ''}</div>
                </div>`).join('');
            return;
        }
    }

    function initPhoneModal() {
        const statusCard = document.getElementById('home-status-mood');
        if (statusCard && !statusCard.dataset.pb) {
            statusCard.dataset.pb = '1';
            statusCard.addEventListener('click', openPhoneModal);
        }
        const closeBtn = document.getElementById('close-phone-modal');
        if (closeBtn && !closeBtn.dataset.pb) {
            closeBtn.dataset.pb = '1';
            closeBtn.addEventListener('click', () => hideModal(document.getElementById('phone-modal')));
        }
        const backBtn = document.getElementById('phone-view-back');
        if (backBtn && !backBtn.dataset.pb) {
            backBtn.dataset.pb = '1';
            backBtn.addEventListener('click', showPhoneMenu);
        }
        const menu = document.getElementById('phone-menu');
        if (menu && !menu.dataset.pb) {
            menu.dataset.pb = '1';
            menu.addEventListener('click', (e) => {
                const item = e.target.closest('.phone-menu-item');
                if (!item) return;
                const key = item.dataset.phone;
                if (key === 'mood') {
                    hideModal(document.getElementById('phone-modal'));
                    triggerStub('mood-function');
                    return;
                }
                showPhoneView(key);
            });
        }
    }
    window.openPhoneModal = openPhoneModal;

    function renderAnniversary() {
        const daysEl = document.getElementById('home-anniv-days');
        const dateEl = document.getElementById('home-anniv-date');
        if (!daysEl) return;
        let earliest = (typeof settings !== 'undefined' && settings.meetDate) || '';
        // 未手动设置时，用当前会话的创建日期作为「相遇第一天」
        if (!earliest) earliest = sessionStartDate();
        try {
            if (!earliest && typeof anniversaries !== 'undefined' && Array.isArray(anniversaries)) {
                anniversaries.forEach(a => { if (a.date && (!earliest || a.date < earliest)) earliest = a.date; });
            }
        } catch (e) {}
        if (!earliest) { daysEl.textContent = '—'; if (dateEl) dateEl.textContent = '设置相遇日期'; return; }
        const start = new Date(earliest + 'T00:00:00');
        const days = Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);
        daysEl.textContent = days;
        if (dateEl) dateEl.textContent = `自 ${earliest} 起`;
    }

    // 当前会话的创建日期（相遇第一天）
    function sessionStartDate() {
        try {
            if (typeof sessionList === 'undefined' || !Array.isArray(sessionList)) return '';
            if (typeof SESSION_ID === 'undefined' || !SESSION_ID) return '';
            const s = sessionList.find(x => x.id === SESSION_ID);
            if (!s || !s.createdAt) return '';
            const d = new Date(s.createdAt);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        } catch (e) { return ''; }
    }

    /* ---------------- 相框 ---------------- */
    function loadPhotos() {
        try { return JSON.parse(localStorage.getItem(PHOTOS_KEY) || '[null,null,null]'); } catch (e) { return [null, null, null]; }
    }
    function savePhotos(arr) {
        try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(arr)); } catch (e) {}
    }

    function renderFrames() {
        const frames = document.querySelectorAll('#home-frames .home-frame');
        const photos = loadPhotos();
        frames.forEach(f => {
            const idx = Number(f.dataset.frame) || 0;
            const img = f.querySelector('.hf-img');
            const hint = f.querySelector('.hf-empty-hint');
            if (!img) return;
            if (photos[idx]) {
                img.style.backgroundImage = `url(${photos[idx]})`;
                f.classList.add('has-photo');
                if (hint) hint.style.display = 'none';
            } else {
                img.style.backgroundImage = '';
                f.classList.remove('has-photo');
                if (hint) hint.style.display = '';
            }
        });
    }

    let pressTimer = null;
    let longPressed = false;

    function openPhotoPicker(replaceIdx) {
        const input = document.getElementById('home-photo-input');
        if (!input) return;
        input._targetIdx = replaceIdx;
        input.value = '';
        input.click();
    }

    function removeFrameMenu(idx, frameEl) {
        const old = document.getElementById('home-frame-menu');
        if (old) old.remove();
        const menu = document.createElement('div');
        menu.id = 'home-frame-menu';
        menu.className = 'home-frame-menu';
        menu.innerHTML = `
            <button data-act="replace"><i class="fas fa-repeat"></i> 更换</button>
            <button data-act="delete" class="danger"><i class="fas fa-trash-can"></i> 删除</button>`;
        menu.style.left = '50%';
        menu.style.top = '50%';
        menu.style.transform = 'translate(-50%,-50%)';
        // 优先贴近所按的相框显示
        const rect = frameEl ? frameEl.getBoundingClientRect() : null;
        if (rect) {
            menu.style.transform = 'none';
            const mw = 132, mh = 96;
            let left = rect.left + rect.width / 2 - mw / 2;
            left = Math.max(10, Math.min(left, window.innerWidth - mw - 10));
            let top = rect.bottom + 8;
            if (top + mh > window.innerHeight - 12) top = Math.max(12, rect.top - mh - 8);
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
            menu.style.minWidth = mw + 'px';
        }
        menu.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const photos = loadPhotos();
            if (btn.dataset.act === 'replace') openPhotoPicker(idx);
            else if (btn.dataset.act === 'delete') { photos[idx] = null; savePhotos(photos); renderFrames(); }
            menu.remove();
        });
        document.body.appendChild(menu);
        setTimeout(() => {
            const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
            document.addEventListener('click', close);
        }, 10);
    }

    function initFrames() {
        const card = document.getElementById('home-frames-card');
        if (!card || card.dataset.framesBound) return;
        card.dataset.framesBound = 'true';

        const input = document.getElementById('home-photo-input');
        if (input) {
            input.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const doAdd = async () => {
                    try {
                        let base64;
                        if (typeof optimizeImage === 'function') base64 = await optimizeImage(file, 720, 0.82);
                        else {
                            base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
                        }
                        const photos = loadPhotos();
                        const idx = (typeof input._targetIdx === 'number') ? input._targetIdx : photos.findIndex(p => !p);
                        if (idx === -1) { // 没有空位则轮换到第 0 格
                            photos.push(base64); photos.shift();
                        } else photos[idx] = base64;
                        savePhotos(photos);
                        renderFrames();
                        if (typeof showNotification === 'function') showNotification('相框已更新 📷', 'success', 1600);
                    } catch (err) {
                        if (typeof showNotification === 'function') showNotification('图片处理失败', 'error');
                    }
                };
                doAdd();
                e.target.value = '';
            });
        }

        const framesEl = document.getElementById('home-frames');
        if (!framesEl) return;

        framesEl.addEventListener('click', (e) => {
            if (longPressed) { longPressed = false; return; }
            const frame = e.target.closest('.home-frame');
            if (!frame) return;
            const idx = Number(frame.dataset.frame) || 0;
            const photos = loadPhotos();
            if (!photos[idx]) { openPhotoPicker(idx); return; }
            // 单击轮换：三张照片先收拢再散开，在中点交换顺序
            const a = photos[0], b = photos[1], c = photos[2];
            if (!(a || b || c)) return;
            if (framesEl.classList.contains('hf-shuffling')) return;
            framesEl.classList.add('hf-shuffling');
            setTimeout(() => { savePhotos([b, c, a]); renderFrames(); }, 250);
            setTimeout(() => framesEl.classList.remove('hf-shuffling'), 560);
        });

        framesEl.addEventListener('contextmenu', (e) => e.preventDefault());
        framesEl.addEventListener('pointerdown', (e) => {
            const frame = e.target.closest('.home-frame');
            if (!frame) return;
            longPressed = false;
            const idx = Number(frame.dataset.frame) || 0;
            pressTimer = setTimeout(() => {
                longPressed = true;
                if (navigator.vibrate) navigator.vibrate(30);
                removeFrameMenu(idx, frame);
            }, 500);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
            framesEl.addEventListener(ev, () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } })
        );
        framesEl.addEventListener('pointermove', (e) => {
            if (pressTimer && Math.abs(e.movementX) + Math.abs(e.movementY) > 8) { clearTimeout(pressTimer); pressTimer = null; }
        });
    }

    /* ---------------- 主题 ---------------- */
    function applyHomeTheme() {
        const page = document.getElementById('home-page');
        if (!page) return;
        const t = (typeof settings !== 'undefined' && settings.homeTheme) || {};
        page.style.setProperty('--home-accent', t.accent || DEFAULT_ACCENT);
        page.style.setProperty('--home-frame', t.frame || DEFAULT_FRAME);
        const bgVal = t.bg ? `url(${t.bg})` : (window.BUILTIN_SNOW_BG ? `url(${window.BUILTIN_SNOW_BG})` : 'none');
        page.style.setProperty('--home-bg-image', bgVal);
        // 同步到根节点：朋友圈封面等其它页面复用同一张背景
        try { document.documentElement.style.setProperty('--home-bg-image', bgVal); } catch (e) {}
    }
    window.applyHomeTheme = applyHomeTheme;
    window.HOME_THEME_DEFAULT = { accent: DEFAULT_ACCENT, frame: DEFAULT_FRAME };

    /* ---------------- 入口绑定 ---------------- */
    function triggerStub(id) {
        const el = document.getElementById(id);
        if (el) { el.click(); return true; }
        return false;
    }

    function initHomeBindings() {
        // 顶栏：主页按钮
        const topBtn = document.getElementById('home-top-btn');
        if (topBtn && !topBtn.dataset.hb) {
            topBtn.dataset.hb = '1';
            topBtn.addEventListener('click', () => { hideHomePage(); showHomePage(); renderHome(); });
        }
        const tileChat = document.getElementById('home-tile-chat');
        if (tileChat && !tileChat.dataset.hb) {
            tileChat.dataset.hb = '1';
            tileChat.addEventListener('click', () => { clearChatUnread(); hideHomePage(); });
        }
        const tileMoments = document.getElementById('home-tile-moments');
        if (tileMoments && !tileMoments.dataset.hb) {
            tileMoments.dataset.hb = '1';
            tileMoments.addEventListener('click', () => { if (typeof openMomentsPanel === 'function') openMomentsPanel(); else triggerStub('moments-top-btn'); });
        }
        const tileLetter = document.getElementById('home-tile-letter');
        if (tileLetter && !tileLetter.dataset.hb) {
            tileLetter.dataset.hb = '1';
            tileLetter.addEventListener('click', () => triggerStub('envelope-function'));
        }
        const tileReplies = document.getElementById('home-tile-replies');
        if (tileReplies && !tileReplies.dataset.hb) {
            tileReplies.dataset.hb = '1';
            tileReplies.addEventListener('click', () => triggerStub('custom-replies-function'));
        }
        const tileAdvanced = document.getElementById('home-tile-advanced');
        if (tileAdvanced && !tileAdvanced.dataset.hb) {
            tileAdvanced.dataset.hb = '1';
            tileAdvanced.addEventListener('click', () => showModal(document.getElementById('advanced-modal')));
        }
        const tileSettings = document.getElementById('home-tile-settings');
        if (tileSettings && !tileSettings.dataset.hb) {
            tileSettings.dataset.hb = '1';
            tileSettings.addEventListener('click', () => showModal(document.getElementById('settings-modal')));
        }
        const statusCard = document.getElementById('home-status-mood');
        const annivCard = document.getElementById('home-anniv-card');
        if (annivCard && !annivCard.dataset.hb) {
            annivCard.dataset.hb = '1';
            annivCard.addEventListener('click', () => triggerStub('anniversary-function'));
        }

        // 首行左框头像：展示上传的头像，点击可上传 / 更换（复用聊天界面的头像上传弹窗）
        [['home-av-partner', true], ['home-av-me', false]].forEach(([id, isPartner]) => {
            const av = document.getElementById(id);
            if (av && !av.dataset.hb) {
                av.dataset.hb = '1';
                av.style.cursor = 'pointer';
                av.title = '点击' + (isPartner ? '更换对方头像' : '更换我的头像');
                av.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (typeof window.openAvatarModal === 'function') window.openAvatarModal(isPartner);
                });
            }
        });

        initFrames();
        initPhoneModal();
    }

    /* ---------------- 启动 ---------------- */
    function boot() {
        initHomeBindings();
        // 决定进入主页的时机：
        // 1) 已看过声明（tour_seen）→ 初始化后直接进入主页
        // 2) 未看过 → 声明接受后 startTour；引导结束（endTour）时进入主页
        const checkSeen = () => {
            try {
                if (window.localforage && window.APP_PREFIX) {
                    localforage.getItem(window.APP_PREFIX + 'tour_seen').then(seen => {
                        if (seen && !homeOpen) setTimeout(showHomePage, 600);
                    }).catch(() => {});
                }
            } catch (e) {}
        };
        // welcome 动画期间就把主页铺好（公告层覆盖在其上），关闭公告时无聊天页闪过
        setTimeout(checkSeen, 1200);
        setTimeout(checkSeen, 3600);

        // 兜底轮询：声明层与引导层都消失且看过声明 → 进主页
        let tries = 0;
        const iv = setInterval(() => {
            tries++;
            if (homeOpen || tries > 60) { clearInterval(iv); return; }
            const disc = document.getElementById('disclaimer-modal');
            const tour = document.getElementById('tour-overlay');
            const discGone = !disc || disc.style.display === 'none';
            const tourGone = !tour || tour.style.display === 'none' || !tour.classList.contains('active');
            if (discGone && tourGone) {
                try {
                    if (window.localforage && window.APP_PREFIX) {
                        localforage.getItem(window.APP_PREFIX + 'tour_seen').then(seen => {
                            if (seen) showHomePage();
                        }).catch(() => {});
                    }
                } catch (e) {}
            }
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
