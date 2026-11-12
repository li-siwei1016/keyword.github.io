/**
 * redpacket.js - 红包 / 转账
 * · 聊天过程中，对方按概率随机发红包或转账（概率在 聊天设置→节奏 中调节）
 * · 我方也可通过底部栏 + 菜单主动发送
 * · 消息以 rp-bubble 呈现，点击拆开，对方/我方收到后互道感谢
 */
(function () {
    const NOTES = ['点开有惊喜', '小小心意，请收下', '给你的下午茶基金', '奖励今天可爱的你', '记得查收呀'];
    const TRANSFER_NOTES = ['转给你一份心意', '拿去买点喜欢的', '请你喝奶茶的', '给你的零花钱'];

    function pickAmount() {
        // 生成 5.20 ~ 66.66 的吉祥金额
        const pool = [5.20, 13.14, 20.00, 52.00, 52.10, 66.66, 8.88, 6.66, 9.99, 520.00];
        const v = pool[Math.floor(Math.random() * pool.length)];
        return v.toFixed(2);
    }

    function buildPacket(kind, sender) {
        const isTransfer = kind === 'transfer';
        return {
            type: 'redpacket',
            sender: sender,
            rpKind: kind,
            rpAmount: '¥ ' + pickAmount(),
            rpNote: (isTransfer ? TRANSFER_NOTES : NOTES)[Math.floor(Math.random() * (isTransfer ? TRANSFER_NOTES.length : NOTES.length))],
            rpOpened: false,
            text: isTransfer ? '[转账]' : '[红包]'
        };
    }

    /* -------- 对方概率触发：挂在对方消息发送后 -------- */
    function maybePartnerRedpacket() {
        if (document.hidden) return;
        const chance = (typeof settings !== 'undefined' && Number(settings.redpacketChance) || 0);
        if (chance <= 0 || Math.random() * 100 >= chance) return;
        if (typeof addMessage !== 'function') return;
        // 距离上一个红包至少 3 分钟，避免刷屏
        const last = (typeof messages !== 'undefined' ? messages : []).filter(m => m.type === 'redpacket').pop();
        if (last && Date.now() - new Date(last.timestamp).getTime() < 3 * 60 * 1000) return;
        const kind = Math.random() < 0.6 ? 'redpacket' : 'transfer';
        setTimeout(() => addMessage(buildPacket(kind, 'partner')), 900);
    }

    // 拦截对方的普通回复：在 simulateReply / addMessage(partner) 后挂接
    function hookPartnerMessages() {
        if (typeof window.addMessage !== 'function' && typeof addMessage !== 'function') return;
        const orig = (typeof addMessage === 'function') ? addMessage : window.addMessage;
        function wrapped(msg, ...rest) {
            const r = orig.apply(this, [msg, ...rest]);
            try {
                if (msg && msg.sender === 'partner' && (!msg.type || msg.type === 'normal')) {
                    setTimeout(maybePartnerRedpacket, 100);
                }
            } catch (e) {}
            return r;
        }
        try {
            // addMessage 通常是 window 级函数
            if (typeof window.addMessage === 'function') {
                window.addMessage = wrapped;
            } else if (typeof addMessage === 'function') {
                // 无法直接覆盖局部函数时退化为轮询（由 init 内定时器触发）
                if (!window.__rpPoll) {
                    window.__rpPoll = setInterval(maybePartnerRedpacket, 90 * 1000);
                }
            }
        } catch (e) {}
    }

    /* -------- 我方通过 + 菜单发送 -------- */
    function sendUserPacket(kind) {
        if (typeof addMessage !== 'function' && typeof window.addMessage !== 'function') return;
        const add = typeof addMessage === 'function' ? addMessage : window.addMessage;
        const p = buildPacket(kind, 'user');
        add(p);
        if (typeof hidePlusMenu === 'function') hidePlusMenu();
        if (typeof showNotification === 'function') showNotification(kind === 'transfer' ? '转账已发出' : '红包已发出', 'success', 1500);
    }

    function initRedpacket() {
        hookPartnerMessages();
        const pmRp = document.getElementById('pm-redpacket');
        if (pmRp && !pmRp.dataset.rpBound) {
            pmRp.dataset.rpBound = '1';
            pmRp.addEventListener('click', () => {
                const kind = Math.random() < 0.5 ? 'redpacket' : 'transfer';
                sendUserPacket(kind);
            });
        }
        // 兜底轮询（对方回复可能不走 window.addMessage）
        if (!window.__rpPoll) {
            window.__rpPoll = setInterval(maybePartnerRedpacket, 120 * 1000);
        }
    }

    window.maybePartnerRedpacket = maybePartnerRedpacket;
    window.sendUserRedpacket = sendUserPacket;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRedpacket);
    } else {
        initRedpacket();
    }
})();
