/**
 * chat-header.js - 聊天页顶部栏：默认收起，长按聊天界面空白处从顶部弹出
 * · 长按（鼠标 / 触控）聊天消息区空白处约 550ms 切换顶部栏显隐
 * · 展开时顶栏从顶部滑落弹出；首次进入聊天时给出一次性新手引导提示
 */
(function () {
    const TIP_KEY = 'chatHeaderTipSeen';
    const HOLD_MS = 550;          // 长按判定时长
    const MOVE_TOLERANCE = 10;    // 允许的指位/鼠标位移（像素）

    function isHomeOpen() {
        try { return typeof window.isHomeOpen === 'function' && window.isHomeOpen(); } catch (e) { return false; }
    }
    function isTourRunning() {
        try { return typeof isTourActive !== 'undefined' && isTourActive; } catch (e) { return false; }
    }

    function setHeaderCollapsed(collapsed) {
        // 新手引导期间保持顶栏可见，避免引导步骤找不到目标
        if (collapsed && isTourRunning()) collapsed = false;
        document.body.classList.toggle('chat-header-collapsed', collapsed);
    }
    function toggleHeader() {
        setHeaderCollapsed(!document.body.classList.contains('chat-header-collapsed'));
        markTipSeen();
    }

    /* ---------------- 首次使用引导提示 ---------------- */
    function markTipSeen() {
        try { localStorage.setItem(TIP_KEY, '1'); } catch (e) {}
        const tip = document.getElementById('chat-header-tip');
        if (tip) tip.remove();
    }

    function maybeShowTip() {
        try { if (localStorage.getItem(TIP_KEY) === '1') return; } catch (e) {}
        if (isHomeOpen() || isTourRunning()) return;
        if (document.getElementById('chat-header-tip')) return;
        const tip = document.createElement('div');
        tip.id = 'chat-header-tip';
        tip.innerHTML = '<i class="fas fa-hand-pointer"></i> 长按聊天界面空白处，顶部栏会从顶部弹出哦';
        tip.addEventListener('click', markTipSeen);
        document.body.appendChild(tip);
        // 8 秒后自动淡出（已读状态不记录，下次仍提示，直到真正长按过）
        setTimeout(() => { if (tip.parentNode) { tip.classList.add('fade'); setTimeout(() => tip.remove(), 600); } }, 8000);
    }

    /* ---------------- 长按空白处唤出 ---------------- */
    // 仅在聊天区域的「空白处」生效：消息气泡、输入框、按钮、菜单等一律排除
    function isBlankTarget(t) {
        return !t.closest('input, textarea, button, a, select, .modal, .message, .message-wrapper, .message-content-wrapper, .system-message, .call-event-message, .chat-input-container, .header, .context-menu, .msg-action-bar');
    }

    function bindLongPress() {
        const container = document.getElementById('chat-container');
        if (!container) return;

        let timer = null;
        let fired = false;
        let sx = 0, sy = 0;

        function clearTimer() {
            if (timer) { clearTimeout(timer); timer = null; }
        }

        container.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (!isBlankTarget(e.target)) return;
            fired = false;
            sx = e.clientX; sy = e.clientY;
            clearTimer();
            timer = setTimeout(() => {
                timer = null;
                fired = true;
                toggleHeader();
                // 触控长按后抑制随后可能触发的 click / contextmenu
                if (e.pointerType !== 'mouse') {
                    const suppress = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
                    container.addEventListener('click', suppress, { capture: true, once: true });
                    setTimeout(() => container.removeEventListener('click', suppress, { capture: true }), 350);
                }
            }, HOLD_MS);
        });

        container.addEventListener('pointermove', (e) => {
            if (!timer) return;
            if (Math.abs(e.clientX - sx) > MOVE_TOLERANCE || Math.abs(e.clientY - sy) > MOVE_TOLERANCE) clearTimer();
        });

        ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
            container.addEventListener(evt, clearTimer);
        });

        // 长按刚触发后的那次 click 不应再冒泡触发其它逻辑（如隐藏菜单）
        container.addEventListener('click', (e) => {
            if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; }
        }, true);

        // 桌面端右键长按不触发系统菜单干扰（仅空白处）
        container.addEventListener('contextmenu', (e) => {
            if (fired || (timer && isBlankTarget(e.target))) e.preventDefault();
        });
    }

    /* ---------------- 启动：默认收起顶栏 ---------------- */
    function boot() {
        setHeaderCollapsed(true);
        bindLongPress();
        // 进入聊天页（主页关闭）后视情况给出一次性提示
        const tileChat = document.getElementById('home-tile-chat');
        if (tileChat) tileChat.addEventListener('click', () => setTimeout(maybeShowTip, 700));
        // 非首启（无主页流程）也兜底提示一次
        setTimeout(maybeShowTip, 9000);
    }

    window.toggleChatHeader = toggleHeader;
    window.setChatHeaderCollapsed = setHeaderCollapsed;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
