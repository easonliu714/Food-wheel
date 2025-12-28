// script.js - 入口點與事件綁定

window.onload = () => {
    try {
        console.log("Window loaded. Starting initialization...");

        // 1. 初始化 Canvas
        window.canvas = document.getElementById('wheel');
        if(window.canvas) window.ctx = window.canvas.getContext('2d');
        window.menuCanvas = document.getElementById('menuWheel');
        if(window.menuCanvas) window.menuCtx = window.menuCanvas.getContext('2d');

        // 2. 載入使用者資料
        const savedRatings = localStorage.getItem('food_wheel_user_ratings');
        if (savedRatings) {
            try { window.userRatings = JSON.parse(savedRatings); } catch(e) { console.error(e); }
        }

        // 載入關鍵字
        if (typeof window.loadUserKeywords === 'function') window.loadUserKeywords();
        else window.activeKeywordDict = { ...window.defaultKeywordDict };

        // 3. 檢查 Key 並決定流程
        const savedKey = localStorage.getItem('food_wheel_api_key');
        
        // 預填設定頁面的偏好
        if (typeof window.populateSetupKeywords === 'function') window.populateSetupKeywords(); 
        if (typeof window.populateSetupGeneralPrefs === 'function') window.populateSetupGeneralPrefs();
        
        const geminiKey = localStorage.getItem('food_wheel_gemini_key');
        if(geminiKey && document.getElementById('userGeminiKey')) {
            document.getElementById('userGeminiKey').value = geminiKey;
        }

        if (savedKey) {
            console.log("Saved key found, loading Maps SDK...");
            if (typeof window.loadGoogleMapsScript === 'function') {
                window.loadGoogleMapsScript(savedKey);
            } else {
                console.error("loadGoogleMapsScript function missing!");
                alert("系統錯誤：UI 模組未正確載入");
            }
        } else {
            console.log("No key found, showing Setup screen.");
            document.getElementById('setup-screen').style.display = 'block';
            document.getElementById('app-screen').style.display = 'none';
            if (typeof window.showGuide === 'function') window.showGuide('desktop');
        }

        // 4. 綁定過濾器事件
        const filterCheckbox = document.getElementById('filterDislike');
        if (filterCheckbox) {
            filterCheckbox.addEventListener('change', () => { 
                if (typeof window.refreshWheelData === 'function') window.refreshWheelData(); 
            });
        }

    } catch (err) {
        console.error("Initialization Crash:", err);
        alert("程式初始化失敗：" + err.message);
    }
};

// Spin 按鈕邏輯
const spinBtn = document.getElementById('spinBtn');
if(spinBtn) {
    spinBtn.onclick = () => {
        try {
            if (window.places.length === 0) return;
            
            let spinMode = 'repeat';
            const spinModeEl = document.getElementById('spinMode'); 
            if (spinModeEl) spinMode = spinModeEl.value;
            
            spinBtn.disabled = true; 
            
            const spinAngle = Math.floor(Math.random() * 1800) + 1800; 
            window.currentRotation += spinAngle;
            window.canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
            window.canvas.style.transform = `rotate(${window.currentRotation}deg)`;

            // 轉動時隱藏結果與操作按鈕
            ['storeName', 'storeRating', 'storeAddress', 'storeDistance', 'userPersonalRating'].forEach(id => {
                const el = document.getElementById(id);
                if(el) {
                    if(id==='storeName') el.innerText = "命運旋轉中...";
                    else el.innerText = "";
                }
            });
            
            ['navLink', 'webLink', 'menuPhotoLink', 'btnAiMenu', 'btnLike', 'btnDislike'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.style.display = 'none';
            });

            setTimeout(() => {
                try {
                    const numOptions = window.places.length;
                    const arcSize = 360 / numOptions;
                    const actualRotation = window.currentRotation % 360;
                    let winningIndex = Math.floor((360 - actualRotation) / arcSize) % numOptions;
                    if (winningIndex < 0) winningIndex += numOptions;
                    
                    const winner = window.places[winningIndex];
                    if(!winner) throw new Error("Winner undefined");

                    // 顯示結果 (包含 Detail Fetch 邏輯)
                    updateResultUI(winner);

                    if (spinMode === 'eliminate') {
                        window.eliminatedIds.add(winner.place_id); 
                        setTimeout(() => {
                            window.canvas.style.transition = 'none';
                            window.currentRotation = 0;
                            window.canvas.style.transform = `rotate(0deg)`;
                            if (typeof window.refreshWheelData === 'function') window.refreshWheelData(); 
                        }, 2000); 
                    } else {
                        spinBtn.disabled = false;
                        if (typeof window.refreshWheelData === 'function') window.refreshWheelData(); 
                    }
                } catch (error) {
                    console.error("Spin Logic Error:", error);
                    spinBtn.disabled = false;
                }
            }, 4000);

        } catch (e) {
            console.error("Spin Init Error:", e);
            spinBtn.disabled = false;
        }
    };
}

