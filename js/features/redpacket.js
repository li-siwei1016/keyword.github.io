/**
 * redpacket.js - 红包 / 转账（微信风格）
 * · 我方发送：+ 菜单打开发送面板，可自定义数额，提供寓意金额快捷选择
 * · 我方发出后：对方自行领取并回复；对方有 1% 概率退还
 * · 对方发出：按概率随机发送（聊天设置→节奏 中调节），我方点击领取，对方不回复
 * · 气泡样式参照微信，双方发出时均带头像（渲染见 core.js）
 */
(function () {
    /* 寓意金额池：对方随机发送 / 我方快捷选择都用它 */
    const AMOUNT_PRESETS = [
        { v: '5.20', m: '我爱你' },
        { v: '13.14', m: '一生一世' },
        { v: '6.66', m: '顺顺利利' },
        { v: '8.88', m: '发发发' },
        { v: '9.99', m: '长长久久' },
        { v: '20.00', m: '爱你' },
        { v: '52.00', m: '双倍爱你' },
        { v: '66.66', m: '万事大顺' },
        { v: '520.00', m: '一生一世只爱你' }
    ];
    const PACKET_NOTES = ['恭喜发财，大吉大利', '小小心意，请收下', '给你的下午茶基金', '奖励今天可爱的你', '记得查收呀'];
    const TRANSFER_NOTES = ['转给你一份心意', '拿去买点喜欢的', '请你喝奶茶的', '给你的零花钱'];
    const THANKS_POOL = ['谢谢你呀，突然的惊喜最动人了。', '收下了！这份心意我记在心里。', '哇，被你宠到了，谢谢。', '这就把温柔存起来，谢谢你！', '收到啦，你最好了。'];
    const RETURN_NOTES = ['心意我领了，这个就不收啦，你留着买点好吃的。', '红包就不收啦，你的心意比金额贵重多了。', '退还给你～你对我好，不需要用这个证明。'];

    function fmtAmount(v) {
        const n = Number(v);
        if (!isFinite(n) || n <= 0) return null;
        return '¥ ' + n.toFixed(2);
    }

    function pickAmount() {
        const v = AMOUNT_PRESETS[Math.floor(Math.random() * AMOUNT_PRESETS.length)].v;
        return '¥ ' + Number(v).toFixed(2);
    }

    function buildPacket(kind, sender, amount, note) {
        const isTransfer = kind === 'transfer';
        return {
            id: Date.now() + Math.floor(Math.random() * 1000),
            type: 'redpacket',
            sender: sender,
            timestamp: new Date(),
            status: 'sent',
            rpKind: kind,
            rpAmount: amount || pickAmount(),
            rpNote: note || (isTransfer ? TRANSFER_NOTES[Math.floor(Math.random() * TRANSFER_NOTES.length)] : PACKET_NOTES[Math.floor(Math.random() * PACKET_NOTES.length)]),
            rpOpened: false,
            rpReturned: false,
            text: isTransfer ? '[转账]' : '[红包]'
        };
    }

    /* -------- 对方概率触发：对方消息发送后概率追加红包 -------- */
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

    /* -------- 我方发送后的对方行为：自行领取并回复，1% 退还 -------- */
    function schedulePartnerClaim(msg) {
        const wait = 2500 + Math.random() * 3500;
        setTimeout(() => {
            try {
                const target = (typeof messages !== 'undefined' ? messages : []).find(m => String(m.id) === String(msg.id));
                if (!target || target.rpOpened || target.rpReturned) return;
                const kind = target.rpKind === 'transfer' ? '转账' : '红包';
                // 1% 概率退还
                if (Math.random() < 0.01) {
                    target.rpReturned = true;
                    if (typeof throttledSaveData === 'function') throttledSaveData();
                    if (typeof renderMessages === 'function') renderMessages();
                    setTimeout(() => {
                        addMessage({ sender: 'partner', type: 'normal', text: RETURN_NOTES[Math.floor(Math.random() * RETURN_NOTES.length)] });
                    }, 900 + Math.random() * 1200);
                    return;
                }
                // 对方自行领取
                target.rpOpened = true;
                if (typeof throttledSaveData === 'function') throttledSaveData();
                if (typeof renderMessages === 'function') renderMessages();
                setTimeout(() => {
                    const thanks = THANKS_POOL[Math.floor(Math.random() * THANKS_POOL.length)];
                    addMessage({ sender: 'partner', type: 'normal', text: `收到你的${kind}啦，${thanks}` });
                }, 900 + Math.random() * 1800);
            } catch (e) {}
        }, wait);
    }

    /* -------- 发送面板（+ 菜单进入） -------- */
    let composerEl = null;

    function closeComposer() {
        if (composerEl) { composerEl.remove(); composerEl = null; }
    }

    function openPacketComposer() {
        if (composerEl) { closeComposer(); return; }
        if (typeof hidePlusMenu === 'function') hidePlusMenu();

        let kind = 'redpacket';
        let amount = '';
        composerEl = document.createElement('div');
        composerEl.className = 'rp-composer-overlay';
        composerEl.innerHTML = `
            <div class="rp-composer">
                <div class="rp-c-title"><i class="fas fa-gift"></i> 发红包 / 转账</div>
                <div class="rp-c-kinds">
                    <button class="rp-c-kind active" data-kind="redpacket"><i class="fas fa-envelope-open-text"></i> 红包</button>
                    <button class="rp-c-kind" data-kind="transfer"><i class="fas fa-arrow-right-arrow-left"></i> 转账</button>
                </div>
                <div class="rp-c-amount-row">
                    <span class="rp-c-yen">¥</span>
                    <input type="number" class="rp-c-amount" id="rp-c-amount" min="0.01" step="0.01" placeholder="自定义金额">
                </div>
                <div class="rp-c-presets">
                    ${AMOUNT_PRESETS.slice(0, 8).map(p => `<button class="rp-c-preset" data-v="${p.v}"><b>${p.v}</b><span>${p.m}</span></button>`).join('')}
                </div>
                <input type="text" class="rp-c-note" id="rp-c-note" maxlength="20" placeholder="恭喜发财，大吉大利">
                <div class="rp-c-actions">
                    <button class="rp-c-cancel">取消</button>
                    <button class="rp-c-send">塞钱进红包</button>
                </div>
            </div>`;
        document.body.appendChild(composerEl);

        const sendBtn = composerEl.querySelector('.rp-c-send');
        const noteInput = composerEl.querySelector('#rp-c-note');
        const amountInput = composerEl.querySelector('#rp-c-amount');

        composerEl.querySelectorAll('.rp-c-kind').forEach(btn => {
            btn.addEventListener('click', () => {
                kind = btn.dataset.kind;
                composerEl.querySelectorAll('.rp-c-kind').forEach(b => b.classList.toggle('active', b === btn));
                noteInput.placeholder = kind === 'transfer' ? '转账说明（选填）' : '恭喜发财，大吉大利';
                sendBtn.textContent = kind === 'transfer' ? '转账' : '塞钱进红包';
            });
        });
        composerEl.querySelectorAll('.rp-c-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                amountInput.value = btn.dataset.v;
                composerEl.querySelectorAll('.rp-c-preset').forEach(b => b.classList.toggle('sel', b === btn));
            });
        });
        composerEl.querySelector('.rp-c-cancel').addEventListener('click', closeComposer);
        composerEl.addEventListener('click', (e) => { if (e.target === composerEl) closeComposer(); });

        sendBtn.addEventListener('click', () => {
            const amt = fmtAmount(amountInput.value);
            if (!amt) {
                if (typeof showNotification === 'function') showNotification('请输入有效金额', 'warning', 1600);
                amountInput.focus();
                return;
            }
            const note = noteInput.value.trim();
            const msg = buildPacket(kind, 'user', amt, note || null);
            const add = (typeof addMessage === 'function') ? addMessage : window.addMessage;
            if (typeof add !== 'function') return;
            add(msg);
            if (typeof playSound === 'function') playSound('send');
            closeComposer();
            schedulePartnerClaim(msg);
        });

        setTimeout(() => amountInput.focus(), 60);
    }

    function initRedpacket() {
        const pmRp = document.getElementById('pm-redpacket');
        if (pmRp && !pmRp.dataset.rpBound) {
            pmRp.dataset.rpBound = '1';
            pmRp.addEventListener('click', openPacketComposer);
        }
    }

    window.maybePartnerRedpacket = maybePartnerRedpacket;
    window.openPacketComposer = openPacketComposer;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRedpacket);
    } else {
        initRedpacket();
    }
})();
