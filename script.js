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
        
        // 預填設定頁面的偏好 (無論是否已登入都先做，以防使用者稍後要修改)
        if (typeof window.populateSetupKeywords === 'function') window.populateSetupKeywords(); 
        if (typeof window.populateSetupGeneralPrefs === 'function') window.populateSetupGeneralPrefs();
        
        const geminiKey = localStorage.getItem('food_wheel_gemini_key');
        if(geminiKey && document.getElementById('userGeminiKey')) {
            document.getElementById('userGeminiKey').value = geminiKey;
            // 如果有 Gemini Key，可以嘗試自動載入模型列表 (非阻塞)
            if(typeof window.validateGeminiKey === 'function') {
                // 模擬點擊驗證按鈕，但不要彈出 alert 
                // 這裡簡單略過，讓使用者自己點擊載入
            }
        }

        if (savedKey) {
            console.log("Saved key found, loading Maps SDK...");
            // 有 Key -> 載入 SDK -> SDK callback 會呼叫 initApp
            if (typeof window.loadGoogleMapsScript === 'function') {
                window.loadGoogleMapsScript(savedKey);
            } else {
                console.error("loadGoogleMapsScript function missing!");
                alert("系統錯誤：UI 模組未正確載入");
            }
        } else {
            console.log("No key found, showing Setup screen.");
            // 無 Key -> 顯示設定頁
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

                    // 顯示結果
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
    document.getElementById('storeName').innerText = p.name;
    document.getElementById('storeRating').innerText = p.rating ? `⭐ ${p.rating} (${p.user_ratings_total})` : "無評價";
    document.getElementById('storeAddress').innerText = p.vicinity || p.formatted_address;
    document.getElementById('storeDistance').innerHTML = p.realDistanceText ? `${p.realDistanceText} / ${p.realDurationText}` : "";
    
    // 顯示按鈕
    ['navLink', 'webLink', 'menuPhotoLink', 'btnAiMenu', 'btnLike', 'btnDislike'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'inline-block'; // 或 block，視 CSS 而定
    });

    // 設定連結
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.place_id}`;
    document.getElementById('navLink').href = mapUrl;
    
    // 設定相片連結
    const photoBtn = document.getElementById('menuPhotoLink');
    if (p.photos && p.photos.length > 0) {
        photoBtn.href = p.photos[0].getUrl({maxWidth: 800});
        photoBtn.style.display = 'inline-block';
        window.currentStoreForMenu = p; // 為了 AI Menu
        document.getElementById('btnAiMenu').style.display = 'inline-block';
    } else {
        photoBtn.style.display = 'none';
        document.getElementById('btnAiMenu').style.display = 'none';
    }

    // 更新 hit count
    if(window.hitCounts[p.place_id] !== undefined) window.hitCounts[p.place_id]++;
    
    // 更新評價狀態
    updateRatingUI(p.place_id);
    
    // 綁定評價按鈕事件
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
