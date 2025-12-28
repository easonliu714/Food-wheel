// ================== ui_control.js : 介面控制與 API 驗證 ==================

// 1. 基礎設定與教學
window.showGuide = function(platform) {
    const container = document.getElementById('guide-content');
    if(!container) return;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    const data = window.guideData[platform];
    if (!data) return;
    let html = `<h3>${data.title}</h3>`;
    data.steps.forEach(step => {
        let imgHtml = step.img ? `<div class="step-image-container"><img src="${step.img}" alt="Step Image"></div>` : '';
        html += `<div class="step-card"><div class="step-header"><div class="step-title">${step.title}</div></div>${imgHtml}<div class="step-content"><p>${step.desc}</p></div></div>`;
    });
    container.innerHTML = html;
};

// 2. 設定頁面邏輯
window.populateSetupKeywords = function() {
    const mapping = {'kw_breakfast':'breakfast','kw_lunch':'lunch','kw_afternoon_tea':'afternoon_tea','kw_dinner':'dinner','kw_late_night':'late_night','kw_noodles_rice':'noodles_rice','kw_western_steak':'western_steak','kw_dessert':'dessert','kw_all':'all'};
    for (const [id, key] of Object.entries(mapping)) {
        const input = document.getElementById(id);
        if (input && window.activeKeywordDict[key]) input.value = window.activeKeywordDict[key];
    }
};

window.populateSetupGeneralPrefs = function() {
    const prefsJson = localStorage.getItem('food_wheel_prefs');
    
    // 金鑰遮蔽邏輯
    const savedMapKey = localStorage.getItem('food_wheel_api_key');
    const savedGeminiKey = localStorage.getItem('food_wheel_gemini_key');
    
    if (savedMapKey) document.getElementById('userApiKey').value = '●●●●●●●●';
    if (savedGeminiKey && document.getElementById('userGeminiKey')) {
        document.getElementById('userGeminiKey').value = '●●●●●●●●';
    }

    if (prefsJson) {
        try {
            const prefs = JSON.parse(prefsJson);
            const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
            setVal('setupSearchMode', prefs.searchMode);
            setVal('setupMinRating', prefs.minRating);
            setVal('setupSpinMode', prefs.spinMode);
            setVal('setupTransport', prefs.transport);
            setVal('setupMaxTime', prefs.maxTime);
            setVal('setupPriceLevel', prefs.priceLevel);
            setVal('setupResultCount', prefs.resultCount);
            if(prefs.geminiModel) {
                const modelSelect = document.getElementById('geminiModelSelect');
                if(modelSelect) {
                    if(modelSelect.options.length <= 1) modelSelect.innerHTML = `<option value="${prefs.geminiModel}" selected>${prefs.geminiModel}</option>`;
                    else modelSelect.value = prefs.geminiModel;
                }
            }
        } catch (e) { console.error("Error reading prefs:", e); }
    }
};

