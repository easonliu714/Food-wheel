let places = [];
let currentRotation = 0;
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');

// 1. 根據時間初始化類別
function autoSelectMealType() {
    const hour = new Date().getHours();
    let type = 'lunch';
    if (hour >= 5 && hour < 10) type = 'breakfast';
    else if (hour >= 10 && hour < 14) type = 'lunch';
    else if (hour >= 14 && hour < 17) type = 'afternoon_tea';
    else if (hour >= 17 && hour < 21) type = 'dinner';
    else type = 'late_night';
    
    const mealSelect = document.getElementById('mealType');
    if(mealSelect) mealSelect.value = type;
}

// 2. 獲取定位與搜尋店家 (含真實路程計算)
function fetchNearbyPlaces() {
    // 【安全檢查 1】確認 Google API 是否載入
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        alert("錯誤：Google Maps API 未成功載入。\n請檢查 index.html 中的 API Key 是否正確，以及網路是否連線。");
        return; // 直接結束，不鎖按鈕
    }

    if (!navigator.geolocation) return alert("您的瀏覽器不支援定位功能");

    const btn = document.querySelector('.search-btn');
    const spinBtn = document.getElementById('spinBtn');
    
    // 鎖定按鈕狀態
    btn.innerText = "定位與搜尋中...";
    btn.disabled = true;
    spinBtn.disabled = true;
    spinBtn.style.opacity = "0.5";
    spinBtn.style.cursor = "not-allowed";
    spinBtn.innerText = "資料讀取中...";

    // 【設定定位超時】避免無限等待 (設定 10 秒)
    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 10000, 
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        (position) => {
            // 定位成功，開始執行搜尋
            try {
                const userLoc = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                startSearch(userLoc);
            } catch (e) {
                console.error(e);
                alert("執行搜尋時發生未預期的錯誤：" + e.message);
                resetButtons();
            }
        }, 
        (error) => {
            // 定位失敗的處理
            console.error("Geolocation Error:", error);
            let msg = "無法取得定位";
            switch(error.code) {
                case error.PERMISSION_DENIED: msg = "您拒絕了定位權限，請允許後重試。"; break;
                case error.POSITION_UNAVAILABLE: msg = "無法偵測目前位置 (GPS 訊號弱)。"; break;
                case error.TIMEOUT: msg = "定位逾時 (超過 10 秒)，請檢查網路或 GPS。"; break;
            }
            alert(msg);
            resetButtons();
        },
        geoOptions
    );
}

// 拆分出來的搜尋邏輯
function startSearch(userLoc) {
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    const type = document.getElementById('mealType').value;
    const transportMode = document.getElementById('transportMode').value;
    const maxTime = parseInt(document.getElementById('maxTime').value, 10);
    const userMaxCount = parseInt(document.getElementById('resultCount').value, 10);

    const keywords = {
        breakfast: "早餐店",
        lunch: "餐廳",
        afternoon_tea: "飲料店 咖啡廳",
        dinner: "餐廳 晚餐",
        late_night: "宵夜 鹽酥雞"
    };

    let heuristicRadius = 1000; 
    if (transportMode === 'WALKING') {
        heuristicRadius = (maxTime / 60) * 5000 * 1.5; 
    } else {
        heuristicRadius = (maxTime / 60) * 40000 * 1.2; 
    }
    if(heuristicRadius > 5000) heuristicRadius = 5000; 
    if(heuristicRadius < 500) heuristicRadius = 500;

    const request = {
        location: userLoc,
        radius: heuristicRadius,
        query: keywords[type]
    };

    service.textSearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
            // 取前 25 筆去算距離
            let candidates = results.slice(0, 25);
            
            // 更新 UI 狀態
            const btn = document.querySelector('.search-btn');
            btn.innerText = "計算真實路程中...";
            
            // 前往計算距離
            calculateActualDistance(userLoc, candidates, transportMode, maxTime, userMaxCount);
        } else {
            // 【錯誤處理】如果 API 回傳非 OK 狀態
            console.error("Places API Failed:", status);
            if (status === "ZERO_RESULTS") {
                alert("抱歉，附近 2km 內找不到符合關鍵字的店家。");
            } else if (status === "REQUEST_DENIED" || status === "OVER_QUERY_LIMIT") {
                alert("API 錯誤：請檢查您的 API Key 是否正確且已啟用 Places API。\n狀態碼：" + status);
            } else {
                alert("搜尋失敗，Google 回傳狀態：" + status);
            }
            resetButtons();
        }
    });
}