// 輔助函式：更新結果顯示
function updateResultUI(p) {
    // 1. 先顯示基本資料 (避免等待 Loading 空白)
    document.getElementById('storeName').innerText = p.name;
    document.getElementById('storeRating').innerText = p.rating ? `⭐ ${p.rating} (${p.user_ratings_total})` : "無評價";
    document.getElementById('storeAddress').innerText = p.vicinity || p.formatted_address;
    
    // 基本營業狀態 (來自列表資料)
    let statusText = "";
    if (p.opening_hours) {
        statusText = p.opening_hours.open_now ? " 🟢 營業中" : " 🔴 休息中";
    } else {
        statusText = " (時間未知)";
    }
    document.getElementById('storeDistance').innerHTML = (p.realDistanceText ? `${p.realDistanceText} / ${p.realDurationText}` : "") + statusText;

    // 2. 顯示按鈕 (先全部顯示，之後依照 Detail 結果隱藏 webLink)
    ['navLink', 'menuPhotoLink', 'btnAiMenu', 'btnLike', 'btnDislike'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'inline-block';
    });
    // 預設先隱藏 webLink，等確認有官網再顯示
    document.getElementById('webLink').style.display = 'none';

    // 設定連結
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&destination_place_id=${p.place_id}`;
    document.getElementById('navLink').href = mapUrl;
    
    // 菜單圖片搜尋
    const menuQuery = `${p.name} ${p.vicinity || ""} 菜單`;
    document.getElementById('menuPhotoLink').href = `https://www.google.com/search?q=${encodeURIComponent(menuQuery)}&tbm=isch`;

    // AI 菜單按鈕設定
    window.currentStoreForMenu = p;
    document.getElementById('btnAiMenu').style.display = 'inline-block';

    // 3. 呼叫 GetDetails 取得更詳細資料 (為了檢查 website)
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails({
        placeId: p.place_id,
        fields: ['name', 'website', 'url', 'opening_hours'] // 只取需要的欄位節省流量
    }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            // === 關鍵邏輯：檢查是否有官網 ===
            const webBtn = document.getElementById('webLink');
            if (place.website) {
                // 有官網 -> 顯示按鈕 -> 連結至 Google Maps 總覽頁 (place.url)
                webBtn.style.display = 'inline-block';
                webBtn.href = place.url; 
            } else {
                // 無官網 -> 隱藏按鈕
                webBtn.style.display = 'none';
            }

            // 更新更精準的營業時間 (如果有)
            if (place.opening_hours) {
                const isOpen = place.opening_hours.isOpen ? place.opening_hours.isOpen() : place.opening_hours.open_now;
                 statusText = isOpen ? " 🟢 營業中" : " 🔴 休息中";
                 // 重新組合距離字串
                 document.getElementById('storeDistance').innerHTML = (p.realDistanceText ? `${p.realDistanceText} / ${p.realDurationText}` : "") + statusText;
            }
        }
    });

    // 更新 hit count 與評價
    if(window.hitCounts[p.place_id] !== undefined) window.hitCounts[p.place_id]++;
    updateRatingUI(p.place_id);
    document.getElementById('btnLike').onclick = () => ratePlace(p.place_id, 'like');
    document.getElementById('btnDislike').onclick = () => ratePlace(p.place_id, 'dislike');
}

function ratePlace(placeId, type) {
    if (window.userRatings[placeId] === type) {
        delete window.userRatings[placeId]; // 取消評價
    } else {
        window.userRatings[placeId] = type;
    }
    localStorage.setItem('food_wheel_user_ratings', JSON.stringify(window.userRatings));
    updateRatingUI(placeId);
    if (typeof window.refreshWheelData === 'function') window.refreshWheelData();
}

function updateRatingUI(placeId) {
    const status = window.userRatings[placeId];
    const btnLike = document.getElementById('btnLike');
    const btnDislike = document.getElementById('btnDislike');
    const label = document.getElementById('userPersonalRating');
    
    btnLike.classList.remove('active');
    btnDislike.classList.remove('active');
    label.innerText = "";
    
    if (status === 'like') {
        btnLike.classList.add('active');
        label.innerText = "❤️ 您標記為「回訪」";
        label.style.color = "#27ae60";
    } else if (status === 'dislike') {
        btnDislike.classList.add('active');
        label.innerText = "💣 您標記為「踩雷」";
        label.style.color = "#c0392b";
    }
}