// 3. API 驗證邏輯
window.validateAndSaveKey = function() {
    let inputKey = document.getElementById('userApiKey').value.trim();
    const savedKey = localStorage.getItem('food_wheel_api_key');
    
    // 檢查是否為遮蔽字元，若是則使用舊金鑰
    if (inputKey === '●●●●●●●●') {
        if (savedKey) {
            inputKey = savedKey; 
        } else {
            return alert("請輸入有效的 API Key");
        }
    } else {
        if (!inputKey) return alert("請輸入 API Key");
    }

    const btn = document.querySelector('.start-btn');
    const originalText = btn.innerText;
    btn.innerText = "驗證中...";
    btn.disabled = true;

    const oldScript = document.getElementById('google-maps-script');
    if(oldScript) oldScript.remove();

    window.gm_authFailure = () => {
        alert("❌ 驗證失敗：Google 拒絕了此 Key。\n請檢查 Key 是否正確且已啟用 Billing。");
        btn.innerText = originalText;
        btn.disabled = false;
    };

    window.onMapsApiValidationSuccess = async () => {
        try {
            window.gm_authFailure = () => {}; 
            const geocoder = new google.maps.Geocoder();
            await new Promise((resolve, reject) => {
                geocoder.geocode({ 'address': 'Taipei' }, (results, status) => {
                    if (status === 'OK' || status === 'ZERO_RESULTS') resolve();
                    else reject(`Geocoding API 未啟用 (${status})`);
                });
            });
            alert("✅ 驗證成功！");
            window.saveAndStart(true, inputKey); // 傳入真實 Key
        } catch (err) {
            alert(`⚠️ API Key 有效但權限不足：\n${err}\n請確保已啟用 Geocoding API 與 Places API。`);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
            delete window.onMapsApiValidationSuccess;
        }
    };

    const script = document.createElement('script');
    script.id = 'google-maps-script-validator';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${inputKey}&libraries=places,geometry&callback=onMapsApiValidationSuccess`;
    script.async = true;
    script.onerror = () => { alert("❌ 無法連線至 Google Maps。"); btn.disabled = false; };
    document.head.appendChild(script);
};

window.saveAndStart = function(skipLoad = false, validatedMapKey = null) {
    let mapKeyToSave = validatedMapKey;
    if (!mapKeyToSave) {
        const inputMapKey = document.getElementById('userApiKey').value.trim();
        if (inputMapKey === '●●●●●●●●') {
            mapKeyToSave = localStorage.getItem('food_wheel_api_key');
        } else {
            mapKeyToSave = inputMapKey;
        }
    }
    if (!mapKeyToSave) return alert("API Key 錯誤");

    const inputGeminiKey = document.getElementById('userGeminiKey') ? document.getElementById('userGeminiKey').value.trim() : "";
    if (inputGeminiKey) {
        if (inputGeminiKey !== '●●●●●●●●') {
            localStorage.setItem('food_wheel_gemini_key', inputGeminiKey);
        }
    }

    const getVal = (id) => document.getElementById(id)?.value || "";
    const userPrefs = {
        searchMode: getVal('setupSearchMode'),
        minRating: getVal('setupMinRating'),
        transport: getVal('setupTransport'),
        maxTime: getVal('setupMaxTime'),
        priceLevel: getVal('setupPriceLevel'),
        resultCount: getVal('setupResultCount'),
        spinMode: getVal('setupSpinMode'),
        geminiModel: getVal('geminiModelSelect')
    };

    localStorage.setItem('food_wheel_api_key', mapKeyToSave);
    localStorage.setItem('food_wheel_prefs', JSON.stringify(userPrefs));
    
    if (skipLoad) window.initApp();
    else window.loadGoogleMapsScript(mapKeyToSave);
};

// 4. App 初始化與核心功能

window.loadGoogleMapsScript = function(key) {
    if (document.getElementById('google-maps-script')) return; 
    
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,geometry&callback=initApp`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
        alert("Google Maps SDK 載入失敗，請檢查網路或 Key 是否正確。");
        document.getElementById('setup-screen').style.display = 'block';
        document.getElementById('app-screen').style.display = 'none';
    };
    document.head.appendChild(script);
};

window.initApp = function() {
    console.log("App Initializing...");
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';

    window.loadPreferencesToMainApp();

    const hour = new Date().getHours();
    let autoMealType = 'lunch'; 
    if (hour >= 5 && hour < 11) autoMealType = 'breakfast';
    else if (hour >= 11 && hour < 14) autoMealType = 'lunch';
    else if (hour >= 14 && hour < 17) autoMealType = 'afternoon_tea';
    else if (hour >= 17 && hour < 21) autoMealType = 'dinner';
    else autoMealType = 'late_night';

    const mealSelect = document.getElementById('mealType');
    if (mealSelect) {
        mealSelect.value = autoMealType;
        if (typeof window.updateKeywords === 'function') {
            window.updateKeywords(); 
        } else {
             const key = window.activeKeywordDict[autoMealType] || "";
             const kwInput = document.getElementById('keywordInput');
             if(kwInput) kwInput.value = key;
        }
    }

    if (typeof window.initLocation === 'function') window.initLocation();
    window.resetGame(true);
};

window.loadPreferencesToMainApp = function() {
    const prefsJson = localStorage.getItem('food_wheel_prefs');
    if (!prefsJson) return;
    try {
        const prefs = JSON.parse(prefsJson);
        const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        
        setVal('searchMode', prefs.searchMode);
        setVal('minRating', prefs.minRating);
        setVal('transportMode', prefs.transport);
        setVal('maxTime', prefs.maxTime);
        setVal('priceLevel', prefs.priceLevel);
        setVal('resultCount', prefs.resultCount);
        setVal('spinMode', prefs.spinMode);
    } catch (e) { console.warn("Sync prefs failed", e); }
};

window.editPreferences = function() {
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('setup-screen').style.display = 'block';
    window.populateSetupGeneralPrefs();
};

