/*核心应用逻辑：数据加载保存、消息渲染、会话管理等*/

        function clearAllAppData() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
    overlay.innerHTML = `
        <div style="background:var(--secondary-bg);border-radius:20px;padding:24px;width:88%;max-width:340px;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:modalContentSlideIn 0.3s ease forwards;">
            <div style="text-align:center;margin-bottom:20px;">
                <div style="width:52px;height:52px;border-radius:50%;background:rgba(255,80,80,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
                    <i class="fas fa-trash-alt" style="color:#ff5050;font-size:20px;"></i>
                </div>
                <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">重置数据</div>
                <div style="font-size:12px;color:var(--text-secondary);">请选择要重置的范围</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button id="_reset_current" style="width:100%;padding:12px 16px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);color:var(--text-primary);font-size:13px;font-weight:600;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;transition:all 0.2s;">
                    <i class="fas fa-comment-slash" style="color:var(--accent-color);font-size:15px;width:18px;text-align:center;"></i>
                    <span>仅清除当前会话消息</span>
                </button>
                <button id="_reset_all" style="width:100%;padding:12px 16px;border:1px solid rgba(255,80,80,0.3);border-radius:12px;background:rgba(255,80,80,0.06);color:#ff5050;font-size:13px;font-weight:600;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;transition:all 0.2s;">
                    <i class="fas fa-bomb" style="font-size:15px;width:18px;text-align:center;"></i>
                    <span>重置所有数据（完全清空）</span>
                </button>
                <button id="_reset_cancel" style="width:100%;padding:10px 16px;border:none;border-radius:12px;background:none;color:var(--text-secondary);font-size:13px;cursor:pointer;transition:all 0.2s;">取消</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    function closeDialog() { overlay.remove(); }
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
    const _resetCancelBtn = document.getElementById('_reset_cancel');
    const _resetCurrentBtn = document.getElementById('_reset_current');
    const _resetAllBtn = document.getElementById('_reset_all');

    if (_resetCancelBtn) _resetCancelBtn.onclick = closeDialog;

    if (_resetCurrentBtn) _resetCurrentBtn.onclick = () => {
        closeDialog();
        if (confirm('确定要清除当前会话的所有消息吗？此操作无法恢复！')) {
            messages = [];
            window.messages = messages; // 双保险：同步 window 属性
            displayedMessageCount = HISTORY_BATCH_SIZE;

            // 立即清除 localStorage 备份，防止 _tryRecoverFromBackup 在 IndexedDB 写入前恢复旧消息
            try { localStorage.removeItem('BACKUP_V1_critical'); } catch(e) {}
            try { localStorage.removeItem('BACKUP_V1_timestamp'); } catch(e) {}

            // 直接写入 IndexedDB（跳过 500ms 防抖），确保刷新后不恢复
            localforage.setItem(getStorageKey('chatMessages'), []).catch(() => {});

            renderMessages();
            showNotification('当前会话消息已清除', 'success');
        }
    };

    if (_resetAllBtn) _resetAllBtn.onclick = () => {
        closeDialog();
        if (confirm('【高危操作】确定要重置所有数据吗？此操作将清除所有本地数据且无法恢复！')) {
            window._skipBackup = true;
            messages = [];
            settings = {};
            localforage.clear().then(() => {
                localStorage.clear();
                showNotification('所有数据已重置，页面即将刷新', 'info', 2000);
                setTimeout(() => { window.location.href = window.location.pathname + '?reset=' + Date.now(); }, 2000);
            }).catch(e => {
                window._skipBackup = false;
                showNotification('清除数据时发生错误', 'error');
                console.error("清除 localforage 失败:", e);
            });
        }
    };
}

function loadMoreHistory() {
    const historyLoader = document.getElementById('history-loader');
    const container = DOMElements && DOMElements.chatContainer;
    const currentOldestMsgIndex = messages.length - displayedMessageCount;

    if (!container) return;
    if (isLoadingHistory) return;

    if (currentOldestMsgIndex <= 0) {
        if (historyLoader) historyLoader.style.display = 'none';
        return;
    }

    isLoadingHistory = true;
    if (historyLoader) historyLoader.style.display = 'flex';

    const visibleWrappers = Array.from(container.querySelectorAll('.message-wrapper'));
    const firstVisible = visibleWrappers.find(function(el) {
        return el.offsetTop + el.offsetHeight >= container.scrollTop;
    }) || visibleWrappers[0] || null;

    const anchorId = firstVisible ? firstVisible.dataset.msgId : null;
    const anchorTop = firstVisible ? firstVisible.getBoundingClientRect().top : 0;

    const prevVisibility = container.style.visibility;
    const prevOverflow = container.style.overflow;
    const prevScrollBehavior = container.style.scrollBehavior;
    const prevOpacity = container.style.opacity;

    container.style.opacity = '0.015';
    container.style.visibility = 'hidden';
    container.style.overflow = 'hidden';
    container.style.scrollBehavior = 'auto';

    setTimeout(() => {
        displayedMessageCount = Math.min(messages.length, displayedMessageCount + HISTORY_BATCH_SIZE);
        renderMessages(true);

        requestAnimationFrame(() => {
            if (anchorId) {
                const newAnchor = container.querySelector('[data-msg-id="' + anchorId + '"]');
                if (newAnchor) {
                    const newTop = newAnchor.getBoundingClientRect().top;
                    container.scrollTop += (newTop - anchorTop);
                }
            }

            requestAnimationFrame(() => {
                container.style.opacity = prevOpacity || '';
                container.style.visibility = prevVisibility || '';
                container.style.overflow = prevOverflow || '';
                container.style.scrollBehavior = prevScrollBehavior || '';

                if (historyLoader) {
                    historyLoader.style.display = (messages.length > displayedMessageCount) ? 'flex' : 'none';
                }
                isLoadingHistory = false;
            });
        });
    }, 120);
}


        function getDefaultSettings() {
            return {
                partnerName: "梦角",
                myName: "我",
                myStatus: "在线",
                partnerStatus: "在线",
                isDarkMode: false,
                colorTheme: "gold",
                soundEnabled: true,
                typingIndicatorEnabled: true,
                readReceiptsEnabled: true,
                replyEnabled: true,
                lastStatusChange: Date.now(),
                nextStatusChange: 1 + Math.random() * 7,
                fontSize: 16,
                bubbleStyle: 'standard',
                messageFontFamily: "'Noto Serif SC', serif",
                messageFontWeight: 400,
                messageLineHeight: 1.5,
                musicPlayerEnabled: false,
                replyDelayMin: 3000,
                replyDelayMax: 7000,
                momentPostChance: 0.3,
                inChatAvatarEnabled: true,
                inChatAvatarSize: 36,
                inChatAvatarPosition: 'center',
                alwaysShowAvatar: false,
                showPartnerNameInChat: false,
                customFontUrl: "", 
        customBubbleCss: "",
        customGlobalCss: "",
                myAvatarFrame: null, 
                partnerAvatarFrame: null,
                myAvatarShape: 'circle',
                partnerAvatarShape: 'circle',
autoSendEnabled: false,
autoSendInterval: 5,
        allowReadNoReply: false, 
        readNoReplyChance: 0.2,
        timeFormat: 'HH:mm',
        customSoundUrl: '',
        // 音效：两方分别可选（若对应 URL 为空则使用内置预设）
        mySendSoundPreset: 'tone_low',
        mySendCustomSoundUrl: '',
        partnerMessageSoundPreset: 'tone_low',
        partnerMessageCustomSoundUrl: '',
        myPokeSoundPreset: 'tone_low',
        myPokeCustomSoundUrl: '',
        partnerPokeSoundPreset: 'tone_low',
        partnerPokeCustomSoundUrl: '',
        soundVolume: 0.15,
        bottomCollapseMode: false,
        emojiMixEnabled: true,
        redpacketChance: 10,
        momentReplyDelay: 30,
        homeTheme: { accent: '', frame: '#ffffff', bg: '' }
            };
        }


        /* 内置默认背景：雪景森林（用户提供的素材，base64 内置，无需外部文件） */
        const BUILTIN_SNOW_BG = 'data:image/jpeg;base64,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'
        window.BUILTIN_SNOW_BG = BUILTIN_SNOW_BG;

        function renderBackgroundGallery() {
            const list = document.getElementById('background-gallery-list');
            if (!list) return;

            list.innerHTML = '';

            
            const addBtn = document.createElement('div');
            addBtn.className = 'bg-item bg-add-btn';
            
            addBtn.innerHTML = '<i class="fas fa-plus"></i><span></span>';
            addBtn.onclick = () => document.getElementById('bg-gallery-input').click();
            list.appendChild(addBtn);

            const currentBg = safeGetItem(getStorageKey('chatBackground'));

            savedBackgrounds.forEach((bg, index) => {
                const item = document.createElement('div');
                let isActive = false;

                if (currentBg && currentBg === bg.value) isActive = true;

                item.className = `bg-item ${isActive ? 'active': ''}`;

                if (bg.type === 'image') {
                    item.innerHTML = `<img src="${bg.value}" loading="lazy" alt="bg">`;
                } else {
                    item.innerHTML = `<div class="bg-color-block" style="background: ${bg.value}"></div>`;
                }

                item.onclick = (e) => {
                    if (e.target.closest('.bg-delete-btn')) return;
                    applyBackground(bg.value);
                    safeSetItem(getStorageKey('chatBackground'), bg.value);
                    localforage.setItem(getStorageKey('chatBackground'), bg.value);
                    renderBackgroundGallery();
                    showNotification('背景已切换', 'success');
                };

                if (bg.id.startsWith('user-')) {
                    const delBtn = document.createElement('div');
                    delBtn.className = 'bg-delete-btn';
                    delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                    delBtn.title = "删除此背景";
                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (confirm('确定删除这张背景图吗？')) {
                            savedBackgrounds.splice(index, 1);
                            saveBackgroundGallery();

                            if (isActive) {
                                removeBackground(); 
                                renderBackgroundGallery();
                            } else {
                                renderBackgroundGallery();
                            }
                        }
                    };
                    item.appendChild(delBtn);
                }

                list.appendChild(item);
            });
        }



        function saveBackgroundGallery() {
    localforage.setItem(getStorageKey('backgroundGallery'), savedBackgrounds);
}


        const applyBackground = (value) => {
            if (!value || typeof value !== 'string') return;
            try {
                if (value.startsWith('linear-gradient') || value.startsWith('#') || value.startsWith('rgb')) {
                    document.documentElement.style.setProperty('--chat-bg-image', value);
                } else {
                    const cssValue = value.startsWith('url(') ? value : `url(${value})`;
                    document.documentElement.style.setProperty('--chat-bg-image', cssValue);
                }
                document.body.classList.add('with-background');
            } catch (e) {
                if (typeof removeBackground === 'function') removeBackground();
            }
        };


const loadData = async () => {
    try {
        settings = getDefaultSettings();

        
        const results = await Promise.allSettled([
            localforage.getItem(getStorageKey('chatSettings')),
            localforage.getItem(getStorageKey('chatMessages')),
            localforage.getItem(getStorageKey('backgroundGallery')),
            localforage.getItem(getStorageKey('customReplies')),
            localforage.getItem(getStorageKey('customPokes')),
            localforage.getItem(getStorageKey('customStatuses')),
            localforage.getItem(getStorageKey('customMottos')),
            localforage.getItem(getStorageKey('customIntros')),
            localforage.getItem(getStorageKey('anniversaries')),
            localforage.getItem(getStorageKey('stickerLibrary')),
            localforage.getItem(`${APP_PREFIX}customThemes`),
            localforage.getItem(getStorageKey('chatBackground')),
            localforage.getItem(getStorageKey('partnerAvatar')),
            localforage.getItem(getStorageKey('myAvatar')),
            localforage.getItem(getStorageKey('partnerPersonas')), 
            localforage.getItem(getStorageKey('showPartnerNameInChat')),
            localforage.getItem(`${APP_PREFIX}themeSchemes`),
            localforage.getItem(getStorageKey('myStickerLibrary')),
            localforage.getItem(getStorageKey('customReplyGroups')),
            localforage.getItem(getStorageKey('customPokeGroups')),
            localforage.getItem(getStorageKey('customStatusGroups'))
        ]);
        const getVal = (index) => results[index].status === 'fulfilled' ? results[index].value : null;

        const savedSettings = getVal(0);
        const savedMessages = getVal(1);
        const savedBgGallery = getVal(2);
        const savedCustomReplies = getVal(3);
        const savedPokes = getVal(4);
        const savedStatuses = getVal(5);
        const savedMottos = getVal(6);
        const savedIntros = getVal(7);
        const savedAnniversaries = getVal(8);
        const savedStickers = getVal(9);
        const savedCustomThemes = getVal(10);
        const savedChatBg = getVal(11);
        const partnerAvatarSrc = getVal(12);
        const myAvatarSrc = getVal(13);
        const savedPartnerPersonas = getVal(14);
        const savedShowNameConfig = getVal(15);
        const savedThemeSchemes = getVal(16);
        const savedMyStickers = getVal(17);
        const savedReplyGroups = getVal(18);
        const savedPokeGroups = getVal(19);
        const savedStatusGroups = getVal(20);

        if (savedPartnerPersonas) partnerPersonas = savedPartnerPersonas;

        if (savedSettings) Object.assign(settings, savedSettings);

        if (settings.showPartnerNameInChat !== undefined) {
            showPartnerNameInChat = settings.showPartnerNameInChat;
        } else if (savedShowNameConfig !== null) {
            showPartnerNameInChat = savedShowNameConfig;
        }
        document.body.classList.toggle('show-partner-name', showPartnerNameInChat);
        try {
            if (settings.customFontUrl) applyCustomFont(settings.customFontUrl);
            if (settings.customBubbleCss) applyCustomBubbleCss(settings.customBubbleCss);
            if (settings.customGlobalCss) applyGlobalThemeCss(settings.customGlobalCss);
        } catch(e) { console.warn("样式应用失败", e); }
        
        if (savedPokes) customPokes = savedPokes;
        else customPokes = [...CONSTANTS.POKE_ACTIONS];

        if (savedStatuses) customStatuses = savedStatuses;
        else customStatuses = [...CONSTANTS.PARTNER_STATUSES];

        if (savedMottos) customMottos = savedMottos;
        else customMottos = [...CONSTANTS.HEADER_MOTTOS];
        
        if (savedIntros) customIntros = savedIntros;
        else customIntros = CONSTANTS.WELCOME_ANIMATIONS.map(a => `${a.line1}|${a.line2}`);

        if (savedMessages && Array.isArray(savedMessages)) {
            messages = savedMessages.map(m => ({
                ...m, timestamp: new Date(m.timestamp)
            }));
        } else {
            const backup = _tryRecoverFromBackup();
            if (backup && Array.isArray(backup.messages) && backup.messages.length > 0) {
                const timeSince = Math.round((Date.now() - backup.ts) / 60000);
                console.warn(`[loadData] 主存储无消息，正在从备份恢复（备份时间：${timeSince} 分钟前）`);
                messages = backup.messages.map(m => ({
                    ...m, timestamp: new Date(m.timestamp)
                }));
                if (backup.settings) Object.assign(settings, backup.settings);
                if (backup.anniversaries && Array.isArray(backup.anniversaries)) {
                    anniversaries = backup.anniversaries;
                }
                setTimeout(() => saveData(), 1000);
                showNotification(
                    `已从备份恢复 ${messages.length} 条消息${backup._truncated ? '（备份为最近200条）' : ''}`,
                    'warning', 6000
                );
            } else {
                messages = [];
            }
        }

        if (savedBgGallery) {
            savedBackgrounds = savedBgGallery;
            if (!savedBackgrounds.some(b => b && b.id === 'builtin-snow')) {
                savedBackgrounds.unshift({ id: 'builtin-snow', type: 'image', value: BUILTIN_SNOW_BG });
            }
        } else {
            savedBackgrounds = [{ id: 'builtin-snow', type: 'image', value: BUILTIN_SNOW_BG }, { id: 'preset-1', type: 'color', value: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }];
        }

        if (savedCustomReplies) customReplies = savedCustomReplies;
        if (savedReplyGroups) window.customReplyGroups = savedReplyGroups;
        if (savedPokeGroups) window.customPokeGroups = savedPokeGroups;
        if (savedStatusGroups) window.customStatusGroups = savedStatusGroups;
        if (savedAnniversaries) anniversaries = savedAnniversaries;
        if (savedStickers) stickerLibrary = savedStickers;
        if (savedMyStickers) myStickerLibrary = savedMyStickers;
        if (savedCustomThemes) customThemes = savedCustomThemes;
        if (savedThemeSchemes) themeSchemes = savedThemeSchemes;
        try { const ce = await localforage.getItem(getStorageKey('customEmojis')); if (ce && Array.isArray(ce)) customEmojis = ce; } catch(e) {}
        window._customReplies = customReplies;
        window._CONSTANTS = CONSTANTS;

        if (DOMElements && DOMElements.partner && DOMElements.me) {
            updateAvatar(DOMElements.partner.avatar, partnerAvatarSrc);
            updateAvatar(DOMElements.me.avatar, myAvatarSrc);
        }

        if (savedChatBg) {
            applyBackground(savedChatBg);
        } else {
            const lsBg = safeGetItem(getStorageKey('chatBackground'));
            if (lsBg) {
                applyBackground(lsBg);
                localforage.setItem(getStorageKey('chatBackground'), lsBg);
            } else {
                // 默认背景：内置雪景
                applyBackground(BUILTIN_SNOW_BG);
                safeSetItem(getStorageKey('chatBackground'), BUILTIN_SNOW_BG);
                localforage.setItem(getStorageKey('chatBackground'), BUILTIN_SNOW_BG);
            }
        }

        try { await initMoodData(); } catch(e) { console.warn("心情数据加载失败", e); }
        try { await loadEnvelopeData(); } catch(e) { console.warn("信封数据加载失败", e); }
        
        displayedMessageCount = HISTORY_BATCH_SIZE;
        
        setTimeout(() => {
            applyAllAvatarFrames();
            manageAutoSendTimer(); 
            checkEnvelopeStatus(); 
            updateUI();
            if (settings.customBubbleCss) {
                try { applyCustomBubbleCss(settings.customBubbleCss); } catch(e) {}
            }
        }, 100);

    } catch (e) {
        console.error("LoadData 内部致命错误:", e);
        settings = getDefaultSettings();
        messages = [];
        updateUI();
    }
};

const LIBRARY_CONFIG = {
    reply: {
        title: "回复库管理",
        tabs: [
            { id: 'custom', name: '主字卡', mode: 'list' },
            { id: 'emojis', name: 'Emoji', mode: 'grid' },
            { id: 'stickers', name: '表情库', mode: 'grid' }
        ]
    },
    slacking: {
        title: "摸鱼管理",
        tabs: [
            { id: 'slkPlaces', name: '地点', mode: 'list' },
            { id: 'slkActs', name: '活动', mode: 'list' }
        ]
    },
    atmosphere: {
        title: "氛围感配置",
        tabs: [
            { id: 'pokes', name: '拍一拍', mode: 'list' },
            { id: 'statuses', name: '对方状态', mode: 'list' },
            { id: 'mottos', name: '顶部格言', mode: 'list' },
            { id: 'intros', name: '开场动画', mode: 'list' }
        ]
    }
};
let currentAnnType = 'anniversary'; 

window.openMyStickerSettings = function() {
    const picker = document.getElementById('user-sticker-picker');
    if (picker) picker.classList.remove('active');
    if (typeof currentMajorTab !== 'undefined') {
        currentMajorTab = 'reply';
        currentSubTab = 'stickers';
    }
    var sidebarBtns = document.querySelectorAll('.sidebar-btn');
    sidebarBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.major === 'reply'); });
    if (typeof renderReplyLibrary === 'function') renderReplyLibrary();
    var modal = document.getElementById('custom-replies-modal');
    if (modal && typeof showModal === 'function') showModal(modal);
};

window.switchAnnType = function(type) {
    currentAnnType = type;
    currentAnniversaryType = type; 
    document.querySelectorAll('.ann-type-btn').forEach(btn => {
        if (btn.dataset.type === type) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    const desc = document.getElementById('ann-type-desc');
    if(desc) {
        desc.textContent = type === 'anniversary' 
            ? '计算从过去某一天到现在已经过了多少天 (例如: 相识、恋爱)' 
            : '计算从现在到未来某一天还剩下多少天 (例如: 生日、跨年)';
    }
};

window.deleteAnniversaryItem = function(id) {
    if(confirm("确定要删除这条记录吗？")) {
        anniversaries = anniversaries.filter(a => a.id !== id);
        throttledSaveData(); 
        renderAnniversariesList();
        showNotification('已删除', 'success');
        if (typeof playSound === 'function') playSound('anniversary');
    }
};

const _BACKUP_PREFIX = 'BACKUP_V1_';
function _backupCriticalData() {
    if (window._skipBackup) return;
    try {
        const backupPayload = {
            ts: Date.now(),
            messages: messages,
            settings: settings,
            sessionId: SESSION_ID,
            anniversaries: anniversaries
        };

        let payloadToStore = backupPayload;
        const msgSizeEstimate = messages.length * 500; 
        if (msgSizeEstimate > 3 * 1024 * 1024) {
            payloadToStore = {
                ...backupPayload,
                messages: messages.slice(-200),
                _truncated: true
            };
        }

        const json = JSON.stringify(payloadToStore);

        if (json.length > 4.5 * 1024 * 1024) {
            const smallerPayload = {
                ...payloadToStore,
                messages: messages.slice(-50),
                _truncated: true
            };
            const smallerJson = JSON.stringify(smallerPayload);
            localStorage.setItem(_BACKUP_PREFIX + 'critical', smallerJson);
        } else {
            localStorage.setItem(_BACKUP_PREFIX + 'critical', json);
        }
        localStorage.setItem(_BACKUP_PREFIX + 'timestamp', String(Date.now()));
    } catch (e) {
        console.warn('localStorage 备份写入失败（可能存储已满）:', e);
    }
}

function _tryRecoverFromBackup() {
    try {
        const raw = localStorage.getItem(_BACKUP_PREFIX + 'critical');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

const saveData = async () => {
    if (!SESSION_ID) {
        console.warn('[saveData] SESSION_ID 尚未初始化，跳过保存以防数据写入临时 key');
        return;
    }

    const promises = [
        { key: 'chatSettings',           val: () => localforage.setItem(getStorageKey('chatSettings'), settings) },
        { key: 'customReplies',          val: () => localforage.setItem(getStorageKey('customReplies'), customReplies) },
        { key: 'customReplyGroups',      val: () => localforage.setItem(getStorageKey('customReplyGroups'), window.customReplyGroups || []) },
        { key: 'customPokeGroups',        val: () => localforage.setItem(getStorageKey('customPokeGroups'), window.customPokeGroups || []) },
        { key: 'customStatusGroups',      val: () => localforage.setItem(getStorageKey('customStatusGroups'), window.customStatusGroups || []) },
        { key: 'customEmojis',           val: () => localforage.setItem(getStorageKey('customEmojis'), customEmojis) },
        { key: 'anniversaries',          val: () => localforage.setItem(getStorageKey('anniversaries'), anniversaries) },
        { key: 'customPokes',            val: () => localforage.setItem(getStorageKey('customPokes'), customPokes) },
        { key: 'customStatuses',         val: () => localforage.setItem(getStorageKey('customStatuses'), customStatuses) },
        { key: 'customMottos',           val: () => localforage.setItem(getStorageKey('customMottos'), customMottos) },
        { key: 'customIntros',           val: () => localforage.setItem(getStorageKey('customIntros'), customIntros) },
        { key: 'stickerLibrary',         val: () => localforage.setItem(getStorageKey('stickerLibrary'), stickerLibrary) },
        { key: 'myStickerLibrary',       val: () => localforage.setItem(getStorageKey('myStickerLibrary'), myStickerLibrary) },
        { key: 'customThemes',           val: () => localforage.setItem(`${APP_PREFIX}customThemes`, customThemes) },
        { key: 'themeSchemes',           val: () => localforage.setItem(`${APP_PREFIX}themeSchemes`, themeSchemes) },
        { key: 'chatMessages',           val: () => localforage.setItem(getStorageKey('chatMessages'), messages) },
    ];

    const partnerAvatarSrc = (() => {
        try {
            const img = DOMElements.partner.avatar.querySelector('img');
            return img ? img.src : null;
        } catch(e) { return null; }
    })();
    const myAvatarSrc = (() => {
        try {
            const img = DOMElements.me.avatar.querySelector('img');
            return img ? img.src : null;
        } catch(e) { return null; }
    })();

    if (partnerAvatarSrc) {
        promises.push({ key: 'partnerAvatar', val: () => localforage.setItem(getStorageKey('partnerAvatar'), partnerAvatarSrc) });
    } else {
        promises.push({ key: 'partnerAvatar', val: () => localforage.removeItem(getStorageKey('partnerAvatar')) });
    }

    if (myAvatarSrc) {
        promises.push({ key: 'myAvatar', val: () => localforage.setItem(getStorageKey('myAvatar'), myAvatarSrc) });
    } else {
        promises.push({ key: 'myAvatar', val: () => localforage.removeItem(getStorageKey('myAvatar')) });
    }

    const results = await Promise.allSettled(promises.map(p => {
        try { return p.val(); }
        catch(e) { return Promise.reject(e); }
    }));

    const failed = [];
    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            failed.push(promises[i].key);
            console.error(`[saveData] 保存失败: ${promises[i].key}`, r.reason);
        }
    });

    if (failed.length > 0) {
        console.warn(`[saveData] ${failed.length} 项写入失败，已触发 localStorage 降级备份`, failed);
    }

    _backupCriticalData();
};

        function initializeRandomUI() {


            document.querySelector('.header-motto').textContent = getRandomItem(CONSTANTS.HEADER_MOTTOS);
if (customMottos && customMottos.length > 0) {
    document.querySelector('.header-motto').textContent = getRandomItem(customMottos);
} else {
    document.querySelector('.header-motto').textContent = '';
}
            const placeholder = "";
            DOMElements.messageInput.placeholder = placeholder.length > 20 ? placeholder.substring(0, 20) + "...": placeholder;


            const starsContainer = document.getElementById('stars-container');
            starsContainer.innerHTML = '';
            const starCount = 80;
            for (let i = 0; i < starCount; i++) {
                const star = document.createElement('div');
                star.className = 'star';
                const x = Math.random() * 100;
                const y = Math.random() * 100;
                const size = Math.random() * 2.5 + 0.5;
                const duration = Math.random() * 4 + 2;
                const delay = Math.random() * 6;
                star.style.left = `${x}%`;
                star.style.top = `${y}%`;
                star.style.width = `${size}px`;
                star.style.height = `${size}px`;
                star.style.setProperty('--duration', `${duration}s`);
                star.style.animationDelay = `${delay}s`;
                starsContainer.appendChild(star);
            }
            const particlesContainer = document.getElementById('welcome-particles');
            if (particlesContainer) {
                particlesContainer.innerHTML = '';
                const types = ['petal', 'petal', 'petal', 'sparkle', 'sparkle'];
                for (let i = 0; i < 22; i++) {
                    const p = document.createElement('div');
                    const type = types[i % types.length];
                    p.className = `wp ${type}`;
                    const sz = type === 'petal' ? (Math.random() * 6 + 5) : (Math.random() * 4 + 2);
                    p.style.setProperty('--pSz', sz + 'px');
                    p.style.left = (Math.random() * 100) + '%';
                    p.style.setProperty('--pDur', (Math.random() * 10 + 9) + 's');
                    p.style.setProperty('--pDel', (Math.random() * 8) + 's');
                    p.style.setProperty('--pX1', (Math.random() * 50 - 25) + 'px');
                    p.style.setProperty('--pX2', (Math.random() * 80 - 40) + 'px');
                    p.style.setProperty('--pX3', (Math.random() * 50 - 25) + 'px');
                    particlesContainer.appendChild(p);
                }
            }

            const meteorsContainer = document.getElementById('welcome-meteors');
            if (meteorsContainer) {
                meteorsContainer.innerHTML = '';
                let meteorCount = 0;
                const MAX_METEORS = 12;
                const createMeteor = () => {
                    if (meteorCount >= MAX_METEORS) return;
                    meteorCount++;
                    const m = document.createElement('div');
                    m.className = 'meteor';
                    m.style.left = (Math.random() * 100) + '%';
                    m.style.top = (Math.random() * 35) + '%';
                    const dur = (Math.random() * 0.8 + 0.7);
                    m.style.setProperty('--mDur', dur + 's');
                    m.style.setProperty('--mDel', '0s');
                    m.style.setProperty('--mRot', (25 + Math.random() * 20) + 'deg');
                    meteorsContainer.appendChild(m);
                    setTimeout(() => { m.remove(); meteorCount = Math.max(0, meteorCount - 1); }, (dur + 0.1) * 1000);
                };
                for (let i = 0; i < 8; i++) setTimeout(createMeteor, i * 350);
                const meteorTimer = setInterval(createMeteor, 600);
                setTimeout(() => clearInterval(meteorTimer), 5000);
            }

            const loaderBarEl = document.getElementById('loader-tech-bar');
            if (loaderBarEl) {
                setTimeout(() => loaderBarEl.classList.add('pulsing'), 300);
            }


            const welcomeIcon = getRandomItem(CONSTANTS.WELCOME_ICONS);
document.querySelector('.logo-icon-main').innerHTML = `<i class="${welcomeIcon}"></i>`;

if (customIntros && customIntros.length > 0) {
    const rawIntro = getRandomItem(customIntros);
    const parts = rawIntro.split('|');
    const line1 = parts[0];
    const line2 = parts[1] || ""; 

    const titleEl = document.getElementById('welcome-title-glitch');
    const subEl = document.getElementById('welcome-subtitle-scramble');

    titleEl.classList.remove('playing');
    titleEl.textContent = line1;
    void titleEl.offsetWidth;
    titleEl.classList.add('playing');

    const scrambleText = (element, finalText, duration = 1500) => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
                const length = finalText.length;
                let start = Date.now();

                const interval = setInterval(() => {
                    const now = Date.now();
                    const progress = (now - start) / duration;

                    if (progress >= 1) {
                        element.textContent = finalText;
                        clearInterval(interval);
                        return;
                    }

                    let result = '';

                    const revealIndex = Math.floor(progress * length);

                    for (let i = 0; i < length; i++) {
                        if (i <= revealIndex) {
                            result += finalText[i];
                        } else {

                            result += chars[Math.floor(Math.random() * chars.length)];
                        }
                    }
                    element.textContent = result;
                },
                    40);
            };


          setTimeout(() => {
        scrambleText(subEl, line2, 2000);
    }, 600);
} else {
    document.getElementById('welcome-title-glitch').textContent = "传讯";
    document.getElementById('welcome-subtitle-scramble').textContent = "请在设置中添加开场动画";
}


            const loaderBar = document.getElementById('loader-tech-bar');
            const statusText = document.getElementById('loader-status-text');
            loaderBar.style.width = '0%';
            const loadingPhases = [
                { width: '15%', text: 'INITIALIZING · 初始化中' },
                { width: '40%', text: 'LOADING MEMORIES · 读取记忆' },
                { width: '70%', text: 'BUILDING WORLD · 构建世界' },
                { width: '90%', text: 'ALMOST THERE · 即将完成' },
                { width: '100%', text: 'CONNECTED · 连接成功' }
            ];
            const delays = [100, 700, 1600, 2400, 2900];
            delays.forEach((delay, i) => {
                setTimeout(() => {
                    loaderBar.style.width = loadingPhases[i].width;
                    if (statusText) statusText.textContent = loadingPhases[i].text;
                }, delay);
            });
        }

function manageAutoSendTimer() {
    if (autoSendTimer) {
        clearInterval(autoSendTimer);
        autoSendTimer = null;
    }
    if (settings.autoSendEnabled) {
        const intervalMs = settings.autoSendInterval * 60 * 1000;
        
        autoSendTimer = setInterval(() => {
            if (!document.body.classList.contains('batch-favorite-mode')) {
                simulateReply(); 
            }
        }, intervalMs);
    }
}

        const updateUI = () => {
            const isCustomTheme = settings.colorTheme.startsWith('custom-');
            if (isCustomTheme) {
                const themeId = settings.colorTheme;
                const theme = customThemes.find(t => t.id === themeId);
                if (theme) {
                    applyTheme(theme.colors);
                } else {
                    DOMElements.html.setAttribute('data-color-theme', 'gold');
                }
            } else {
                DOMElements.html.setAttribute('data-color-theme', settings.colorTheme);
                applyTheme(null, true);
            }
            
            if (settings.customThemeColors && Object.keys(settings.customThemeColors).length > 0) {
                for (const [variable, value] of Object.entries(settings.customThemeColors)) {
                    document.documentElement.style.setProperty(variable, value);
                }
            }

            DOMElements.html.setAttribute('data-theme', settings.isDarkMode ? 'dark': 'light');
            DOMElements.themeToggle.innerHTML = settings.isDarkMode ? '<i class="fas fa-sun"></i>': '<i class="fas fa-moon"></i>';
            DOMElements.partner.name.textContent = settings.partnerName;
            DOMElements.me.name.textContent = settings.myName;
            DOMElements.partner.status.textContent = settings.partnerStatus || '在线';
            DOMElements.me.statusText.textContent = settings.myStatus;
            if (typeof window.updateDynamicNames === 'function') window.updateDynamicNames();
            document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
            
            const fontToUse = settings.messageFontFamily || "'Noto Serif SC', serif";
            
            document.documentElement.style.setProperty('--message-font-family', fontToUse);
            document.documentElement.style.setProperty('--font-family', fontToUse);
            document.documentElement.style.setProperty('--message-font-weight', settings.messageFontWeight);
            document.documentElement.style.setProperty('--message-line-height', settings.messageLineHeight);

            document.documentElement.style.setProperty('--in-chat-avatar-size', `${settings.inChatAvatarSize}px`);
            const _alignMap = { 'top': 'flex-start', 'center': 'center', 'bottom': 'flex-end', 'custom': 'flex-start' };
            document.documentElement.style.setProperty('--avatar-align', _alignMap[settings.inChatAvatarPosition || 'center'] || 'center');
            if (settings.inChatAvatarPosition === 'custom' && settings.inChatAvatarCustomOffset !== undefined) {
                document.documentElement.style.setProperty('--avatar-custom-offset', settings.inChatAvatarCustomOffset + 'px');
            }
            document.body.classList.toggle('always-show-avatar', !!settings.alwaysShowAvatar);
            if (typeof _applyCollapseState === 'function') _applyCollapseState(!!settings.bottomCollapseMode);
            document.body.classList.toggle('show-partner-name', !!(settings.showPartnerNameInChat || showPartnerNameInChat));

            document.querySelectorAll('.theme-color-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === settings.colorTheme);
            });


            document.querySelectorAll('[data-bubble-style]').forEach(item => {
                item.classList.toggle('active', item.dataset.bubbleStyle === settings.bubbleStyle);
            });

            const _pillSyncMap = {
                '#reply-toggle': 'replyEnabled',
                '#sound-toggle': 'soundEnabled',
                '#read-receipts-toggle': 'readReceiptsEnabled',
                '#typing-indicator-toggle': 'typingIndicatorEnabled',
                '#read-no-reply-toggle': 'allowReadNoReply',
                '#emoji-mix-toggle': 'emojiMixEnabled',
                '#auto-send-toggle': 'autoSendEnabled'
            };
            for (const [sel, prop] of Object.entries(_pillSyncMap)) {
                const el = document.querySelector(sel);
                if (el) {
                    const val = prop === 'emojiMixEnabled' ? (settings[prop] !== false) : !!settings[prop];
                    el.classList.toggle('active', val);
                }
            }
            const _immToggle = document.getElementById('immersive-toggle');
            if (_immToggle) _immToggle.classList.toggle('active', document.body.classList.contains('immersive-mode'));

            renderMessages();
        };

        const updateAvatar = (element, src) => {
            if (src) element.innerHTML = `<img src="${src}" alt="avatar">`; else element.innerHTML = `<i class="fas fa-user"></i>`;
        };

        const removeBackground = () => {
            document.documentElement.style.removeProperty('--chat-bg-image');
            document.body.classList.remove('with-background');
            localforage.removeItem(getStorageKey('chatBackground'));
            safeRemoveItem(getStorageKey('chatBackground'));
            // 移除后回到内置雪景默认背景
            setTimeout(() => {
                applyBackground(BUILTIN_SNOW_BG);
                safeSetItem(getStorageKey('chatBackground'), BUILTIN_SNOW_BG);
                localforage.setItem(getStorageKey('chatBackground'), BUILTIN_SNOW_BG);
            }, 60);
            showNotification('已恢复默认雪景背景', 'success');
        };

        window.scrollToQuotedMessage = function(el) {
            const id = el.getAttribute('data-reply-id');
            if (!id) return;
            const tryScroll = () => {
                const target = document.querySelector(`[data-msg-id="${id}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('msg-highlight');
                    setTimeout(() => target.classList.remove('msg-highlight'), 1500);
                    return true;
                }
                return false;
            };
            if (!tryScroll()) {
                const msgIndex = messages.findIndex(m => String(m.id) === String(id));
                if (msgIndex === -1) {
                    if (typeof showNotification === 'function') showNotification('消息可能已被删除', 'info');
                    return;
                }
                const needed = messages.length - msgIndex;
                if (needed > displayedMessageCount) {
                    displayedMessageCount = needed;
                    renderMessages(false);
                    setTimeout(tryScroll, 150);
                } else {
                    if (typeof showNotification === 'function') showNotification('消息可能已被删除', 'info');
                }
            }
        };

