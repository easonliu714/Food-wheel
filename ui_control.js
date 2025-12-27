// ================== ui_control.js : 介面控制與 API 驗證 ==================

// 1. 基礎設定與教學
window.showGuide = function(platform) {
    const container = document.getElementById('guide-content');
    if(!container) return;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
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
        } catch (e) {}
    }
};

// 3. API 驗證邏輯
window.validateAndSaveKey = async function() {
    const inputKey = document.getElementById('userApiKey').value.trim();
    if (!inputKey) return alert("請輸入 API Key");

    const btn = document.querySelector('.start-btn');
    const originalText = btn.innerText;
    btn.innerText = "驗證中...";
    btn.disabled = true;

    // 清除舊 script
    const oldScript = document.getElementById('google-maps-script');
    if(oldScript) oldScript.remove();

    window.gm_authFailure = () => {
        alert("❌ 驗證失敗：Google 拒絕了此 Key。\n請檢查 Key 是否正確且已啟用 Billing。");
        btn.innerText = originalText;
        btn.disabled = false;
    };

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${inputKey}&libraries=places,geometry&callback=onMapsApiValidationSuccess`;
    script.async = true;

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
            window.saveAndStart(true); 
        } catch (err) {
            alert(`⚠️ API Key 有效但權限不足：\n${err}`);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
            delete window.onMapsApiValidationSuccess;
        }
    };
    script.onerror = () => { alert("❌ 無法連線至 Google Maps。"); btn.disabled = false; };
    document.head.appendChild(script);
};

window.saveAndStart = function(skipLoad = false) {
    const inputKey = document.getElementById('userApiKey').value.trim();
    if (inputKey.length < 20) return alert("Key 格式錯誤");
    
    // 儲存設定 (略縮寫，邏輯同前)
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
    localStorage.setItem('food_wheel_api_key', inputKey);
    localStorage.setItem('food_wheel_prefs', JSON.stringify(userPrefs));
    
    if (!skipLoad) window.loadGoogleMapsScript(inputKey);
    else {
        document.getElementById('setup-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        window.initApp();
    }
};

// 4. 【關鍵修復】將核心 UI 函式移至此處，確保全域可用

window.resetGame = function(fullReset) {
    window.currentRotation = 0; 
    if(window.canvas) {
        window.canvas.style.transform = `rotate(0deg)`;
        window.canvas.style.transition = 'none'; 
    }
    
    const storeName = document.getElementById('storeName');
    if(storeName) storeName.innerText = "點擊輪盤開始抉擇";
    
    ['storeRating', 'storeAddress', 'storeDistance', 'userPersonalRating'].forEach(id => {
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

        const ratingText = p.rating ? `${p.rating} <span style="font-size:0.8em; color:#666;">(${p.user_ratings_total || 0})</span>` : "無評價";
        const distanceText = p.realDistanceText ? `${p.realDistanceText}<br><span style="font-size:0.85em; color:#666;">${p.realDurationText}</span>` : "未知";

        tr.innerHTML = `<td>${nameHtml}</td><td>⭐ ${ratingText}</td><td>${distanceText}</td><td class="hit-count">${window.hitCounts[p.place_id] || 0}</td>`;
        tbody.appendChild(tr);
    });
};
