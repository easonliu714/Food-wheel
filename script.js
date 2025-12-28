// ================== script.js : 入口點與核心互動邏輯 ==================
// Version: 2025-12-28-v2
// Tasks:
// 1. 顯示詳細營業預估時間 (下一個營業/休息時間點)
// 2. 商家官網按鈕優先連結至 website
// 3. 新增電話顯示欄位
// 4. 調整資訊顯示順序 (地址>電話>狀態>路程)

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
            ['storeName', 'storeRating', 'storeAddress', 'storePhone', 'storeStatus', 'storeDistance', 'userPersonalRating'].forEach(id => {
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
    // 1. 基本資訊
    document.getElementById('storeName').innerText = p.name;
    document.getElementById('storeRating').innerText = p.rating ? `⭐ ${p.rating} (${p.user_ratings_total})` : "無評價";
    document.getElementById('storeAddress').innerText = p.vicinity || p.formatted_address;
    
    // 初始化暫位文字
    document.getElementById('storePhone').innerText = "";
    document.getElementById('storeStatus').innerText = "讀取詳細營業時間...";
    document.getElementById('storeDistance').innerText = p.realDistanceText ? `🚗 路程：${p.realDistanceText} / ${p.realDurationText}` : "";

    // 2. 顯示按鈕
    ['navLink', 'menuPhotoLink', 'btnAiMenu', 'btnLike', 'btnDislike'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'inline-block';
    });
    // 預設隱藏 webLink，等到確認有網址再顯示
    document.getElementById('webLink').style.display = 'none';

    // 設定基礎連結
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&destination_place_id=${p.place_id}`;
    document.getElementById('navLink').href = mapUrl;
    
    const menuQuery = `${p.name} ${p.vicinity || ""} 菜單`;
    document.getElementById('menuPhotoLink').href = `https://www.google.com/search?q=${encodeURIComponent(menuQuery)}&tbm=isch`;

    window.currentStoreForMenu = p;
    document.getElementById('btnAiMenu').style.display = 'inline-block';

    // 3. 呼叫 GetDetails 取得電話、官網與詳細營業時間
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails({
        placeId: p.place_id,
        fields: ['name', 'website', 'url', 'formatted_phone_number', 'opening_hours']
    }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            // A. 電話
            if (place.formatted_phone_number) {
                document.getElementById('storePhone').innerText = `📞 ${place.formatted_phone_number}`;
            } else {
                document.getElementById('storePhone').innerText = "";
            }

            // B. 官網按鈕 (優先使用 website)
            const webBtn = document.getElementById('webLink');
            if (place.website) {
                webBtn.style.display = 'inline-block';
                webBtn.href = place.website; // 直連官網
            } else if (place.url) {
                // 如果沒有官網，是否要顯示地圖連結？依需求通常隱藏，或作為備案
                // 這裡選擇作為備案，但標示清楚
                // webBtn.style.display = 'inline-block';
                // webBtn.href = place.url; 
            }

            // C. 詳細營業狀態計算
            if (place.opening_hours) {
                const isOpen = place.opening_hours.isOpen ? place.opening_hours.isOpen() : place.opening_hours.open_now;
                const nextStatus = calculateNextStatusTime(place.opening_hours);
                
                let statusHtml = "";
                if (isOpen) {
                    statusHtml = `<span style="color:#27ae60; font-weight:bold;">🟢 營業中</span>`;
                    if (nextStatus) statusHtml += ` <span style="font-size:0.9em; color:#555;">・預計 ${nextStatus} 結束營業</span>`;
                } else {
                    statusHtml = `<span style="color:#c0392b; font-weight:bold;">🔴 休息中</span>`;
                    if (nextStatus) statusHtml += ` <span style="font-size:0.9em; color:#555;">・預計 ${nextStatus} 開始營業</span>`;
                }
                document.getElementById('storeStatus').innerHTML = statusHtml;
            } else {
                document.getElementById('storeStatus').innerText = "營業時間未知";
            }
        } else {
            document.getElementById('storeStatus').innerText = "無法取得詳細資訊";
        }
    });

    // 更新 hit count 與評價
    if(window.hitCounts[p.place_id] !== undefined) window.hitCounts[p.place_id]++;
    updateRatingUI(p.place_id);
    document.getElementById('btnLike').onclick = () => ratePlace(p.place_id, 'like');
    document.getElementById('btnDislike').onclick = () => ratePlace(p.place_id, 'dislike');
}

// 計算下一個營業變化的時間
function calculateNextStatusTime(openingHours) {
    if (!openingHours || !openingHours.periods) return null;
    
    const now = new Date();
    const dayMap = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 100 + now.getMinutes(); // HHMM 格式
    
    const isOpen = openingHours.isOpen ? openingHours.isOpen() : openingHours.open_now;
    
    // 將所有時間點正規化為：距離本週日 00:00 的分鐘數，以便跨日比較
    // 0(Sun) -> 6(Sat)
    
    let targetTime = null;
    let minDiff = Infinity;
    
    // 轉換現在時間為分鐘數 (以週日為起點)
    const nowAbsMinutes = currentDay * 24 * 60 + now.getHours() * 60 + now.getMinutes();

    openingHours.periods.forEach(period => {
        if (!period.open || !period.close) return; // 24小時營業可能無 close
        
        // 如果現在是營業中，找 Close 時間
        if (isOpen) {
            // 計算 Close 時間的絕對分鐘數
            let closeDay = period.close.day;
            let closeTime = parseInt(period.close.time);
            let closeHour = Math.floor(closeTime / 100);
            let closeMin = closeTime % 100;
            let closeAbsMinutes = closeDay * 24 * 60 + closeHour * 60 + closeMin;
            
            // 處理跨週 (例如現在是週六，下個關門是週日)
            if (closeAbsMinutes < nowAbsMinutes) closeAbsMinutes += 7 * 24 * 60;
            
            let diff = closeAbsMinutes - nowAbsMinutes;
            if (diff >= 0 && diff < minDiff) {
                minDiff = diff;
                targetTime = { day: closeDay, time: period.close.time };
            }
        } 
        // 如果現在是休息中，找 Open 時間
        else {
            let openDay = period.open.day;
            let openTime = parseInt(period.open.time);
            let openHour = Math.floor(openTime / 100);
            let openMin = openTime % 100;
            let openAbsMinutes = openDay * 24 * 60 + openHour * 60 + openMin;
            
            if (openAbsMinutes < nowAbsMinutes) openAbsMinutes += 7 * 24 * 60;
            
            let diff = openAbsMinutes - nowAbsMinutes;
            if (diff >= 0 && diff < minDiff) {
                minDiff = diff;
                targetTime = { day: openDay, time: period.open.time };
            }
        }
    });

    if (targetTime) {
        const hour = targetTime.time.substring(0, 2);
        const min = targetTime.time.substring(2);
        return `${dayMap[targetTime.day]} ${hour}:${min}`;
    }
    return null;
}

function ratePlace(placeId, type) {
    if (window.userRatings[placeId] === type) {
        delete window.userRatings[placeId]; 
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