function createMessageFragment(msg, prevMsg, nextMsg, lastSenderRef) {
    const fragment = new DocumentFragment();
    const messageDate = new Date(msg.timestamp).toDateString();
    const prevDate = prevMsg ? new Date(prevMsg.timestamp).toDateString() : null;

    if (messageDate !== prevDate) {
        const dateDivider = document.createElement('div');
        dateDivider.className = 'date-divider';
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const displayDate = (messageDate === today) ? '今天' : (messageDate === yesterday) ? '昨天' : new Date(msg.timestamp).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        dateDivider.innerHTML = `<span>${displayDate}</span>`;
        fragment.appendChild(dateDivider);
        lastSenderRef.current = null;
    }

    if (msg.type === 'system') {
        const systemMsgDiv = document.createElement('div');
        systemMsgDiv.className = 'system-message';
        systemMsgDiv.innerHTML = msg.text;
        fragment.appendChild(systemMsgDiv);
        lastSenderRef.current = 'system';
        return fragment;
    }

    if (msg.type === 'call-event') {
        const callEvDiv = document.createElement('div');
        callEvDiv.className = 'call-event-message';
        callEvDiv.dataset.id = msg.id;
        const icon = msg.callIcon || 'fa-video';
        const isRejected = icon === 'fa-phone-slash';
        const colorClass = isRejected ? 'call-event-pill--rejected' : 'call-event-pill--ended';
        const detail = msg.callDetail ? `<span class="call-event-detail">${msg.callDetail}</span>` : '';
        callEvDiv.innerHTML = `<div class="call-event-pill ${colorClass}"><i class="fas ${icon} call-event-icon"></i><span class="call-event-label">${msg.text.replace(/ · .*/, '')}</span>${detail}<button class="call-event-delete" title="删除" onclick="(function(btn){const id=btn.closest('[data-id]').dataset.id;const idx=messages.findIndex(m=>String(m.id)===String(id));if(idx>-1){messages.splice(idx,1);renderMessages();throttledSaveData();}})(this)"><i class="fas fa-times"></i></button></div>`;
        fragment.appendChild(callEvDiv);
        lastSenderRef.current = 'system';
        return fragment;
    }

    if (msg.type === 'redpacket') {
        const rpWrap = document.createElement('div');
        rpWrap.className = `message-wrapper ${msg.sender === 'user' ? 'sent' : 'received'}`;
        rpWrap.dataset.id = msg.id;
        rpWrap.dataset.msgId = msg.id;

        // 头像：与普通消息一致（双方发出时都带头像）
        const rpAvatar = document.createElement('div');
        rpAvatar.className = 'message-avatar';
        if (settings.inChatAvatarEnabled) {
            const isUser = msg.sender === 'user';
            const avatarElement = isUser ? DOMElements.me.avatar : DOMElements.partner.avatar;
            const avatarShape = isUser ? (settings.myAvatarShape || 'circle') : (settings.partnerAvatarShape || 'circle');
            rpAvatar.innerHTML = avatarElement.innerHTML;
            applyAvatarFrame(rpAvatar, isUser ? settings.myAvatarFrame : settings.partnerAvatarFrame);
            ['circle', 'square', 'pentagon', 'heart'].forEach(s => rpAvatar.classList.remove('shape-' + s));
            if (avatarShape !== 'none') rpAvatar.classList.add('shape-' + avatarShape);
        } else {
            rpAvatar.style.display = 'none';
        }
        rpWrap.appendChild(rpAvatar);

        const isTransfer = msg.rpKind === 'transfer';
        const rpNote = msg.rpNote || (isTransfer ? '转给你一份心意' : '恭喜发财，大吉大利');
        const rpAmount = msg.rpAmount || '';
        const rpOpened = !!msg.rpOpened;
        const rpReturned = !!msg.rpReturned;
        const stateTxt = rpReturned ? '已退还' : (rpOpened ? (isTransfer ? '已收款' : '已领取') : (isTransfer ? '待收款' : ''));
        const rpContent = document.createElement('div');
        rpContent.className = 'message-content-wrapper';
        rpContent.innerHTML = `<div class="message-bubble rp-bubble rp-${isTransfer ? 'transfer' : 'packet'}${rpOpened ? ' rp-opened' : ''}${rpReturned ? ' rp-returned' : ''}" data-rpid="${msg.id}">
            <div class="rp-ico"><i class="fas ${isTransfer ? 'fa-arrow-right-arrow-left' : 'fa-envelope-open-text'}"></i></div>
            <div class="rp-body">
                <div class="rp-main">${isTransfer ? rpAmount : rpNote}</div>
                ${isTransfer && rpNote ? `<div class="rp-sub">${rpNote}</div>` : ''}
                ${isTransfer ? `<div class="rp-state">${stateTxt}</div>` : ''}
                <div class="rp-brand">${isTransfer ? '转账' : '传讯红包'}${rpReturned ? ' · 已退还' : (rpOpened ? ' · 已领取' : '')}</div>
            </div>
        </div>`;
        const bubbleEl = rpContent.querySelector('.rp-bubble');
        bubbleEl.addEventListener('click', () => {
            // 只有对方发来的红包/转账可以由我方点击领取；
            // 我方发出的由对方自行领取并回复（见 redpacket.js）
            if (msg.sender !== 'partner' || msg.rpOpened || msg.rpReturned) return;
            msg.rpOpened = true;
            throttledSaveData();
            renderMessages();
            if (typeof playSound === 'function') playSound('receive');
            if (typeof showNotification === 'function') showNotification(`已领取 ${rpAmount}`, 'success', 1800);
            // 对方无需对我方的领取动作进行回复 —— 到此为止
        });
        rpWrap.appendChild(rpContent);
        fragment.appendChild(rpWrap);
        lastSenderRef.current = msg.sender;
        return fragment;
    }

    if (msg.type === 'decision') {
        const decWrap = document.createElement('div');
        decWrap.className = 'decision-card-message';
        decWrap.dataset.id = msg.id;
        decWrap.dataset.msgId = msg.id;
        const decOpts = (msg.decisionOptions || []).map(o => {
            const isChosen = msg.decisionChosen && String(msg.decisionChosen) === String(o);
            return `<div class="decision-card-opt${isChosen ? ' chosen' : ''}"><span class="dco-clover">🍀</span><span class="dco-text">${o}</span>${isChosen ? '<span class="dco-check">✓</span>' : ''}</div>`;
        }).join('');
        decWrap.innerHTML = `<div class="decision-card">
            <div class="decision-card-q"><i class="fas fa-circle-question"></i>${msg.text || ''}</div>
            <div class="decision-card-opts">${decOpts}</div>
            <div class="decision-card-foot${msg.decisionChosen ? ' done' : ''}">${msg.decisionChosen ? 'Ta 选了「' + msg.decisionChosen + '」' : '等待 Ta 选择…'}</div>
        </div>`;
        fragment.appendChild(decWrap);
        lastSenderRef.current = 'system';
        return fragment;
    }

    let showTimestamp = true;
    if (settings.timeFormat === 'off') {
        showTimestamp = false;
    } else if (nextMsg) {
        const currentTs = new Date(msg.timestamp).getTime();
        const nextTs = new Date(nextMsg.timestamp).getTime();
        if (nextMsg.sender === msg.sender && nextMsg.type !== 'system' && (nextTs - currentTs < 60000)) {
            showTimestamp = false;
        }
    }

    let isLastInSenderGroup = true;
    if (nextMsg) {
        const currentTs = new Date(msg.timestamp).getTime();
        const nextTs = new Date(nextMsg.timestamp).getTime();
        if (nextMsg.sender === msg.sender && nextMsg.type !== 'system' && (nextTs - currentTs < 60000)) {
            isLastInSenderGroup = false;
        }
    }

    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${msg.sender === 'user' ? 'sent' : 'received'}`;
    wrapper.dataset.id = msg.id;
    wrapper.dataset.msgId = msg.id;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    if (settings.inChatAvatarPosition === 'custom' && settings.inChatAvatarCustomOffset !== undefined) {
        avatarDiv.style.marginTop = settings.inChatAvatarCustomOffset + 'px';
    }

    const groupMember = (msg.sender !== 'user' && typeof getGroupMemberForMessage === 'function') ? getGroupMemberForMessage(msg.id) : null;

    if (settings.inChatAvatarEnabled) {
        const isSameSenderGroup = groupMember && lastSenderRef.current === 'group_' + (groupMember ? groupMember.name : '');
        const isSameSenderNormal = !groupMember && msg.sender === lastSenderRef.current;
        const shouldHide = !settings.alwaysShowAvatar && (isSameSenderGroup || isSameSenderNormal);
        if (shouldHide) {
            avatarDiv.classList.add('hidden');
        } else if (groupMember) {
            const groupAvatarShape = settings.partnerAvatarShape || 'circle';
            ['circle', 'square', 'pentagon', 'heart'].forEach(s => avatarDiv.classList.remove('shape-' + s));
            if (groupAvatarShape !== 'none') avatarDiv.classList.add('shape-' + groupAvatarShape);
            if (groupMember.avatar) {
                avatarDiv.innerHTML = `<img src="${groupMember.avatar}" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                const initials = (groupMember.name || '?').charAt(0).toUpperCase();
                avatarDiv.innerHTML = `<div style="width:100%;height:100%;background:var(--accent-color);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;">${initials}</div>`;
            }
        } else {
            const isUser = msg.sender === 'user';
            const avatarElement = isUser ? DOMElements.me.avatar : DOMElements.partner.avatar;
            const frameSettings = isUser ? settings.myAvatarFrame : settings.partnerAvatarFrame;
            const avatarShape = isUser ? (settings.myAvatarShape || 'circle') : (settings.partnerAvatarShape || 'circle');
            avatarDiv.innerHTML = avatarElement.innerHTML;
            applyAvatarFrame(avatarDiv, frameSettings);
            ['circle', 'square', 'pentagon', 'heart'].forEach(s => avatarDiv.classList.remove('shape-' + s));
            if (avatarShape !== 'none') avatarDiv.classList.add('shape-' + avatarShape);
        }
    } else {
        avatarDiv.style.display = 'none';
    }
    wrapper.appendChild(avatarDiv);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';

    if (groupMember && groupChatSettings.showName) {
        const nameLabel = document.createElement('div');
        nameLabel.className = 'group-sender-name';
        nameLabel.textContent = groupMember.name;
        const isSameSenderGroupForName = lastSenderRef.current === 'group_' + groupMember.name;
        if (!isSameSenderGroupForName) contentWrapper.appendChild(nameLabel);
    } else if (!groupMember && msg.sender !== 'user' && msg.sender !== null && (settings.showPartnerNameInChat || showPartnerNameInChat)) {
        const isSameSenderForName = lastSenderRef.current === msg.sender;
        if (!isSameSenderForName) {
            const nameLabel = document.createElement('div');
            nameLabel.className = 'group-sender-name';
            nameLabel.textContent = settings.partnerName || msg.sender || '对方';
            contentWrapper.appendChild(nameLabel);
        }
    }

    let messageHTML = '';
    if (msg.replyTo) {
        const repliedText = msg.replyTo.text || (msg.replyTo.image ? '🖼 图片' : '[消息]');
        const repliedSender = msg.replyTo.sender === 'user' ? (settings.myName || '我') : (settings.partnerName || '对方');
        messageHTML += `<div class="reply-indicator" data-reply-id="${msg.replyTo.id || ''}" style="cursor:pointer;" onclick="scrollToQuotedMessage(this)"><span class="reply-indicator-sender">${repliedSender}</span><span class="reply-indicator-text">${repliedText}</span></div>`;
    }

    const isImageOnly = !msg.text && !!msg.image;
    let content = msg.text ? `<div>${msg.text.replace(/\n/g, '<br>')}</div>` : '';
    if (msg.image) content += `<img src="${msg.image}" class="message-image${isImageOnly ? ' message-image-only' : ''}" alt="图片" style="max-width:${isImageOnly ? '100px' : '100px'}; border-radius: 12px;${!isImageOnly ? ' margin-top: 6px;' : ''} cursor: pointer;" onclick="viewImage('${msg.image}')">`;
    messageHTML += content;

    const messageDiv = document.createElement('div');
    if (isImageOnly) {
        messageDiv.className = `message message-${msg.sender === 'user' ? 'sent' : 'received'} message-image-bubble-none`;
    } else {
        messageDiv.className = `message message-${msg.sender === 'user' ? 'sent' : 'received'} ${settings.bubbleStyle}`;
    }
    messageDiv.innerHTML = messageHTML;

    let actionsHTML = '';
    if (settings.replyEnabled) actionsHTML += `<button class="meta-action-btn reply-btn" title="回复"><i class="fas fa-reply"></i></button>`;
    const starIcon = msg.favorited ? 'fas fa-star' : 'far fa-star';
    actionsHTML += `<button class="meta-action-btn favorite-action-btn ${msg.favorited ? 'favorited' : ''}" title="${msg.favorited ? '取消收藏' : '收藏'}"><i class="${starIcon}"></i></button>`;
    actionsHTML += `<button class="meta-action-btn delete-btn" title="删除"><i class="fas fa-trash-alt"></i></button>`;
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-meta-actions';
    actionsDiv.innerHTML = actionsHTML;

    let metaHTML = '';
    if (showTimestamp) {
        const ts = new Date(msg.timestamp);
        let timeStr;
        const fmt = settings.timeFormat || 'HH:mm';
        if (fmt === 'HH:mm:ss') {
            timeStr = ts.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        } else if (fmt === 'h:mm AM/PM') {
            timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        } else if (fmt === 'h:mm:ss AM/PM') {
            timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        } else {
            timeStr = ts.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        metaHTML += `<div class="timestamp">${timeStr}</div>`;
    }

    if (msg.sender === 'user' && settings.readReceiptsEnabled && isLastInSenderGroup) {
        const rrStyle = settings.readReceiptStyle || 'icon';
        if (rrStyle === 'text') {
            if (msg.status === 'read') {
                metaHTML += `<div class="read-receipt read" style="font-size:9px;letter-spacing:0.3px;font-weight:500;">已读</div>`;
            } else {
                metaHTML += `<div class="read-receipt" style="font-size:9px;letter-spacing:0.3px;opacity:0.5;">未读</div>`;
            }
        } else {
            const statusIcon = msg.status === 'read' ? 'fa-check-double' : 'fa-check';
            metaHTML += `<div class="read-receipt ${msg.status === 'read' ? 'read' : ''}"><i class="fas ${statusIcon}"></i></div>`;
        }
    }

    if (metaHTML !== '') {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';
        if (!showTimestamp && !metaHTML.includes('timestamp')) {
            metaDiv.style.height = 'auto';
            metaDiv.style.marginTop = '2px';
            if (settings.inChatAvatarPosition !== 'top') {
                avatarDiv.style.marginBottom = '18px';
            }
        } else {
            if (settings.inChatAvatarPosition !== 'top') {
                avatarDiv.style.marginBottom = '26px';
            }
        }
        metaDiv.innerHTML = metaHTML;
        contentWrapper.append(actionsDiv, messageDiv, metaDiv);
    } else {
        contentWrapper.append(actionsDiv, messageDiv);
    }
    wrapper.appendChild(contentWrapper);
    fragment.appendChild(wrapper);

    lastSenderRef.current = groupMember ? ('group_' + groupMember.name) : msg.sender;
    return fragment;
}