// 計算真實距離
function calculateActualDistance(origin, destinations, mode, maxTimeLimit, userMaxCount) {
    // 【安全檢查 2】防止空陣列導致 crash
    if (!destinations || destinations.length === 0) {
        alert("無店家資料可計算距離。");
        resetButtons();
        return;
    }

    const service = new google.maps.DistanceMatrixService();
    const destLocs = destinations.map(d => d.geometry.location);

    service.getDistanceMatrix({
        origins: [origin],
        destinations: destLocs,
        travelMode: google.maps.TravelMode[mode],
        unitSystem: google.maps.UnitSystem.METRIC,
    }, (response, status) => {
        if (status === 'OK') {
            const results = response.rows[0].elements;
            places = [];

            for (let i = 0; i < destinations.length; i++) {
                const element = results[i];
                // 必須確認 element 狀態也是 OK (有時候特定地點會計算失敗)
                if (element.status === 'OK') {
                    const durationMins = Math.ceil(element.duration.value / 60);
                    
                    if (durationMins <= maxTimeLimit) {
                        let place = destinations[i];
                        place.realDistanceText = element.distance.text;
                        place.realDurationText = element.duration.text;
                        place.realDurationMins = durationMins;
                        places.push(place);
                    }
                }
            }

            // 截斷數量
            if (places.length > userMaxCount) {
                places = places.slice(0, userMaxCount);
            }

            if (places.length === 0) {
                alert(`在 ${maxTimeLimit} 分鐘${mode === 'WALKING' ? '走路' : '車程'}範圍內找不到符合的店家。\n(API 已過濾掉 ${destinations.length} 間太遠的店)`);
                resetButtons();
            } else {
                drawWheel();
                enableSpinButton(places.length);
            }
        } else {
            console.error("Distance Matrix Failed:", status);
            // 降級處理：如果距離 API 失敗，直接用原本搜尋結果，不計算時間
            places = destinations.slice(0, userMaxCount);
            drawWheel();
            enableSpinButton(places.length);
            alert("注意：路程計算 API 失敗 (可能是 Key 權限不足)，目前顯示直線搜尋結果。");
        }
    });
}

function resetButtons() {
    const btn = document.querySelector('.search-btn');
    btn.innerText = "🔄 搜尋附近店家";
    btn.disabled = false;
    
    // 如果失敗，也要把抽籤按鈕重置回不可用狀態
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.disabled = true;
    spinBtn.style.opacity = "0.5";
    spinBtn.style.cursor = "not-allowed";
    spinBtn.innerText = "請先搜尋店家";
}

function enableSpinButton(count) {
    const btn = document.querySelector('.search-btn');
    const spinBtn = document.getElementById('spinBtn');
    
    btn.innerText = `搜尋完成 (共 ${count} 間)`;
    btn.disabled = false;
    
    spinBtn.disabled = false;
    spinBtn.style.opacity = "1";
    spinBtn.style.cursor = "pointer";
    spinBtn.innerText = "開始抽籤";

    // 重置輪盤
    currentRotation = 0;
    canvas.style.transform = `rotate(0deg)`;
    document.getElementById('storeName').innerText = "點擊輪盤開始抉擇";
    
    const ratingEl = document.getElementById('storeRating');
    if(ratingEl) ratingEl.innerText = "";
    
    document.getElementById('storeAddress').innerText = "";
    document.getElementById('storeDistance').innerText = "";
    document.getElementById('menuLink').style.display = "none";
}

// 3. 繪製輪盤
function drawWheel() {
    const numOptions = places.length;
    if (numOptions === 0) return;
    const arcSize = (2 * Math.PI) / numOptions;
    const startAngleOffset = -Math.PI / 2;

    ctx.clearRect(0, 0, 400, 400);

    places.forEach((place, i) => {
        const angle = startAngleOffset + (i * arcSize);
        
        ctx.fillStyle = `hsl(${i * (360 / numOptions)}, 70%, 60%)`;
        ctx.beginPath();
        ctx.moveTo(200, 200);
        ctx.arc(200, 200, 200, angle, angle + arcSize);
        ctx.fill();
        ctx.stroke();

        // 寫字
        ctx.save();
        ctx.translate(200, 200);
        ctx.rotate(angle + arcSize / 2);
        
        let fontSize = 16;
        if (numOptions > 20) fontSize = 12;
        if (numOptions > 30) fontSize = 10;
        
        ctx.fillStyle = "white";
        ctx.font = `bold ${fontSize}px Arial`;
        
        let text = place.name;
        if (text.length > 8) text = text.substring(0, 7) + "..";
        ctx.fillText(text, 60, 5);
        ctx.restore();
    });
}

// 4. 旋轉邏輯
document.getElementById('spinBtn').onclick = () => {
    if (places.length === 0) return;
    
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.disabled = true;

    const spinAngle = Math.floor(Math.random() * 1800) + 1800; 
    currentRotation += spinAngle;
    
    canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvas.style.transform = `rotate(${currentRotation}deg)`;

    setTimeout(() => {
        const numOptions = places.length;
        const arcSize = 360 / numOptions;
        const actualRotation = currentRotation % 360;
        const winningIndex = Math.floor((360 - actualRotation) / arcSize) % numOptions;
        
        const winner = places[winningIndex];

        document.getElementById('storeName').innerText = "就決定吃：" + winner.name;
        
        const ratingElement = document.getElementById('storeRating');
        if (ratingElement) {
            if (winner.rating) {
                ratingElement.innerText = `⭐ ${winner.rating} (${winner.user_ratings_total || 0} 則評價)`;
            } else {
                ratingElement.innerText = "暫無評價資料";
            }
        }

        document.getElementById('storeAddress').innerText = winner.formatted_address;
        
        if (winner.realDurationText) {
             document.getElementById('storeDistance').innerText = 
                `⏱️ 預估耗時：${winner.realDurationText} (${winner.realDistanceText})`;
        } else {
             document.getElementById('storeDistance').innerText = "";
        }

        const link = document.getElementById('menuLink');
        link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(winner.name)}&query_place_id=${winner.place_id}`;
        link.style.display = 'inline-block';
        link.innerText = "📍 導航去這家";
        
        spinBtn.disabled = false;
    }, 4000);
};

// 初始化
window.onload = () => {
    autoSelectMealType();
};
