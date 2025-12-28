// ... showGuide, populateSetupKeywords 保持不變 ...

window.populateSetupGeneralPrefs = function() {
    const prefsJson = localStorage.getItem('food_wheel_prefs');
    // [NEW] 填入金鑰但進行遮蔽
    const savedMapKey = localStorage.getItem('food_wheel_api_key');
    const savedGeminiKey = localStorage.getItem('food_wheel_gemini_key');
    
    // 如果有金鑰，顯示遮蔽符號；否則留空
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

window.validateAndSaveKey = function() {
    // 這裡只負責驗證並儲存 Maps Key。Gemini Key 透過 saveAndStart 處理。
    // 但因為 validateAndSaveKey 會觸發 Google Maps 載入測試，我們需要取得真實 Key
    
    let inputKey = document.getElementById('userApiKey').value.trim();
    const savedKey = localStorage.getItem('food_wheel_api_key');
    
    // [NEW] 檢查是否為遮蔽字元
    if (inputKey === '●●●●●●●●') {
        if (savedKey) {
            inputKey = savedKey; // 使用舊金鑰
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

    // 清除舊 script
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
    // 1. 處理 Maps Key
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

    // 2. 處理 Gemini Key
    const inputGeminiKey = document.getElementById('userGeminiKey') ? document.getElementById('userGeminiKey').value.trim() : "";
    if (inputGeminiKey) {
        if (inputGeminiKey !== '●●●●●●●●') {
            localStorage.setItem('food_wheel_gemini_key', inputGeminiKey);
        }
        // 如果是遮蔽字元，代表使用者沒改，不用動作
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

// ... loadGoogleMapsScript, initApp, loadPreferencesToMainApp, editPreferences, resetApiKey, resetGame, enableSpinButton, refreshWheelData, drawWheel, initResultList, validateGeminiKey, testSelectedGeminiModel 保持不變 ...
// (這些函式在 ui_control.js 中，請確保保留原本邏輯)
