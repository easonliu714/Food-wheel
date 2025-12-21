let places = [];
let currentRotation = 0;
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');

// 1. 初始化類別
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
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        alert("錯誤：Google Maps API 未成功載入。");
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

    const geoOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

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
                alert("執行搜尋時發生錯誤：" + e.message);
                resetButtons();
            }
        }, 
        (error) => {
            console.error("Geolocation Error:", error);
            alert("無法取得定位，請確認權限或 GPS 訊號。");
            resetButtons();
        },
        geoOptions
    );
}

// 搜尋邏輯 (核心修改：支援分頁抓取更多資料)
function startSearch(userLoc) {
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    
    const type = document.getElementById('mealType').value;
    const transportMode = document.getElementById('transportMode').value;
    const maxTime = parseInt(document.getElementById('maxTime').value, 10);
    
    // 關鍵字設定 (修改為不限國別)
    const keywords = {
        breakfast: "早餐店 早午餐",
        lunch: "餐廳 小吃 麵食 飯館 午餐 便當",
        afternoon_tea: "飲料店 咖啡廳 下午茶 甜點 甜品 手搖 冰品",
        dinner: "餐廳 小吃 晚餐 火鍋",
        late_night: "宵夜 鹽酥雞 串燒 炸物",
        
        // 修改後的類別關鍵字
        noodles_rice: "麵食 飯食 麵店 飯館 牛肉麵 水餃 炒飯 丼飯 咖哩飯 拉麵 壽司 快炒", // 涵蓋中日台式
        western_steak: "牛排 義大利麵 披薩 漢堡 西式料理 美式餐廳 義式餐廳 鐵板燒 麵包 吃到飽", // 涵蓋西式排餐
        dessert: "甜點 冰品 飲料店 豆花 蛋糕",
        all: "美食 餐廳 小吃" 
    };

    // 搜尋半徑 (稍微放寬，確保能抓到足夠候選名單)
    let heuristicRadius = 1000; 
    if (transportMode === 'WALKING') heuristicRadius = (maxTime / 60) * 5000 * 1.5; 
    else heuristicRadius = (maxTime / 60) * 40000 * 1.2; 
    
    if(heuristicRadius > 5000) heuristicRadius = 5000; 
    if(heuristicRadius < 500) heuristicRadius = 500;

    const request = {
        location: userLoc,
        radius: heuristicRadius,
        query: keywords[type] || "餐廳"
    };

    let allResults = [];
    
    // 遞迴抓取 (最多抓 3 頁，約 60 筆)
    service.textSearch(request, (results, status, pagination) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            allResults = allResults.concat(results);
            
            // 如果還有下一頁，且目前抓不到 60 筆，就繼續抓
            if (pagination && pagination.hasNextPage && allResults.length < 60) {
                const btn = document.querySelector('.search-btn');
                btn.innerText = `搜尋更多店家中 (${allResults.length}筆)...`;
                
                // Google API 限制：必須等待 2 秒才能抓下一頁
                setTimeout(() => {
                    pagination.nextPage();
                }, 2000);
            } else {
                // 抓取完畢，開始處理
                processResults(userLoc, allResults, transportMode, maxTime);
            }
        } else if (allResults.length > 0) {
            // 如果這一次失敗但之前有抓到，就用之前的
            processResults(userLoc, allResults, transportMode, maxTime);
        } else {
            console.error("Places API Failed:", status);
            alert("附近找不到符合條件的店家，請放寬條件。");
            resetButtons();
        }
    });
}

// 處理搜尋結果：篩選星等 -> 計算距離 -> 排序
function processResults(origin, results, mode, maxTime, ) {
    const btn = document.querySelector('.search-btn');
    const userMaxCount = parseInt(document.getElementById('resultCount').value, 10);

    // 1. 初步過濾：評分 >= 3.5 且有評價
    let filtered = results.filter(p => p.rating && p.rating >= 3.5 && p.user_ratings_total > 0);
    
    // 2. 去除重複 (API 分頁有時會回傳重複項目)
    const uniqueIds = new Set();
    filtered = filtered.filter(p => {
        if(uniqueIds.has(p.place_id)) return false;
        uniqueIds.add(p.place_id);
        return true;
    });

    if (filtered.length === 0) {
        alert("附近沒有「3.5顆星以上」的符合店家。");
        resetButtons();
        return;
    }

    btn.innerText = `計算真實路程中 (共 ${filtered.length} 間)...`;

    // 3. 呼叫 Distance Matrix 計算真實時間
    // 為了避免超過 API 上限 (一次約 25 筆)，我們需要分批處理
    const batchSize = 25;
    const batches = [];
    for (let i = 0; i < filtered.length; i += batchSize) {
        batches.push(filtered.slice(i, i + batchSize));
    }

    // 使用 Promise.all 等待所有批次計算完成
    Promise.all(batches.map(batch => getDistances(origin, batch, mode)))
        .then(resultsArray => {
            // 合併所有批次結果
            let validPlaces = [].concat(...resultsArray);

            // 4. 過濾掉超時的店家
            validPlaces = validPlaces.filter(p => p.realDurationMins <= maxTime);

            if (validPlaces.length === 0) {
                alert(`在 ${maxTime} 分鐘範圍內，找不到 3.5 星以上的店家。`);
                resetButtons();
                return;
            }

            // 5. 最終排序：依照「星等」由高到低 (若星等相同，則評價數多的優先)
            validPlaces.sort((a, b) => {
                if (b.rating !== a.rating) return b.rating - a.rating;
                return b.user_ratings_total - a.user_ratings_total;
            });

            // 6. 依照使用者設定的數量截斷 (取前 N 名)
            places = validPlaces.slice(0, userMaxCount);

            // 繪製
            drawWheel();
            enableSpinButton(places.length);
        })
        .catch(err => {
            console.error(err);
            // 降級：若距離 API 失敗，直接顯示星等排序後的結果 (不含時間過濾)
            places = filtered.sort((a, b) => b.rating - a.rating).slice(0, userMaxCount);
            drawWheel();
            enableSpinButton(places.length);
            alert("路程計算發生錯誤，目前顯示直線搜尋結果。");
        });
}

// 封裝 Distance Matrix 請求
function getDistances(origin, destinations, mode) {
    return new Promise((resolve, reject) => {
        const service = new google.maps.DistanceMatrixService();
        const destLocs = destinations.map(d => d.geometry.location);

        service.getDistanceMatrix({
            origins: [origin],
            destinations: destLocs,
            travelMode: google.maps.TravelMode[mode],
            unitSystem: google.maps.UnitSystem.METRIC,
        }, (response, status) => {
            if (status === 'OK') {
                const elements = response.rows[0].elements;
                const processed = [];
                for (let i = 0; i < destinations.length; i++) {
                    const el = elements[i];
                    if (el.status === 'OK') {
                        let p = destinations[i];
                        p.realDistanceText = el.distance.text;
                        p.realDurationText = el.duration.text;
                        p.realDurationMins = Math.ceil(el.duration.value / 60);
                        processed.push(p);
                    }
                }
                resolve(processed);
            } else {
                // 如果失敗，回傳空陣列以免卡住其他批次
                console.warn("Batch Distance Failed:", status);
                resolve([]); 
            }
        });
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

window.onload = () => {
    autoSelectMealType();
};
