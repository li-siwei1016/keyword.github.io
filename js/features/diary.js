/**
 * diary.js - 日记本
 * 供我方记录当日心情、天气、想写的话；按日保存，可回看往期。
 */
(function () {
    const KEY = 'diaryEntries'; // localforage: { 'YYYY-MM-DD': {mood, weather, text, savedAt} }
    let diaryData = {};
    let diaryLoaded = false;
    let curMood = '🙂';
    let curWeather = '☀️';

    const MOODS = ['🙂', '😆', '🥰', '☺️', '😢', '😖', '😤', '🥲', '😶', '🤒'];
    const WEATHERS = ['☀️', '⛅', '☁️', '🌧️', '⛈️', '❄️', '🌈', '🌫️'];

    async function loadDiary() {
        if (diaryLoaded) return;
        try {
            const saved = await localforage.getItem(getStorageKey('diary'));
            if (saved && typeof saved === 'object') diaryData = saved;
        } catch (e) { console.warn('[diary] 读取失败', e); }
        diaryLoaded = true;
    }

    function saveDiary() {
        try { localforage.setItem(getStorageKey('diary'), diaryData); } catch (e) {}
    }

    function fmtDate(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function buildPop(popEl, list, cur, onPick) {
        popEl.innerHTML = list.map(x =>
            `<button class="dp-opt${x === cur ? ' active' : ''}" data-v="${x}">${x}</button>`).join('');
        popEl.addEventListener('click', (e) => {
            const b = e.target.closest('.dp-opt');
            if (!b) return;
            onPick(b.dataset.v);
            popEl.classList.remove('open');
            popEl.querySelectorAll('.dp-opt').forEach(o => o.classList.toggle('active', o.dataset.v === b.dataset.v));
        });
    }

    function openDiaryPanel() {
        const modal = document.getElementById('diary-modal');
        if (!modal) return;
        hideModal(document.getElementById('advanced-modal'));
        loadDiary().then(() => {
            const dateInput = document.getElementById('diary-date-input');
            const dateLabel = document.getElementById('diary-date-label');
            const textInput = document.getElementById('diary-text-input');
            const today = fmtDate(new Date());
            if (dateInput && !dateInput.value) dateInput.value = today;
            dateInput.onchange = () => fillEditor(dateInput.value);
            fillEditor(dateInput.value || today);

            // 心情/天气选择器
            const moodPop = document.getElementById('diary-mood-pop');
            const weatherPop = document.getElementById('diary-weather-pop');
            if (moodPop && !moodPop.dataset.built) {
                moodPop.dataset.built = '1';
                buildPop(moodPop, MOODS, curMood, v => { curMood = v; document.getElementById('diary-mood-value').textContent = v; });
            }
            if (weatherPop && !weatherPop.dataset.built) {
                weatherPop.dataset.built = '1';
                buildPop(weatherPop, WEATHERS, curWeather, v => { curWeather = v; document.getElementById('diary-weather-value').textContent = v; });
            }

            renderDiaryList();
            showModal(modal);
        });
    }

    function fillEditor(dateStr) {
        const dateLabel = document.getElementById('diary-date-label');
        const textInput = document.getElementById('diary-text-input');
        if (!dateStr) return;
        if (dateLabel) dateLabel.textContent = dateStr + (dateStr === fmtDate(new Date()) ? ' · 今天' : '');
        const entry = diaryData[dateStr];
        curMood = (entry && entry.mood) || '🙂';
        curWeather = (entry && entry.weather) || '☀️';
        document.getElementById('diary-mood-value').textContent = curMood;
        document.getElementById('diary-weather-value').textContent = curWeather;
        if (textInput) textInput.value = (entry && entry.text) || '';
    }

    function renderDiaryList() {
        const list = document.getElementById('diary-list');
        const count = document.getElementById('diary-count');
        if (!list) return;
        const dates = Object.keys(diaryData).sort().reverse();
        if (count) count.textContent = dates.length;
        if (!dates.length) {
            list.innerHTML = '<div class="ad-empty">还没有写过日记<br>今天就是最好的开始 ✍️</div>';
            return;
        }
        list.innerHTML = dates.map(d => {
            const e = diaryData[d];
            const short = (e.text || '').replace(/</g, '&lt;').slice(0, 60);
            return `<div class="diary-item" data-d="${d}">
                <div class="di-item-head"><span class="di-date">${d}</span><span class="di-icons">${e.mood || ''} ${e.weather || ''}</span>
                <button class="di-del" data-d="${d}" title="删除"><i class="fas fa-trash-can"></i></button></div>
                <div class="di-text">${short || '<span style="opacity:.5">（没有文字）</span>'}</div>
            </div>`;
        }).join('');
        list.querySelectorAll('.diary-item').forEach(item => {
            item.addEventListener('click', (ev) => {
                if (ev.target.closest('.di-del')) return;
                const d = item.dataset.d;
                document.getElementById('diary-date-input').value = d;
                fillEditor(d);
            });
        });
        list.querySelectorAll('.di-del').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const d = btn.dataset.d;
                delete diaryData[d];
                saveDiary();
                renderDiaryList();
                if (typeof showNotification === 'function') showNotification('日记已删除', 'success', 1500);
                fillEditor(document.getElementById('diary-date-input').value);
            });
        });
    }

    function initDiaryModule() {
        const entry = document.getElementById('diary-function');
        if (entry && !entry.dataset.diaryBound) {
            entry.dataset.diaryBound = '1';
            entry.addEventListener('click', openDiaryPanel);
        }
        const saveBtn = document.getElementById('diary-save-btn');
        if (saveBtn && !saveBtn.dataset.diaryBound) {
            saveBtn.dataset.diaryBound = '1';
            saveBtn.addEventListener('click', () => {
                const dateStr = document.getElementById('diary-date-input').value || fmtDate(new Date());
                const text = document.getElementById('diary-text-input').value.trim();
                if (!text) { if (typeof showNotification === 'function') showNotification('写点什么再保存吧', 'warning'); return; }
                diaryData[dateStr] = { mood: curMood, weather: curWeather, text: text, savedAt: Date.now() };
                saveDiary();
                renderDiaryList();
                if (typeof showNotification === 'function') showNotification('✓ 日记已保存', 'success', 1600);
                if (typeof playSound === 'function') playSound('send');
            });
        }
        const clearBtn = document.getElementById('diary-clear');
        if (clearBtn && !clearBtn.dataset.diaryBound) {
            clearBtn.dataset.diaryBound = '1';
            clearBtn.addEventListener('click', () => {
                if (!confirm('确定清空全部日记吗？')) return;
                diaryData = {};
                saveDiary();
                renderDiaryList();
            });
        }
        const closeBtn = document.getElementById('close-diary');
        if (closeBtn && !closeBtn.dataset.diaryBound) {
            closeBtn.dataset.diaryBound = '1';
            closeBtn.addEventListener('click', () => hideModal(document.getElementById('diary-modal')));
        }
        // 选择器弹出
        ['diary-mood-picker', 'diary-weather-picker'].forEach(pid => {
            const picker = document.getElementById(pid);
            if (!picker || picker.dataset.diaryBound) return;
            picker.dataset.diaryBound = '1';
            picker.addEventListener('click', (e) => {
                if (e.target.closest('.dp-opt')) return;
                const pop = picker.querySelector('.dp-pop');
                document.querySelectorAll('.dp-pop.open').forEach(p => { if (p !== pop) p.classList.remove('open'); });
                pop.classList.toggle('open');
            });
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.diary-picker')) {
                document.querySelectorAll('.dp-pop.open').forEach(p => p.classList.remove('open'));
            }
        });
    }

    window.openDiaryPanel = openDiaryPanel;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDiaryModule);
    } else {
        initDiaryModule();
    }
})();
