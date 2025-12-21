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
    
    document.getElementById('mealType').value = type;
}

// 2. 獲取定位與搜尋店家 (含真實路程計算)
function fetchNearbyPlaces() {
    if (!navigator.geolocation) return alert("瀏覽器不支援定位");

    const btn = document.querySelector('.search-btn');
    const spinBtn = document.getElementById('spinBtn');
    
    // 鎖定按鈕
    btn.innerText = "定位與搜尋中...";
    btn.disabled = true;
    spinBtn.disabled = true;
    spinBtn.style.opacity = "0.5";
    spinBtn.style.cursor = "not-allowed";
    spinBtn.innerText = "資料讀取中...";

    navigator.geolocation.getCurrentPosition(position => {
        const userLoc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        const service = new google.maps.places.PlacesService(document.createElement('div'));
        const type = document.getElementById('mealType').value;
        const transportMode = document.getElementById('transportMode').value;
        const maxTime = parseInt(document.getElementById('maxTime').value, 10);
        const userMaxCount = parseInt(document.getElementById('resultCount').value, 10);

        // 關鍵字對照
        const keywords = {
            breakfast: "早餐店",
            lunch: "餐廳",
            afternoon_tea: "飲料店 咖啡廳",
            dinner: "餐廳 晚餐",
            late_night: "宵夜 鹽酥雞"
        };

        // 估算搜尋半徑
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

        // 第一階段：先抓取地點
        service.textSearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                // 取前 25 筆去算距離
                let candidates = results.slice(0, 25);
                btn.innerText = "計算真實路程中...";
                
                // 第二階段：計算真實距離與時間
                calculateActualDistance(userLoc, candidates, transportMode, maxTime, userMaxCount);
            } else {
                alert("附近找不到店家，請嘗試放寬條件！");
                resetButtons();
            }
        });
    }, () => {
        alert("無法取得定位，請確認瀏覽器權限");
        resetButtons();
    });
}

// 計算真實距離 (使用 Distance Matrix API)
function calculateActualDistance(origin, destinations, mode, maxTimeLimit, userMaxCount) {
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
                alert(`在 ${maxTimeLimit} 分鐘${mode === 'WALKING' ? '走路' : '車程'}範圍內找不到符合的店家，請放寬時間限制。`);
                resetButtons();
            } else {
                drawWheel();
                enableSpinButton(places.length);
            }
        } else {
            console.error("Distance Matrix 失敗:", status);
            places = destinations.slice(0, userMaxCount);
            drawWheel();
            enableSpinButton(places.length);
            alert("注意：路程計算失敗（可能是 API 限制），目前顯示為直線搜尋結果。");
        }
    });
}

function resetButtons() {
    const btn = document.querySelector('.search-btn');
    btn.innerText = "🔄 搜尋附近店家";
    btn.disabled = false;
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

    // 重置輪盤角度與資訊
    currentRotation = 0;
    canvas.style.transform = `rotate(0deg)`;
    document.getElementById('storeName').innerText = "點擊輪盤開始抉擇";
    
    // 重置評價欄位
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
    
    // 修正：將繪製起點設為 -90度 (12點鐘方向)
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

    // 隨機旋轉
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

        // 顯示結果
        document.getElementById('storeName').innerText = "就決定吃：" + winner.name;
        
        // 新增：顯示評價資訊
        const ratingElement = document.getElementById('storeRating');
        if (ratingElement) {
            if (winner.rating) {
                ratingElement.innerText = `⭐ ${winner.rating} (${winner.user_ratings_total || 0} 則評價)`;
            } else {
                ratingElement.innerText = "暫無評價資料";
            }
        }

        document.getElementById('storeAddress').innerText = winner.formatted_address;
        
        // 顯示路程資訊
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