function _updateReadReceiptsDOM() {
    const container = DOMElements.chatContainer;
    const rrStyle = settings.readReceiptStyle || 'icon';
    container.querySelectorAll('.message-wrapper.sent').forEach(wrapper => {
        const receiptEl = wrapper.querySelector('.read-receipt');
        if (!receiptEl) return;
        const msgId = wrapper.dataset.msgId || wrapper.dataset.id;
        const msg = messages.find(m => String(m.id) === String(msgId));
        if (!msg || msg.status !== 'read') return;
        if (rrStyle === 'text') {
            receiptEl.classList.add('read');
            receiptEl.textContent = '已读';
            receiptEl.style.opacity = '1';
        } else {
            receiptEl.classList.add('read');
            const icon = receiptEl.querySelector('i');
            if (icon) icon.className = 'fas fa-check-double';
        }
    });
}

function renderMessages(preserveScroll = false) {
    const container = DOMElements.chatContainer;
    const totalMessages = messages.length;
    const startIndex = Math.max(0, totalMessages - displayedMessageCount);
    const msgsToRender = messages.slice(startIndex);

    const historyLoader = document.getElementById('history-loader');
    if (historyLoader) {
        historyLoader.style.display = startIndex > 0 ? 'flex' : 'none';
    }

    DOMElements.emptyState.style.display = totalMessages === 0 ? 'flex' : 'none';

    const oldScrollHeight = container.scrollHeight;
    const oldScrollTop = container.scrollTop;
    
    container.innerHTML = '';

    const fragment = new DocumentFragment();
    
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    fragment.appendChild(spacer);

    let lastSenderRef = { current: null };
    msgsToRender.forEach((msg, i) => {
        const prevMsg = i > 0 ? msgsToRender[i - 1] : (startIndex > 0 ? messages[startIndex - 1] : null);
        const nextMsg = i < msgsToRender.length - 1 ? msgsToRender[i + 1] : null;
        const msgFragment = createMessageFragment(msg, prevMsg, nextMsg, lastSenderRef);
        fragment.appendChild(msgFragment);
    });

    container.appendChild(fragment);

    if (preserveScroll) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    } else {
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }
}

