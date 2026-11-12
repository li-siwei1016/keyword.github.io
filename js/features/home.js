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

    /* ---------------- 渲染 ---------------- */
    function renderHome() {
        renderAvatars();
        renderSignatures();
        renderFrames();
        renderClock();
        renderPartnerStatus();
        renderAnniversary();
        applyHomeTheme();
    }

    function renderAvatars() {
        const pAv = document.getElementById('partner-avatar');
        const mAv = document.getElementById('my-avatar');
        const hp = document.getElementById('home-av-partner');
        const hm = document.getElementById('home-av-me');
        if (pAv && hp) hp.innerHTML = pAv.innerHTML;
        if (mAv && hm) hm.innerHTML = mAv.innerHTML;
    }

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
        dEl.textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week}`;
        tEl.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const h = d.getHours();
        let greet = '你好呀';
        for (const [a, b, t] of GREETINGS) { if (h >= a && h < b) { greet = t; break; } }
        gEl.textContent = greet;
    }

    function renderPartnerStatus() {
        const moodEl = document.getElementById('home-status-mood-text');
        const wEl = document.getElementById('home-status-weather-text');
        if (!moodEl || !wEl) return;
        try {
            const data = window.moodData || {};
            const today = todayStr();
            const entry = data[today] || {};
            // 心情 key → 表情/文案
            let moodTxt = '还没有记录';
            const opts = (typeof customMoodOptions !== 'undefined' && customMoodOptions.length ? customMoodOptions : (typeof MOOD_OPTIONS !== 'undefined' ? MOOD_OPTIONS : []));
            if (entry.partner) {
                const opt = opts.find(o => o.key === entry.partner);
                moodTxt = opt ? `${opt.kaomoji} ${opt.label}` : entry.partner;
            }
            moodEl.textContent = moodTxt;
            wEl.textContent = entry.partnerWeather ? `天气：${entry.partnerWeather}` : '点击查看心晴手账';
        } catch (e) {}
    }

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
            // 单击轮换：把三格照片向前轮转一格
            const a = photos[0], b = photos[1], c = photos[2];
            if (a || b || c) { savePhotos([b, c, a]); renderFrames(); }
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
            tileChat.addEventListener('click', hideHomePage);
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
        if (statusCard && !statusCard.dataset.hb) {
            statusCard.dataset.hb = '1';
            statusCard.addEventListener('click', () => triggerStub('mood-function'));
        }
        const annivCard = document.getElementById('home-anniv-card');
        if (annivCard && !annivCard.dataset.hb) {
            annivCard.dataset.hb = '1';
            annivCard.addEventListener('click', () => triggerStub('anniversary-function'));
        }

        initFrames();
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
        // welcome 动画约 3.5s 后隐藏，等它结束再进主页
        setTimeout(checkSeen, 4200);
        setTimeout(checkSeen, 6500);

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