window.resetApiKey = function() {
    if(confirm("⚠️ 確定要重設金鑰嗎？\n這將會清除您儲存的 Google Maps Key、Gemini Key 與所有偏好設定。")) {
        localStorage.removeItem('food_wheel_api_key');
        localStorage.removeItem('food_wheel_prefs');
        localStorage.removeItem('food_wheel_gemini_key');
        localStorage.removeItem('food_wheel_user_ratings');
        localStorage.removeItem('food_wheel_menus'); 
        location.reload();
    }
};

// 5. 遊戲邏輯與 UI 更新

window.resetGame = function(fullReset) {
    window.currentRotation = 0; 
    if(window.canvas) {
        window.canvas.style.transform = `rotate(0deg)`;
        window.canvas.style.transition = 'none'; 
    }
    
    const storeName = document.getElementById('storeName');
    if(storeName) storeName.innerText = "點擊輪盤開始抉擇";
    
    ['storeRating', 'storeAddress', 'storePhone', 'storeStatus', 'storeDistance', 'userPersonalRating'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = "";
    });
    
    ['navLink', 'webLink', 'menuPhotoLink', 'btnAiMenu', 'btnLike', 'btnDislike'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    if(fullReset) {
        window.places = [];
        window.allSearchResults = [];
        window.eliminatedIds.clear();
        window.hitCounts = {};
        if(window.ctx) window.ctx.clearRect(0, 0, 400, 400);
        window.enableSpinButton(0);
        
        const tbody = document.querySelector('#resultsTable tbody');
        if(tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">尚未搜尋...</td></tr>';
    }
};

window.enableSpinButton = function(count) {
    const spinBtn = document.getElementById('spinBtn');
    if(!spinBtn) return;
    if (count > 0) {
        spinBtn.disabled = false;
        spinBtn.style.opacity = "1";
        spinBtn.style.cursor = "pointer";
        spinBtn.innerText = "開始抽籤";
    } else {
        spinBtn.disabled = true;
        spinBtn.style.opacity = "0.5";
        spinBtn.style.cursor = "not-allowed";
        spinBtn.innerText = (window.allSearchResults.length > 0) ? "商家已全數濾除" : "請先搜尋店家";
    }
};

window.refreshWheelData = function() {
    const filterDislikeEl = document.getElementById('filterDislike');
    const filterDislike = filterDislikeEl ? filterDislikeEl.checked : false;
    
    window.places = window.allSearchResults.filter(p => {
        if (window.eliminatedIds.has(p.place_id)) return false;
        if (filterDislike && window.userRatings[p.place_id] === 'dislike') return false;
        return true;
    });

    const searchBtn = document.querySelector('.search-btn');
    if(searchBtn && !searchBtn.disabled && searchBtn.innerText.includes("搜尋完成")) {
        searchBtn.innerText = `搜尋完成 (共 ${window.places.length} 間)`;
    }

    window.initResultList(window.allSearchResults);
    window.drawWheel();
    window.enableSpinButton(window.places.length);
};

window.drawWheel = function() {
    const numOptions = window.places.length;
    if(window.ctx) window.ctx.clearRect(0, 0, 400, 400);
    if (numOptions === 0) return;
    
    const arcSize = (2 * Math.PI) / numOptions;
    const startAngleOffset = -Math.PI / 2;

    window.places.forEach((place, i) => {
        const angle = startAngleOffset + (i * arcSize);
        if(window.ctx) {
            window.ctx.fillStyle = `hsl(${i * (360 / numOptions)}, 70%, 60%)`;
            window.ctx.beginPath();
            window.ctx.moveTo(200, 200);
            window.ctx.arc(200, 200, 200, angle, angle + arcSize);
            window.ctx.fill();
            window.ctx.stroke();

            window.ctx.save();
            window.ctx.translate(200, 200);
            window.ctx.rotate(angle + arcSize / 2);
            let fontSize = 16; if (numOptions > 20) fontSize = 12; if (numOptions > 30) fontSize = 10;
            window.ctx.fillStyle = "white"; window.ctx.font = `bold ${fontSize}px Arial`;
            let text = place.name; if (text.length > 8) text = text.substring(0, 7) + "..";
            window.ctx.fillText(text, 60, 5);
            window.ctx.restore();
        }
    });
};

window.initResultList = function(list) {
    const tbody = document.querySelector('#resultsTable tbody');
    if(!tbody) return;
    tbody.innerHTML = ''; 
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">無資料</td></tr>';
        return;
    }
    const filterDislikeEl = document.getElementById('filterDislike');
    const filterDislike = filterDislikeEl ? filterDislikeEl.checked : false;

    list.forEach(p => {
        const isEliminated = window.eliminatedIds.has(p.place_id);
        const isDislike = window.userRatings[p.place_id] === 'dislike';
        const isFiltered = filterDislike && isDislike;

        const tr = document.createElement('tr');
        tr.id = `row-${p.place_id}`; 
        if (isEliminated || isFiltered) tr.classList.add('eliminated'); 

        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.place_id}`;
        
        let nameHtml = `<a href="${mapUrl}" target="_blank" class="store-link" title="在 Google 地圖上查看">${p.name}</a>`;
        if (window.userRatings[p.place_id]) {
            if (window.userRatings[p.place_id] === 'like') {
                nameHtml = `<span class="personal-tag like">👍</span> ` + nameHtml;
            } else if (isDislike) {
                nameHtml = `<span class="personal-tag dislike">💣</span> ` + nameHtml;
            }
        }
        
        // 營業狀態標籤 (僅簡單顯示)
        let statusHtml = "";
        if (p.opening_hours) {
            if (p.opening_hours.open_now) {
                statusHtml = `<span style="color:#27ae60; font-size:0.8em; border:1px solid #27ae60; border-radius:3px; padding:1px 3px;">營業中</span>`;
            } else {
                statusHtml = `<span style="color:#c0392b; font-size:0.8em; border:1px solid #c0392b; border-radius:3px; padding:1px 3px;">休息中</span>`;
            }
        } else {
             statusHtml = `<span style="color:#999; font-size:0.8em;">時間未知</span>`;
        }

        const ratingText = p.rating ? `${p.rating} <span style="font-size:0.8em; color:#666;">(${p.user_ratings_total || 0})</span>` : "無評價";
        const distanceText = p.realDistanceText ? `${p.realDistanceText}<br><span style="font-size:0.85em; color:#666;">${p.realDurationText}</span>` : "未知";

        tr.innerHTML = `<td>${nameHtml}<br>${statusHtml}</td><td>⭐ ${ratingText}</td><td>${distanceText}</td><td class="hit-count">${window.hitCounts[p.place_id] || 0}</td>`;
        tbody.appendChild(tr);
    });
    
    if (!document.getElementById('disclaimer-row')) {
        const footerRow = document.createElement('tr');
        footerRow.id = 'disclaimer-row';
        footerRow.innerHTML = `<td colspan="4" style="font-size:0.75rem; color:#999; text-align:center; padding:5px;">* 營業時間狀態僅供參考，請以商家實際公告為準。</td>`;
        tbody.appendChild(footerRow);
    }
};

window.validateGeminiKey = async function() {
    const key = document.getElementById('userGeminiKey').value.trim();
    if(!key) return alert("請輸入 Gemini API Key");
    
    const btn = document.getElementById('btnValidateGemini');
    const orgText = btn.innerText;
    btn.innerText = "⏳ 載入中...";
    btn.disabled = true;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();
        
        if(data.models) {
            alert("✅ Gemini Key 驗證成功！\n模型清單已更新。");
            localStorage.setItem('food_wheel_gemini_key', key);
            
            const select = document.getElementById('geminiModelSelect');
            select.innerHTML = '';
            
            data.models.forEach(m => {
                const name = m.name.replace('models/', '');
                if(name.toLowerCase().includes('gemini')) {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.innerText = `${name} (${m.displayName || ''})`;
                    if(name === 'gemini-1.5-flash') opt.selected = true;
                    select.appendChild(opt);
                }
            });
            if (select.options.length === 0) select.innerHTML = '<option value="gemini-1.5-flash">Gemini 1.5 Flash (Default)</option>';
        } else {
            throw new Error(data.error?.message || "無法取得模型列表");
        }
    } catch(e) {
        console.error(e);
        alert("❌ 驗證失敗：請檢查 Key 是否正確。\n" + e.message);
    } finally {
        btn.innerText = orgText;
        btn.disabled = false;
    }
};

window.testSelectedGeminiModel = async function() {
    const key = document.getElementById('userGeminiKey').value.trim();
    const model = document.getElementById('geminiModelSelect').value;
    if(!key || !model) return alert("請先輸入 Key 並載入模型");
    alert(`正在測試 ${model} ...`);
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: "Hello, just reply 'OK'" }] }] })
        });
        const data = await response.json();
        if(data.candidates) alert("⚡ 測試成功！API 運作正常。");
        else alert("測試失敗：" + JSON.stringify(data));
    } catch(e) {
        alert("測試連線錯誤：" + e.message);
    }
};
