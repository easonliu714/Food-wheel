let places = [];
let currentRotation = 0;
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');

// 1. 根據時間初始化類別 (預設仍保留時間判斷，但使用者可以手動切換到新類別)
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

// 2. 獲取定位與搜尋店家
function fetchNearbyPlaces() {
    // 安全檢查：確認 Google API 是否載入
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        alert("錯誤：Google Maps API 未成功載入。請檢查 API Key 是否正確或網路連線。");
        return;
    }

    if (!navigator.geolocation) return alert("您的瀏覽器不支援定位功能");

    const btn = document.querySelector('.search-btn');
    const spinBtn = document.getElementById('spinBtn');
    
    // UI 鎖定
    btn.innerText = "定位與搜尋中...";
    btn.disabled = true;
    spinBtn.disabled = true;
    spinBtn.style.opacity = "0.5";
    spinBtn.style.cursor = "not-allowed";
    spinBtn.innerText = "資料讀取中...";

    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 10000, 
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        (position) => {
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
            console.error("Geolocation Error:", error);
            let msg = "無法取得定位";
            if(error.code === error.PERMISSION_DENIED) msg = "您拒絕了定位權限。";
            if(error.code === error.TIMEOUT) msg = "定位逾時，請檢查 GPS 訊號。";
            alert(msg);
            resetButtons();
        },
        geoOptions
    );
}

// 拆分出的搜尋邏輯 (包含新類別關鍵字)
function startSearch(userLoc) {
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    
    // 取得使用者選擇
    const typeElement = document.getElementById('mealType');
    const type = typeElement ? typeElement.value : 'all'; // 防呆
    
    const transportModeElement = document.getElementById('transportMode');
    const transportMode = transportModeElement ? transportModeElement.value : 'WALKING';

    const maxTimeElement = document.getElementById('maxTime');
    const maxTime = maxTimeElement ? parseInt(maxTimeElement.value, 10) : 10;
    
    const countElement = document.getElementById('resultCount');
    const userMaxCount = countElement ? parseInt(countElement.value, 10) : 20;

    // --- 核心修改：新增類別的關鍵字對照表 ---
    const keywords = {
        //原本的時段類
        breakfast: "早餐店 早午餐",
        lunch: "餐廳 午餐 便當",
        afternoon_tea: "飲料店 咖啡廳 下午茶 甜點",
        dinner: "餐廳 晚餐 火鍋",
        late_night: "宵夜 鹽酥雞 串燒",
        
        // 新增的類別
        chinese: "中式料理 麵店 飯館 水餃 小吃",
        western: "西式料理 義大利麵 漢堡 牛排",
        dessert: "甜點 冰品 飲料店 豆花",
        all: "美食 餐廳 小吃"  // 不限制時，用廣泛關鍵字搜尋
    };

    // 計算搜尋半徑 (Heuristic Radius)
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
        query: keywords[type] || "餐廳" // 預設值
    };

    service.textSearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
            // 取前 25 筆去算距離
            let candidates = results.slice(0, 25);
            
            const btn = document.querySelector('.search-btn');
            if(btn) btn.innerText = "計算真實路程中...";
            
            calculateActualDistance(userLoc, candidates, transportMode, maxTime, userMaxCount);
        } else {
            console.error("Places API Failed:", status);
            if (status === "ZERO_RESULTS") {
                alert("附近找不到符合該類別的店家，請嘗試放寬條件。");
            } else if (status === "OVER_QUERY_LIMIT") {
                alert("搜尋太頻繁，請稍等幾秒後再試。");
            } else {
                alert("搜尋失敗，狀態碼：" + status);
            }
            resetButtons();
        }
    });
}

// 計算真實距離
function calculateActualDistance(origin, destinations, mode, maxTimeLimit, userMaxCount) {
    if (!destinations || destinations.length === 0) {
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

            if (places.length > userMaxCount) {
                places = places.slice(0, userMaxCount);
            }

            if (places.length === 0) {
                alert(`在 ${maxTimeLimit} 分鐘${mode === 'WALKING' ? '走路' : '車程'}範圍內找不到符合的店家。\n(可能因 Google 優先回傳遠處熱門店，導致近處店家被排擠)`);
                resetButtons();
            } else {
                drawWheel();
                enableSpinButton(places.length);
            }
        } else {
            console.error("Distance Matrix Failed:", status);
            // 降級處理：直接用直線搜尋結果
            places = destinations.slice(0, userMaxCount);
            drawWheel();
            enableSpinButton(places.length);
            alert("注意：路程計算失敗 (API 限制或連線問題)，目前顯示直線搜尋結果。");
        }
    });
}

function resetButtons() {
    const btn = document.querySelector('.search-btn');
    if(btn) {
        btn.innerText = "🔄 搜尋附近店家";
        btn.disabled = false;
    }
    
    const spinBtn = document.getElementById('spinBtn');
    if(spinBtn) {
        spinBtn.disabled = true;
        spinBtn.style.opacity = "0.5";
        spinBtn.style.cursor = "not-allowed";
        spinBtn.innerText = "請先搜尋店家";
    }
}

function enableSpinButton(count) {
    const btn = document.querySelector('.search-btn');
    const spinBtn = document.getElementById('spinBtn');
    
    if(btn) {
        btn.innerText = `搜尋完成 (共 ${count} 間)`;
        btn.disabled = false;
    }
    
    if(spinBtn) {
        spinBtn.disabled = false;
        spinBtn.style.opacity = "1";
        spinBtn.style.cursor = "pointer";
        spinBtn.innerText = "開始抽籤";
    }

    // 重置畫面
    currentRotation = 0;
    canvas.style.transform = `rotate(0deg)`;
    document.getElementById('storeName').innerText = "點擊輪盤開始抉擇";
    
    const ratingEl = document.getElementById('storeRating');
    if(ratingEl) ratingEl.innerText = "";
    
    document.getElementById('storeAddress').innerText = "";
    document.getElementById('storeDistance').innerText = "";
    document.getElementById('menuLink').style.display = "none";
}

// 繪製輪盤
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

// 旋轉與結果判定
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