const addMessage = (message) => {
    if (!(message.timestamp instanceof Date)) message.timestamp = new Date(message.timestamp);
    if (isNaN(new Date(message.timestamp).getTime())) message.timestamp = new Date();
    
    const container = DOMElements.chatContainer;
    const wasEmpty = messages.length === 0;

    const prevMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    messages.push(message);
    
    if (wasEmpty) {
        DOMElements.emptyState.style.display = 'none';
    }

    // --- Update previous message if needed ---
    const existingWrappers = container.querySelectorAll('.message-wrapper');
    const lastWrapper = existingWrappers.length > 0 ? existingWrappers[existingWrappers.length - 1] : null;
    if (lastWrapper && prevMsg) {
        const currentTs = new Date(message.timestamp).getTime();
        const prevTs = new Date(prevMsg.timestamp).getTime();

        if (message.sender === prevMsg.sender && message.type === 'normal' && prevMsg.type === 'normal' && (currentTs - prevTs < 60000)) {
            const metaEl = lastWrapper.querySelector('.message-meta');
            if (metaEl) metaEl.style.display = 'none';
            const avatarEl = lastWrapper.querySelector('.message-avatar');
            if (avatarEl) avatarEl.style.marginBottom = '';
        }
    }
    
    // --- Append new message ---
    let lastSenderRef = { current: null };
    if (prevMsg) {
        const prevGroupMember = (prevMsg.sender !== 'user' && typeof getGroupMemberForMessage === 'function') ? getGroupMemberForMessage(prevMsg.id) : null;
        lastSenderRef.current = prevGroupMember ? ('group_' + prevGroupMember.name) : prevMsg.sender;
    }
    
    const newMsgFragment = createMessageFragment(message, prevMsg, null, lastSenderRef);
    
    const spacer = container.querySelector('div[style*="flex: 1"]');
    if (spacer && spacer === container.lastElementChild) {
        spacer.before(newMsgFragment);
    } else {
        container.appendChild(newMsgFragment);
    }

    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });

    // 对方发来普通消息后，按概率触发红包/转账（概率见 聊天设置）
    try {
        if (message.sender === 'partner' && (!message.type || message.type === 'normal') &&
            typeof window.maybePartnerRedpacket === 'function') {
            setTimeout(window.maybePartnerRedpacket, 120);
        }
    } catch (e) {}

    // 对方发来消息时，若主页打开中，在「聊天」图标上记未读红点
    try {
        if (message.sender === 'partner' && typeof window.markChatUnread === 'function') {
            window.markChatUnread();
        }
    } catch (e) {}

    throttledSaveData();
};

        window._addCallEvent = (icon, label, detail) => {
            addMessage({
                id: Date.now() + Math.random(),
                sender: 'system',
                text: label + (detail ? ' · ' + detail : ''),
                timestamp: new Date(),
                status: 'received',
                type: 'call-event',
                callIcon: icon || 'fa-video',
                callDetail: detail || null,
                favorited: false,
                note: null,
            });
        };

        function optimizeImage(file, maxWidth = 800, quality = 0.7) {
            return new Promise((resolve, reject) => {
                if (file.size < 300 * 1024) {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                    return;
                }
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let {
                        width,
                        height
                    } = img;
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                    URL.revokeObjectURL(img.src);
                };
                img.onerror = () => {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                    URL.revokeObjectURL(img.src);
                };
                img.src = URL.createObjectURL(file);
            });
        }

        window.updateReplyPreview = function() {
            const container = DOMElements.replyPreviewContainer;
            if (!container) return;
            if (!currentReplyTo) {
                container.innerHTML = '';
                container.style.display = 'none';
                return;
            }
            const senderName = currentReplyTo.sender === 'user' ? (settings.myName || '我') : (settings.partnerName || '对方');
            const previewText = currentReplyTo.text ? currentReplyTo.text.slice(0, 40) : '🖼 图片';
            container.style.display = 'flex';
            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(var(--accent-color-rgb),0.07);border-left:3px solid var(--accent-color);border-radius:0 8px 8px 0;width:100%;">
                    <div style="flex:1;min-width:0;">
                        <span style="font-size:11px;color:var(--accent-color);font-weight:600;">回复 ${senderName}</span>
                        <div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${previewText}</div>
                    </div>
                    <button onclick="currentReplyTo=null;window.updateReplyPreview();" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:2px 4px;font-size:14px;">✕</button>
                </div>`;
        };
        function updateReplyPreview() { window.updateReplyPreview(); }

        // ── 对方拍一拍核心逻辑（提取为独立函数，供随机触发和测试指令共用）──
        window._triggerPartnerPoke = function() {
            let pokeAction = null;

            const groups = window.customPokeGroups || [];
            const allPokes = (typeof customPokes !== 'undefined' ? customPokes : []) || [];

            const enabledGroups = groups.filter(function(g) {
                return !g.disabled && Array.isArray(g.items) && g.items.length > 0;
            });

            const groupedItems = new Set();
            enabledGroups.forEach(function(g) { g.items.forEach(function(t) { groupedItems.add(t); }); });

            const ungroupedPokes = allPokes.filter(function(t) { return !groupedItems.has(t); });

            if (enabledGroups.length > 0) {
                const pickedGroup = enabledGroups[Math.floor(Math.random() * enabledGroups.length)];
                const groupPool = pickedGroup.items.filter(function(t) { return allPokes.includes(t); });
                if (groupPool.length > 0) {
                    pokeAction = groupPool[Math.floor(Math.random() * groupPool.length)];
                }
            }

            if (!pokeAction && ungroupedPokes.length > 0) {
                pokeAction = ungroupedPokes[Math.floor(Math.random() * ungroupedPokes.length)];
            }
            if (!pokeAction && allPokes.length > 0) {
                pokeAction = allPokes[Math.floor(Math.random() * allPokes.length)];
            }
            if (!pokeAction && CONSTANTS.POKE_ACTIONS && CONSTANTS.POKE_ACTIONS.length > 0) {
                pokeAction = getRandomItem(CONSTANTS.POKE_ACTIONS);
            }
            if (!pokeAction) {
                if (typeof showNotification === 'function') showNotification('拍一拍库为空，请先添加内容', 'warning', 2500);
                return;
            }

            if (typeof window._sanitizePokeTextForDisplay === 'function') {
                pokeAction = window._sanitizePokeTextForDisplay(pokeAction);
            }
            const pokeText = (typeof window._formatPartnerPokeText === 'function')
                ? window._formatPartnerPokeText(`${settings.partnerName} ${pokeAction}`)
                : `${settings.partnerName} ${pokeAction}`;

            addMessage({ id: Date.now(), text: pokeText, timestamp: new Date(), type: 'system' });
            if (typeof playSound === 'function') playSound('partner_poke');
            (function(){try{if(window._typingIndicatorAutoHideTimer){clearTimeout(window._typingIndicatorAutoHideTimer);window._typingIndicatorAutoHideTimer=null;}}catch(e){}var _tiW=document.getElementById('typing-indicator-wrapper');if(_tiW){var _tiInner=_tiW.querySelector('.typing-indicator');if(_tiInner){_tiInner.classList.add('hiding');setTimeout(function(){_tiW.style.display='none';if(_tiInner)_tiInner.classList.remove('hiding');},240);}else{_tiW.style.display='none';}}})();
        };

        function sendMessage(textOverride = null, type = 'normal') {
            const text = textOverride || DOMElements.messageInput.value.trim();
            const imageFile = DOMElements.imageInput.files[0];
            if (!text && !imageFile && type === 'normal') return;

            // ── 斜杠指令拦截 ──
            if (text && text.startsWith('/') && type === 'normal') {
                const cmd = text.replace(/\s+/g, '').toLowerCase();
                if (cmd === '/测试拍一拍' || cmd === '/testpoke') {
                    DOMElements.messageInput.value = '';
                    DOMElements.messageInput.style.height = '46px';
                    if (typeof window._triggerPartnerPoke === 'function') window._triggerPartnerPoke();
                    if (typeof showNotification === 'function') showNotification('✦ 强制触发对方拍一拍', 'info', 1800);
                    return;
                }
                if (cmd === '/测试状态更新' || cmd === '/teststatus') {
                    DOMElements.messageInput.value = '';
                    DOMElements.messageInput.style.height = '46px';
                    if (typeof window._triggerStatusChange === 'function') window._triggerStatusChange();
                    if (typeof showNotification === 'function') showNotification('✦ 强制触发状态更新', 'info', 1800);
                    return;
                }
            }

            DOMElements.messageInput.value = '';
            DOMElements.messageInput.style.height = '46px';
            if (imageFile && imageFile.size > MAX_IMAGE_SIZE) {
                showNotification('图片大小不能超过5MB', 'error'); DOMElements.imageInput.value = ''; return;
            }

            const createMessage = (imgSrc = null) => {
                const messageData = {
                    id: Date.now(),
                    sender: 'user',
                    text: text || '',
                    timestamp: new Date(),
                    image: imgSrc,
                    status: 'sent',
                    favorited: false,
                    note: null,
                    replyTo: currentReplyTo,
                    type: type
                };
                if (type === 'system') messageData.sender = null;

                addMessage(messageData);
                if (type !== 'system') playSound('send');
                currentReplyTo = null;
                updateReplyPreview();

if (!isBatchMode && type === 'normal') {
    const delayRange = settings.replyDelayMax - settings.replyDelayMin;
    const randomDelay = settings.replyDelayMin + Math.random() * delayRange;

    const chance = Math.max(0, Math.min(1, Number(settings.readNoReplyChance) || 0));
    const shouldIgnore = settings.allowReadNoReply && (Math.random() < chance);

    const readDelay = 1500 + Math.random() * 2500;
                setTimeout(() => {
        let changed = false;
        messages.forEach(msg => {
            if (msg.sender === 'user' && msg.status !== 'read') {
                msg.status = 'read';
                changed = true;
            }
        });
        if (changed) { _updateReadReceiptsDOM(); throttledSaveData(); }
    }, readDelay);

    if (window._pendingReplyTimer) clearTimeout(window._pendingReplyTimer);
    window._pendingReplyTimer = null;

            if (!shouldIgnore) {
        if (settings.typingIndicatorEnabled) {
            const tiWrapper = document.getElementById('typing-indicator-wrapper');
            const tiLabel = document.getElementById('typing-indicator-label');
            const tiAvatar = document.getElementById('typing-indicator-avatar');
            if (tiLabel) tiLabel.textContent = (settings.partnerName || '对方') + ' 正在输入';
            if (tiWrapper) { 
                positionTypingIndicator(); 
                tiWrapper.style.display = 'block'; 
            }
            if (tiAvatar) {
                const partnerImg = DOMElements.partner.avatar.querySelector('img');
                tiAvatar.innerHTML = partnerImg ? `<img src="${partnerImg.src}">` : '<i class="fas fa-user"></i>';
            }
            if (DOMElements.chatContainer) DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
        }
        window._pendingReplyTimer = setTimeout(() => {
            window._pendingReplyTimer = null;
            simulateReply();
        }, randomDelay);
    }
}
};

            if (imageFile) {
                showNotification('正在优化图片...', 'info', 1500);
                optimizeImage(imageFile).then(createMessage).catch(() => showNotification('图片处理失败', 'error'));
            } else {
                createMessage();
            }
            DOMElements.imageInput.value = '';
        }

        function toggleBatchMode() {
            isBatchMode = !isBatchMode;
            if (DOMElements.batchBtn) {
                DOMElements.batchBtn.classList.toggle('active', isBatchMode);
                DOMElements.batchBtn.title = isBatchMode ? "退出批量模式": "批量发送模式";
            }
            DOMElements.batchPreview.style.display = isBatchMode ? 'flex': 'none';
            const placeholder = "";
            DOMElements.messageInput.placeholder = isBatchMode ? "此刻，想说的有很多很多...": (placeholder.length > 20 ? placeholder.substring(0, 20) + "...": placeholder);
            if (isBatchMode) {
                batchMessages = []; updateBatchPreview();
            }
        }

        function addToBatch(imageOverride = null) {
            const text = DOMElements.messageInput.value.trim();
            if (!text && !imageOverride) return;
            batchMessages.push({
                id: Date.now() + batchMessages.length, text: text || '', image: imageOverride || null
            });
            DOMElements.messageInput.value = ''; DOMElements.messageInput.style.height = '46px';
            updateBatchPreview();
        }

        function updateBatchPreview() {
            const previewContainer = DOMElements.batchPreview;
            let listHTML = '';
            if (batchMessages.length > 0) {
                listHTML = batchMessages.map((msg, index) => {
                    const preview = msg.image
                        ? `<img src="${msg.image}" style="height:36px;width:36px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:6px;">`
                        : '';
                    const label = msg.text
                        ? `<span class="batch-preview-text">${msg.text}</span>`
                        : `<span class="batch-preview-text" style="color:var(--text-secondary);font-style:italic;">图片</span>`;
                    return `<div class="batch-preview-item" data-index="${index}">${preview}${label}<button class="batch-preview-edit" title="编辑"><i class="fas fa-pencil-alt"></i></button><button class="batch-preview-remove"><i class="fas fa-times"></i></button></div>`;
                }).join('');
            } else {
                listHTML = '<div style="text-align: center; color: var(--text-secondary); font-size: 14px; padding: 10px;">つ♡⊂</div>';
            }

            previewContainer.innerHTML = `
        <div class="batch-preview-title">我有很多的话想说…！</div>
        <div class="batch-actions-top" style="display:flex;gap:6px;padding:4px 10px 0;"><label style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:5px 8px;background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:8px;cursor:pointer;font-size:12px;color:var(--text-secondary);"><i class="fas fa-image"></i>添加图片<input type="file" accept="image/*" style="display:none;" id="batch-image-input"></label></div>
        <div class="batch-preview-list">${listHTML}</div>
        <div class="batch-actions">
        <button class="batch-action-btn batch-cancel-btn">取消</button>
        <button class="batch-action-btn batch-send-btn" ${batchMessages.length === 0 ? 'disabled': ''}>发送全部 (${batchMessages.length})</button>
        </div>`;

            const batchImgInput = document.getElementById('batch-image-input');
            if (batchImgInput) {
                batchImgInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > MAX_IMAGE_SIZE) { showNotification('图片超过5MB限制', 'warning'); return; }
                    try {
                        const base64 = await optimizeImage(file, 600, 0.8);
                        addToBatch(base64);
                    } catch(err) { showNotification('图片处理失败', 'error'); }
                    e.target.value = '';
                });
            }
        }

        function sendBatchMessages() {
            if (batchMessages.length === 0) return;
            showNotification(`正在发送 ${batchMessages.length} 条消息...`, 'info', 2000);
            batchMessages.forEach((msg, index) => {
                setTimeout(() => {
                    addMessage({
                        id: Date.now() + index, sender: 'user', text: msg.text || '', image: msg.image || null, timestamp: new Date(), status: 'sent', favorited: false, type: 'normal'
                    });
                    playSound('send');
                }, index * 300);
            });
            const delayRange = settings.replyDelayMax - settings.replyDelayMin;
            const randomDelay = settings.replyDelayMin + Math.random() * delayRange;
            setTimeout(simulateReply, batchMessages.length * 300 + randomDelay);
            isBatchMode = false; batchMessages = [];
            if (DOMElements.batchBtn) DOMElements.batchBtn.classList.remove('active');
            DOMElements.batchPreview.style.display = 'none';
            const placeholder = "";
            DOMElements.messageInput.placeholder = placeholder.length > 20 ? placeholder.substring(0, 20) + "...": placeholder;
        }

        function positionTypingIndicator() {
            var tiW = document.getElementById('typing-indicator-wrapper');
            var inputArea = document.querySelector('.input-area-wrapper');
            if (!tiW || !inputArea) return;
            var h = inputArea.offsetHeight;
            tiW.style.bottom = h + 'px';
        }
        (function() {
            var inputArea = document.querySelector('.input-area-wrapper');
            if (!inputArea) return;
            if (typeof ResizeObserver === 'undefined') {
                window.addEventListener('resize', function() {
                    var tiW = document.getElementById('typing-indicator-wrapper');
                    if (tiW && tiW.style.display !== 'none') positionTypingIndicator();
                });
                return;
            }
            var ro = new ResizeObserver(function() {
                var tiW = document.getElementById('typing-indicator-wrapper');
                if (tiW && tiW.style.display !== 'none') positionTypingIndicator();
            });
            ro.observe(inputArea);
        })();

        window.simulateReply = function() {
            function showTypingIndicator() {
                if (!settings.typingIndicatorEnabled) return;
                const tiWrapper = document.getElementById('typing-indicator-wrapper');
                const tiLabel = document.getElementById('typing-indicator-label');
                const tiAvatar = document.getElementById('typing-indicator-avatar');
                if (tiLabel) tiLabel.textContent = (settings.partnerName || '对方') + ' 正在输入';
                if (tiWrapper) { 
                    positionTypingIndicator(); 
                    tiWrapper.style.display = 'block'; 
                }
                if (tiAvatar) {
                    const partnerImg = DOMElements.partner.avatar.querySelector('img');
                    tiAvatar.innerHTML = partnerImg ? `<img src="${partnerImg.src}">` : '<i class="fas fa-user"></i>';
                }
                DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
            }

            let changed = false;
            messages.forEach(msg => {
                if (msg.sender === 'user' && msg.status !== 'read') {
                    msg.status = 'read'; changed = true;
                }
            });
            if (changed) {
                _updateReadReceiptsDOM(); throttledSaveData();
            }

if (partnerPersonas && partnerPersonas.length > 0 && Math.random() < 0.3) {
                const currentPool = [
                    ...partnerPersonas
                ];
                if(currentPool.length > 0) {
                     const nextPersona = currentPool[Math.floor(Math.random() * currentPool.length)];
                     
                     settings.partnerName = nextPersona.name;
                     DOMElements.partner.name.textContent = nextPersona.name;
                     
                     if (nextPersona.avatar) {
                         updateAvatar(DOMElements.partner.avatar, nextPersona.avatar);
                         localforage.setItem(getStorageKey('partnerAvatar'), nextPersona.avatar);
                     }
                     throttledSaveData();
                }
            }
            if (Math.random() < 0.03) {
                // ── 对方拍一拍：调用提取的通用函数（同时供 /测试拍一拍 指令使用）──
                if (typeof window._triggerPartnerPoke === 'function') window._triggerPartnerPoke();
                return;
            }

            const replyCount = Math.random() < 0.75 ? 1: (Math.random() < 0.95 ? 2: 3);
            if (!customReplies || customReplies.length === 0) {
                showNotification('回复库为空，请先到「自定义回复」中添加内容', 'info', 3500);
                return;
            }
            const disabledItemsOnce = (() => {
                try {
                    const raw = localStorage.getItem('disabledReplyItems');
                    return raw ? new Set(JSON.parse(raw)) : new Set();
                } catch (e) { return new Set(); }
            })();
            const disabledGroupItemsOnce = new Set();
            (window.customReplyGroups || []).forEach(g => {
                if (g.disabled && Array.isArray(g.items)) g.items.forEach(item => disabledGroupItemsOnce.add(item));
            });
            const replyPoolOnce = customReplies
                .filter(r => !disabledItemsOnce.has(r) && !disabledGroupItemsOnce.has(r))
                .map(r => String(r || '').trim())
                .filter(Boolean);
            if (!replyPoolOnce.length) {
                showNotification('回复库可用内容为空（可能被分组禁用或屏蔽），请到「自定义回复」中调整', 'info', 4000);
                return;
            }

            // 确认有可用回复后再展示“正在输入中”，避免空转
            showTypingIndicator();
            let delay = 0;
            const recentUserMsgs = settings.replyEnabled
                ? messages.filter(m => m.sender === 'user' && m.text).slice(-10)
                : [];
            for (let i = 0; i < replyCount; i++) {
                const delayRange = settings.replyDelayMax - settings.replyDelayMin;
                delay += settings.replyDelayMin + Math.random() * delayRange;
                setTimeout(() => {
                    try {
                    const replyPool = replyPoolOnce;
                    // 被屏蔽或无效项直接换下一个，尽量保证每次都产出可用回复
                    let replyText = '';
                    for (let t = 0; t < 6; t++) {
                        const picked = replyPool[Math.floor(Math.random() * replyPool.length)];
                        if (picked && String(picked).trim()) {
                            replyText = String(picked).trim();
                            break;
                        }
                    }
                    if (!replyText && i === replyCount - 1) {
                        (function(){try{if(window._typingIndicatorAutoHideTimer){clearTimeout(window._typingIndicatorAutoHideTimer);window._typingIndicatorAutoHideTimer=null;}}catch(e){}var _tiW=document.getElementById('typing-indicator-wrapper');if(_tiW){var _tiInner=_tiW.querySelector('.typing-indicator');if(_tiInner){_tiInner.classList.add('hiding');setTimeout(function(){_tiW.style.display='none';if(_tiInner)_tiInner.classList.remove('hiding');},240);}else{_tiW.style.display='none';}}})();
                        return;
                    }

                    let disabledStickerItems = new Set();
                    try {
                        const raw = localStorage.getItem('disabledStickerItems');
                        if (raw) disabledStickerItems = new Set(JSON.parse(raw));
                    } catch (e) {}
                    const enabledStickerPool = (stickerLibrary || []).filter(s => !disabledStickerItems.has(s));
                    const shouldSendSticker = enabledStickerPool.length > 0 && Math.random() < 0.2;

                    let finalText = replyText;
                    let separateEmoji = null;
                    if (customEmojis && customEmojis.length > 0 && Math.random() < 0.2) {
                        const emoji = customEmojis[Math.floor(Math.random() * customEmojis.length)];
                        if (settings.emojiMixEnabled !== false) {
                            finalText = Math.random() < 0.5
                                ? emoji + ' ' + replyText
                                : replyText + ' ' + emoji;
                        } else {
                            separateEmoji = emoji;
                        }
                    }

                    addMessage({
                        id: Date.now() + i,
                        sender: settings.partnerName || '对方',
                        text: finalText,
                        timestamp: new Date(),
                        status: 'received',
                        favorited: false,
                        note: null,
                        replyTo: (i === 0 && recentUserMsgs.length > 0 && Math.random() < 0.3)
                            ? (function(){ const m = recentUserMsgs[Math.floor(Math.random() * recentUserMsgs.length)]; return { id: m.id, text: m.text, sender: m.sender }; })()
                            : null,
                        type: 'normal'
                    });
                    if (typeof window._sendPartnerNotification === 'function') {
                        window._sendPartnerNotification(settings.partnerName || '对方', finalText);
                    }
                    playSound('message');

                    if (shouldSendSticker) {
                        const randomSticker = enabledStickerPool[Math.floor(Math.random() * enabledStickerPool.length)];
                        setTimeout(() => {
                            addMessage({
                                id: Date.now() + i + 2000,
                                sender: settings.partnerName || '对方',
                                text: '',
                                timestamp: new Date(),
                                image: randomSticker,
                                status: 'received',
                                favorited: false,
                                note: null,
                                type: 'normal'
                            });
                            playSound('message');
                            if (typeof window._sendPartnerNotification === 'function') {
                                window._sendPartnerNotification(settings.partnerName || '对方', '[表情]');
                            }
                        }, 400 + Math.random() * 600);
                    }

                    if (separateEmoji) {
                        setTimeout(() => {
                            addMessage({
                                id: Date.now() + i + 1000,
                                sender: settings.partnerName || '对方',
                                text: separateEmoji,
                                timestamp: new Date(),
                                status: 'received',
                                favorited: false,
                                note: null,
                                type: 'normal'
                            });
                            playSound('message');
                        }, 300 + Math.random() * 400);
                    }

                    if (i === replyCount - 1) {
                        (function() {
                            try {
                                if (window._typingIndicatorAutoHideTimer) {
                                    clearTimeout(window._typingIndicatorAutoHideTimer);
                                    window._typingIndicatorAutoHideTimer = null;
                                }
                            } catch (e) {}
                            var _tiW = document.getElementById('typing-indicator-wrapper');
                            if (_tiW) {
                                var _tiInner = _tiW.querySelector('.typing-indicator');
                                if (_tiInner) {
                                    _tiInner.classList.add('hiding');
                                    setTimeout(function() {
                                        _tiW.style.display = 'none';
                                        if (_tiInner) _tiInner.classList.remove('hiding');
                                    }, 240);
                                } else {
                                    _tiW.style.display = 'none';
                                }
                            }
                        })();
                    }
                    } catch (e) {
                        console.error('[simulateReply] 渲染/回填出错:', e);
                        // 机制性兜底：出错时至少让“正在输入中”消失，避免假死
                        try {
                            (function(){
                                try { if (window._typingIndicatorAutoHideTimer) { clearTimeout(window._typingIndicatorAutoHideTimer); window._typingIndicatorAutoHideTimer = null; } } catch (e2) {}
                                var _tiW2 = document.getElementById('typing-indicator-wrapper');
                                if (_tiW2) _tiW2.style.display = 'none';
                            })();
                        } catch (e2) {}
                    }
                }, delay);
            }
        }

function showModal(modalElement, focusElement = null) {
            if (modalElement._hideTimeout) {
                clearTimeout(modalElement._hideTimeout);
                modalElement._hideTimeout = null;
            }
            modalElement.style.display = 'flex';
            requestAnimationFrame(() => {
                const content = modalElement.querySelector('.modal-content');
                if (content) {
                    content.style.opacity = '1';
                    content.style.transform = 'translateY(0) scale(1)';
                }
                if (focusElement) {
                    setTimeout(() => focusElement.focus(), 100);
                }
            });
        }

        function hideModal(modalElement) {
            const content = modalElement.querySelector('.modal-content');
            if (content) {
                content.style.opacity = '0';
                content.style.transform = 'translateY(20px) scale(0.95)';
            }
            if (modalElement._hideTimeout) clearTimeout(modalElement._hideTimeout);
            modalElement._hideTimeout = setTimeout(() => {
                modalElement.style.display = 'none';
            }, 300);
        }

        function viewImage(src) {
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;touch-action:pinch-zoom;';
            modal.innerHTML = `
                <div style="position:relative;max-width:95vw;max-height:92vh;display:flex;align-items:center;justify-content:center;">
                    <img src="${src}" style="max-width:95vw;max-height:88vh;object-fit:contain;display:block;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.6);" draggable="false">
                    <button onclick="this.closest('[style*=fixed]').remove()" style="position:fixed;top:16px;right:16px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.3);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);z-index:10;line-height:1;">×</button>
                    <a href="${src}" download style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 24px;background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.3);border-radius:20px;color:#fff;font-size:13px;text-decoration:none;backdrop-filter:blur(8px);display:flex;align-items:center;gap:6px;"><i class="fas fa-download"></i> 保存图片</a>
                </div>`;
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.tagName === 'IMG') modal.remove();
            });
            document.body.appendChild(modal);
        }

        function exportChatHistory() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
            overlay.innerHTML = `
                <div style="background:var(--secondary-bg);border-radius:20px;padding:24px;width:88%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:modalContentSlideIn 0.3s ease forwards;">
                    <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-file-export" style="color:var(--accent-color);font-size:14px;"></i>选择导出内容
                    </div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;">勾选需要导出的数据模块</div>
                    <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:20px;">
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_msgs" checked style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-comments" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>聊天记录 <span style="font-size:11px;color:var(--text-secondary);">(${messages.length} 条)</span></span>
                        </label>
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_settings" checked style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-sliders-h" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>外观与聊天设置</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_replies" style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-reply" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>字卡回复库</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_ann" style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-calendar-heart" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>纪念日 / 倒计时</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_themes" style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-palette" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>自定义主题配色</span>
                        </label>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button id="_exp_cancel" style="flex:1;padding:11px;border:1px solid var(--border-color);border-radius:12px;background:none;color:var(--text-secondary);font-size:13px;cursor:pointer;font-family:var(--font-family);">取消</button>
                        <button id="_exp_confirm" style="flex:2;padding:11px;border:none;border-radius:12px;background:var(--accent-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-family);display:flex;align-items:center;justify-content:center;gap:7px;">
                            <i class="fas fa-download"></i>确认导出
                        </button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            function closeDialog() { overlay.remove(); }
            overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
            const _expCancelBtn = document.getElementById('_exp_cancel');
            const _expConfirmBtn = document.getElementById('_exp_confirm');
            if (_expCancelBtn) _expCancelBtn.onclick = closeDialog;

            if (_expConfirmBtn) _expConfirmBtn.onclick = function() {
                const inclMsgs     = !!document.getElementById('_exp_msgs')?.checked;
                const inclSettings = !!document.getElementById('_exp_settings')?.checked;
                const inclReplies  = !!document.getElementById('_exp_replies')?.checked;
                const inclAnn      = !!document.getElementById('_exp_ann')?.checked;
                const inclThemes   = !!document.getElementById('_exp_themes')?.checked;

                if (!inclMsgs && !inclSettings && !inclReplies && !inclAnn && !inclThemes) {
                    showNotification('请至少选择一项导出内容', 'error');
                    return;
                }
                closeDialog();

                try {
                    let dgCustomData = null, dgStatusPool = null, customWeatherMap = {};
                    if (inclSettings) {
                        try { dgCustomData = JSON.parse(localStorage.getItem('dg_custom_data') || 'null'); } catch(e2) {}
                        try { dgStatusPool = JSON.parse(localStorage.getItem('dg_status_pool') || 'null'); } catch(e2) {}
                        try {
                            Object.keys(localStorage).forEach(kk => {
                                if (kk && kk.startsWith('customWeather_')) {
                                    customWeatherMap[kk] = localStorage.getItem(kk);
                                }
                            });
                        } catch(e2) {}
                    }

                    const exportObj = {
                        version: '3.1',
                        appName: 'ChatApp',
                        exportDate: new Date().toISOString(),
                        exportModules: []
                    };
                    if (inclMsgs)     {
                        // 永远省略图片字段，只导出文字等基础信息，减小体积
                        exportObj.messages = messages.map(m => {
                            const { image, ...rest } = m;
                            return rest;
                        });
                        exportObj.exportModules.push('messages');
                    }
                    if (inclSettings) {
                        exportObj.settings = settings;
                        exportObj.exportModules.push('settings');
                        exportObj.dgCustomData = dgCustomData;
                        exportObj.dgStatusPool = dgStatusPool;
                        exportObj.customWeatherMap = customWeatherMap;
                    }
                    if (inclReplies)  {
                        exportObj.customReplies = customReplies;
                        if (customEmojis && customEmojis.length > 0) exportObj.customEmojis = customEmojis;
                        exportObj.exportModules.push('customReplies');
                    }
                    if (inclAnn)      { exportObj.anniversaries = anniversaries; exportObj.exportModules.push('anniversaries'); }
                    if (inclThemes)   {
                        exportObj.customThemes = customThemes;
                        // stickerLibrary 体积较大，这里不再随聊天备份导出
                        exportObj.exportModules.push('themes');
                    }

                    const dataStr = JSON.stringify(exportObj, null, 2);
                    const parts = exportObj.exportModules.join('+');
                    const fileName = `chat-export-${parts}-${new Date().toISOString().slice(0,10)}.json`;

                    if (navigator.share && /Mobile|Android|iPhone|iPad/.test(navigator.userAgent)) {
                        const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
                        const file = new File([blob], fileName, { type: 'application/json' });
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            navigator.share({ files: [file], title: '传讯数据导出', text: `导出日期：${new Date().toLocaleDateString()}` })
                                .catch(() => fallbackExport(dataStr, fileName));
                            return;
                        }
                    }
                    fallbackExport(dataStr, fileName);
                } catch (error) {
                    console.error('导出失败:', error);
                    showNotification('导出失败，请重试', 'error');
                }
            };
        }

        function fallbackExport(dataStr, fileName) {
            fileName = fileName || `chat-backup-${SESSION_ID}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            const dataBlob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            showNotification('导出成功', 'success');
        }

        function importChatHistory(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    let rawText = e.target.result;
                    if (rawText.charCodeAt(0) === 0xFEFF) rawText = rawText.slice(1);
                    let importedData = JSON.parse(rawText);

                    // 兼容全量备份格式（type:'full' 或含 indexedDB/localforage 字段）
                    // 将其转换为 importChatHistory 能识别的标准字段
                    if (importedData && typeof importedData === 'object' &&
                        (importedData.type === 'full' || importedData.indexedDB || importedData.localforage) &&
                        !importedData.messages && !importedData.settings) {

                        const idb = importedData.indexedDB || importedData.localforage || {};
                        const ls  = importedData.localStorage || {};
                        const allKv = Object.assign({}, idb, ls);

                        // 找到 sessionId（取第一个带 _chatMessages 的键前缀）
                        let detectedSid = null;
                        const appPfx = importedData.appPrefix || 'CHAT_APP_V3_';
                        for (const k of Object.keys(allKv)) {
                            if (k.indexOf('_chatMessages') !== -1 && k.startsWith(appPfx)) {
                                const after = k.slice(appPfx.length);
                                const u = after.indexOf('_');
                                if (u > 0) { detectedSid = after.slice(0, u); break; }
                            }
                        }

                        const pfxSid = detectedSid ? (appPfx + detectedSid + '_') : null;
                        const getVal = (suffix) => {
                            if (pfxSid) {
                                const v = allKv[pfxSid + suffix];
                                if (v !== undefined && v !== null) return v;
                            }
                            // 无前缀回退
                            return allKv[suffix] !== undefined ? allKv[suffix] : null;
                        };
                        const parseVal = (v) => {
                            if (v === null || v === undefined) return null;
                            if (typeof v !== 'string') return v;
                            try { return JSON.parse(v); } catch(e2) { return v; }
                        };

                        const converted = {
                            version: importedData.version || '3.1',
                            appName:  importedData.appName || 'ChatApp',
                            exportDate: importedData.exportDate || importedData.timestamp || new Date().toISOString(),
                            exportModules: []
                        };

                        const msgs = parseVal(getVal('chatMessages'));
                        if (Array.isArray(msgs)) { converted.messages = msgs; converted.exportModules.push('messages'); }

                        const chatSettings = parseVal(getVal('chatSettings'));
                        if (chatSettings && typeof chatSettings === 'object') {
                            converted.settings = chatSettings;
                            converted.exportModules.push('settings');
                        }
                        // 额外的 localStorage 设置字段
                        const dgCustomData = parseVal(ls['dg_custom_data'] !== undefined ? ls['dg_custom_data'] : null);
                        if (dgCustomData) converted.dgCustomData = dgCustomData;
                        const dgStatusPool = parseVal(ls['dg_status_pool'] !== undefined ? ls['dg_status_pool'] : null);
                        if (dgStatusPool) converted.dgStatusPool = dgStatusPool;
                        const customWeatherMap = {};
                        for (const wk of Object.keys(ls)) {
                            if (wk && wk.startsWith('customWeather_')) customWeatherMap[wk] = ls[wk];
                        }
                        if (Object.keys(customWeatherMap).length) converted.customWeatherMap = customWeatherMap;

                        const replies = parseVal(getVal('customReplies'));
                        if (Array.isArray(replies)) { converted.customReplies = replies; converted.exportModules.push('customReplies'); }

                        const emojis = parseVal(getVal('customEmojis'));
                        if (Array.isArray(emojis)) converted.customEmojis = emojis;

                        const ann = parseVal(getVal('anniversaries'));
                        if (Array.isArray(ann)) { converted.anniversaries = ann; converted.exportModules.push('anniversaries'); }

                        const themes = parseVal(allKv[appPfx + 'customThemes'] !== undefined ? allKv[appPfx + 'customThemes'] : (ls[appPfx + 'customThemes'] || null));
                        if (themes) { converted.customThemes = themes; converted.exportModules.push('themes'); }

                        importedData = converted;
                    }

                    const hasMessages  = importedData.messages && Array.isArray(importedData.messages);
                    const hasSettings  = !!importedData.settings;
                    const hasReplies   = importedData.customReplies && Array.isArray(importedData.customReplies);
                    const hasAnn       = importedData.anniversaries && Array.isArray(importedData.anniversaries);
                    const hasThemes    = !!importedData.customThemes || !!importedData.stickerLibrary;

                    if (!hasMessages && !hasSettings && !hasReplies && !hasAnn && !hasThemes) {
                        throw new Error('无效的聊天记录文件（未检测到可识别的数据模块）');
                    }

                    const overlay = document.createElement('div');
                    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

                    const makeRow = (id, icon, label, sublabel, available, checked) => {
                        if (!available) return '';
                        return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);">
                            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="${icon}" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>${label}${sublabel ? `<span style="font-size:11px;color:var(--text-secondary);margin-left:4px;">${sublabel}</span>` : ''}</span>
                        </label>`;
                    };

                    overlay.innerHTML = `
                        <div style="background:var(--secondary-bg);border-radius:20px;padding:24px;width:88%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:modalContentSlideIn 0.3s ease forwards;">
                            <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:8px;">
                                <i class="fas fa-file-import" style="color:var(--accent-color);font-size:14px;"></i>选择导入内容
                            </div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;">文件中检测到以下数据，选择要导入的模块</div>
                            <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:20px;">
                                ${makeRow('_imp_msgs', 'fas fa-comments', '聊天记录', hasMessages ? `(${importedData.messages.length} 条)` : '', hasMessages, true)}
                                ${makeRow('_imp_settings', 'fas fa-sliders-h', '外观与聊天设置', '', hasSettings, true)}
                                ${makeRow('_imp_replies', 'fas fa-reply', '字卡回复库', '', hasReplies, false)}
                                ${makeRow('_imp_ann', 'fas fa-calendar-heart', '纪念日 / 倒计时', '', hasAnn, false)}
                                ${makeRow('_imp_themes', 'fas fa-palette', '自定义主题配色', '', hasThemes, false)}
                            </div>
                            <div style="display:flex;gap:10px;">
                                <button id="_imp_cancel" style="flex:1;padding:11px;border:1px solid var(--border-color);border-radius:12px;background:none;color:var(--text-secondary);font-size:13px;cursor:pointer;font-family:var(--font-family);">取消</button>
                                <button id="_imp_confirm" style="flex:2;padding:11px;border:none;border-radius:12px;background:var(--accent-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-family);display:flex;align-items:center;justify-content:center;gap:7px;">
                                    <i class="fas fa-upload"></i>确认导入
                                </button>
                            </div>
                        </div>`;
                    document.body.appendChild(overlay);

                    function closeDialog() { overlay.remove(); }
                    overlay.addEventListener('click', ev => { if (ev.target === overlay) closeDialog(); });
                    const _impCancelBtn = document.getElementById('_imp_cancel');
                    const _impConfirmBtn = document.getElementById('_imp_confirm');
                    if (_impCancelBtn) _impCancelBtn.onclick = closeDialog;

                    if (_impConfirmBtn) _impConfirmBtn.onclick = function() {
                        const doMsgs     = hasMessages  && !!document.getElementById('_imp_msgs')?.checked;
                        const doSettings = hasSettings  && !!document.getElementById('_imp_settings')?.checked;
                        const doReplies  = hasReplies   && !!document.getElementById('_imp_replies')?.checked;
                        const doAnn      = hasAnn       && !!document.getElementById('_imp_ann')?.checked;
                        const doThemes   = hasThemes    && !!document.getElementById('_imp_themes')?.checked;

                        if (!doMsgs && !doSettings && !doReplies && !doAnn && !doThemes) {
                            showNotification('请至少选择一项导入内容', 'error');
                            return;
                        }

                        if (doMsgs && messages.length > 0 && !confirm('导入将覆盖当前会话的聊天记录，确定继续吗？')) return;
                        closeDialog();

                        if (doMsgs) {
                            messages = importedData.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
                        }
                        if (doSettings) {
                            if (importedData.settings) {
                                Object.assign(settings, importedData.settings);
                                try {
                                    if (settings.customFontUrl) applyCustomFont(settings.customFontUrl);
                                    if (settings.customBubbleCss) applyCustomBubbleCss(settings.customBubbleCss);
                                    if (settings.customGlobalCss) applyGlobalThemeCss(settings.customGlobalCss);
                                } catch(e2) { console.warn('导入后样式应用失败', e2); }
                            }
                            if (importedData.dgCustomData) { try { localStorage.setItem('dg_custom_data', JSON.stringify(importedData.dgCustomData)); } catch(e2) {} }
                            if (importedData.dgStatusPool) { try { localStorage.setItem('dg_status_pool', JSON.stringify(importedData.dgStatusPool)); } catch(e2) {} }
                            if (importedData.customWeatherMap) { try { Object.keys(importedData.customWeatherMap).forEach(wk => localStorage.setItem(wk, importedData.customWeatherMap[wk])); } catch(e2) {} }
                        }
                        if (doReplies  && importedData.customReplies)  customReplies  = importedData.customReplies;
                        if (doReplies  && importedData.customEmojis && Array.isArray(importedData.customEmojis)) customEmojis = importedData.customEmojis;
                        if (doAnn      && importedData.anniversaries)   anniversaries  = importedData.anniversaries;
                        if (doThemes   && importedData.customThemes)    customThemes   = importedData.customThemes;
                        if (doThemes   && importedData.stickerLibrary)  stickerLibrary = importedData.stickerLibrary;

                        saveData();
                        if (doMsgs && typeof renderMessages === 'function') renderMessages();
                        if (typeof applySettings === 'function') applySettings();
                        updateUI();
                        const count = doMsgs ? `${messages.length} 条消息` : '所选数据';
                        showNotification(`成功导入${count}`, 'success');
                    };
                } catch (error) {
                    console.error('导入失败:', error);
                    showNotification('文件格式错误或已损坏', 'error');
                }
            };
            reader.onerror = () => showNotification('文件读取失败', 'error');
            reader.readAsText(file);
        }

        // ── 对方状态更新核心逻辑（提取为独立函数，供定时触发和 /测试状态更新 指令共用）──
        window._triggerStatusChange = function() {
            let newStatus = null;

            const groups = window.customStatusGroups || [];
            const allStatuses = (typeof customStatuses !== 'undefined' ? customStatuses : []) || [];

            // 只保留「启用」且「有内容」的分组，内容必须也在 allStatuses 里存在
            const enabledGroups = groups.filter(function(g) {
                return !g.disabled && Array.isArray(g.items) && g.items.length > 0;
            });

            // 收集所有在分组内的状态文本
            const groupedItems = new Set();
            enabledGroups.forEach(function(g) { g.items.forEach(function(t) { groupedItems.add(t); }); });

            // 未分组的状态
            const ungroupedStatuses = allStatuses.filter(function(t) { return !groupedItems.has(t); });

            if (enabledGroups.length > 0) {
                // 有启用分组时：随机选一个分组 → 从该分组随机选一条状态
                const pickedGroup = enabledGroups[Math.floor(Math.random() * enabledGroups.length)];
                const groupPool = pickedGroup.items.filter(function(t) { return allStatuses.includes(t); });
                if (groupPool.length > 0) {
                    newStatus = groupPool[Math.floor(Math.random() * groupPool.length)];
                }
            }

            // 分组里没找到内容时，退回到：未分组状态 → 全部 customStatuses → 内置 PARTNER_STATUSES
            if (!newStatus && ungroupedStatuses.length > 0) {
                newStatus = ungroupedStatuses[Math.floor(Math.random() * ungroupedStatuses.length)];
            }
            if (!newStatus && allStatuses.length > 0) {
                newStatus = allStatuses[Math.floor(Math.random() * allStatuses.length)];
            }
            if (!newStatus && CONSTANTS.PARTNER_STATUSES && CONSTANTS.PARTNER_STATUSES.length > 0) {
                newStatus = getRandomItem(CONSTANTS.PARTNER_STATUSES);
            }
            if (!newStatus) {
                if (typeof showNotification === 'function') showNotification('状态库为空，请先添加内容', 'warning', 2500);
                return;
            }

            settings.partnerStatus = newStatus;
            settings.lastStatusChange = Date.now();
            settings.nextStatusChange = 1 + Math.random() * 7;
            DOMElements.partner.status.textContent = newStatus;
            throttledSaveData();
        };

        const checkStatusChange = () => {
            if ((Date.now() - settings.lastStatusChange) / 36e5 >= settings.nextStatusChange) {
                window._triggerStatusChange();
            }
        };



        function getStorageKey(baseKey) {
            if (!SESSION_ID) {
                console.error('[getStorageKey] SESSION_ID 尚未初始化，拒绝生成存储键:', baseKey);
                throw new Error('SESSION_ID 未初始化，存储操作已中止');
            }
            // 对象管理：非默认对象的档案使用独立前缀，实现数据隔离
            let profilePart = '';
            try {
                const cur = window.__currentProfileId;
                if (cur && cur !== 'default') profilePart = 'P' + cur + '_';
            } catch (e) {}
            return `${APP_PREFIX}${profilePart}${SESSION_ID}_${baseKey}`;
        }

        async function migrateData() {
            const isMigrated = await localforage.getItem(APP_PREFIX + 'MIGRATION_V2_DONE');
            if (isMigrated) return;

            try {
                const keys = Object.keys(localStorage);
                for (const key of keys) {
                    if (key.startsWith(APP_PREFIX)) {
                        try {
                            const val = localStorage.getItem(key);
                            if (val) {
                                let dataToStore = val;
                                try {
                                    if (val.startsWith('{') || val.startsWith('[')) {
                                        dataToStore = JSON.parse(val);
                                    }
                                } catch (e) {
                                    console.warn(`迁移期间解析数据失败: ${key}，将作为原始字符串存储。`, e);
                                }
                                await localforage.setItem(key, dataToStore);
                            }
                        } catch (e) {
                            console.error(`迁移键值 ${key} 时发生错误，已跳过。`, e);
                        }
                    }
                }
                
                await localforage.setItem(APP_PREFIX + 'MIGRATION_V2_DONE', 'true');
            } catch (e) {
                console.error("数据迁移过程中发生严重错误:", e);
                showNotification('数据迁移失败，部分旧数据可能丢失', 'error');
            }
        }

window.initializeSession = async function() {
    await migrateData();

    const sessionsData = await localforage.getItem(`${APP_PREFIX}sessionList`);
    sessionList = sessionsData || [];

    const hash = window.location.hash.substring(1);
    if (hash && sessionList.some(s => s.id === hash)) {
        SESSION_ID = hash;
    } else if (sessionList.length > 0) {
        const lastId = await localforage.getItem(`${APP_PREFIX}lastSessionId`);
        SESSION_ID = lastId && sessionList.some(s => s.id === lastId) ? lastId : sessionList[0].id;
    } else {
        SESSION_ID = await createNewSession(false);
    }

    await localforage.setItem(`${APP_PREFIX}lastSessionId`, SESSION_ID);
}

document.addEventListener('DOMContentLoaded', function() {
    const chatArea = document.querySelector('.main-chat-area');
    const historyLoader = document.getElementById('history-loader');
    
    if (chatArea && historyLoader && typeof IntersectionObserver !== 'undefined') {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && messages.length > displayedMessageCount) {
                loadMoreHistory();
            }
        }, {
            root: chatArea,
            rootMargin: '200px 0px 0px 0px',
            threshold: 0.01
        });
        observer.observe(historyLoader);
    }
});



