let places = [];
let currentRotation = 0;
let userCoordinates = null; // 儲存目前的搜尋中心座標
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

// 2. 初始化定位 (網頁載入時執行)
function initLocation() {
    if (typeof google === 'undefined') return; // API 尚未載入
    const addrInput = document.getElementById('currentAddress');
    addrInput.value = "定位中...";

    if (!navigator.geolocation) {
        alert("不支援定位");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userCoordinates = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            // 反查地址顯示給使用者看
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: userCoordinates }, (results, status) => {
                if (status === "OK" && results[0]) {
                    // 簡化地址顯示 (去除郵遞區號與國家)
                    let formatted = results[0].formatted_address;
                    formatted = formatted.replace(/^\d+\s*/, '').replace(/^台灣/, ''); 
                    addrInput.value = formatted;
                } else {
                    addrInput.value = `${userCoordinates.lat.toFixed(4)}, ${userCoordinates.lng.toFixed(4)}`;
                }
            });
        },
        (error) => {
            console.error(error);
            addrInput.value = "無法取得定位，請手動輸入地址";
        },
        { enableHighAccuracy: true }
    );
}

// 3. 處理搜尋點擊 (先確認地址是否被修改)
function handleSearch() {
    const addrInput = document.getElementById('currentAddress').value;
    
    if (!addrInput) return alert("請輸入地址或按下「重抓」定位");

    const btn = document.querySelector('.search-btn');
    btn.innerText = "解析地址中...";
    btn.disabled = true;

    // 將地址轉為座標
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: addrInput }, (results, status) => {
        if (status === "OK" && results[0]) {
            userCoordinates = results[0].geometry.location; // 更新座標
            startSearch(userCoordinates); // 開始搜尋店家
        } else {
            alert("找不到此地址，請檢查輸入內容");
            btn.innerText = "🔄 搜尋附近店家";
            btn.disabled = false;
        }
    });
}

// 4. 搜尋店家 (優化關鍵字與半徑)
function startSearch(location) {
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    const type = document.getElementById('mealType').value;
    const transportMode = document.getElementById('transportMode').value;
    const maxTime = parseInt(document.getElementById('maxTime').value, 10);
    
    // 【關鍵字大修】使用 OR 語法，並簡化關鍵字，讓 Google 模糊搜尋發揮作用
    const keywords = {
        breakfast: "早餐 OR 早午餐",
        lunch: "餐廳 OR 小吃 OR 午餐",
        afternoon_tea: "飲料 OR 甜點 OR 咖啡", // 簡化：飲料包含手搖，甜點包含蛋糕豆花
        dinner: "餐廳 OR 晚餐 OR 火鍋",
        late_night: "宵夜 OR 鹽酥雞 OR 炸物",
        
        noodles_rice: "麵 OR 飯 OR 水餃 OR 壽司", 
        western_steak: "牛排 OR 義大利麵 OR 漢堡 OR 披薩",
        dessert: "冰品 OR 豆花 OR 甜點",
        all: "美食" // 最廣泛的搜尋
    };

    // 【半徑策略】直接設定 2000 公尺 (2公里)，確保抓到足夠的店
    // 讓後續的 Distance Matrix 去負責過濾太遠的店，而不是一開始就過濾掉
    const searchRadius = 2000; 

    const request = {
        location: location,
        radius: searchRadius,
        query: keywords[type] || "餐廳"
    };

    let allResults = [];
    
    // 顯示狀態
    const btn = document.querySelector('.search-btn');
    btn.innerText = "搜尋店家中...";

    service.textSearch(request, (results, status, pagination) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            allResults = allResults.concat(results);
            
            // 抓取多頁 (最多 60 筆)
            if (pagination && pagination.hasNextPage && allResults.length < 60) {
                btn.innerText = `搜尋更多...(${allResults.length}筆)`;
                setTimeout(() => pagination.nextPage(), 2000);
            } else {
                processResults(location, allResults, transportMode, maxTime);
            }
        } else if (allResults.length > 0) {
            processResults(location, allResults, transportMode, maxTime);
        } else {
            console.error("API Error:", status);
            alert("附近找不到符合的店家，請嘗試更換關鍵字或地址。");
            resetButtons();
        }
    });
}

// 5. 過濾與排序
function processResults(origin, results, mode, maxTime) {
    const btn = document.querySelector('.search-btn');
    const userMaxCount = parseInt(document.getElementById('resultCount').value, 10);

    // 初步過濾：評分 3.5 以上 (若您覺得太嚴格，可以改成 3.0 或 0)
    let filtered = results.filter(p => p.rating && p.rating >= 3.5 && p.user_ratings_total > 0);
    
    // 去除重複
    const uniqueIds = new Set();
    filtered = filtered.filter(p => {
        if(uniqueIds.has(p.place_id)) return false;
        uniqueIds.add(p.place_id);
        return true;
    });

    if (filtered.length === 0) {
        alert("附近沒有 3.5 星以上的符合店家。");
        resetButtons();
        return;
    }

    btn.innerText = `計算路程時間 (共 ${filtered.length} 間)...`;

    // 分批計算距離
    const batchSize = 25;
    const batches = [];
    for (let i = 0; i < filtered.length; i += batchSize) {
        batches.push(filtered.slice(i, i + batchSize));
    }

    Promise.all(batches.map(batch => getDistances(origin, batch, mode)))
        .then(resultsArray => {
            let validPlaces = [].concat(...resultsArray);

            // 過濾超時店家
            validPlaces = validPlaces.filter(p => p.realDurationMins <= maxTime);

            if (validPlaces.length === 0) {
                alert(`在 ${maxTime} 分鐘範圍內找不到符合條件的店家。\n(已搜尋半徑 2公里內的店家，但走路時間都超過設定值)`);
                resetButtons();
                return;
            }

            // 排序：距離優先 (Google Maps 風格) 或是 評分優先？
            // 這裡混合權重：評分高且距離近的排前面 (簡單做法：先按評分排)
            validPlaces.sort((a, b) => b.rating - a.rating);

            places = validPlaces.slice(0, userMaxCount);
            drawWheel();
            enableSpinButton(places.length);
        })
        .catch(err => {
            console.error(err);
            places = filtered.slice(0, userMaxCount);
            drawWheel();
            enableSpinButton(places.length);
            alert("路程計算失敗，改為顯示直線距離結果。");
        });
}

// Distance Matrix
function getDistances(origin, destinations, mode) {
    return new Promise((resolve, reject) => {
        const service = new google.maps.DistanceMatrixService();
        // 如果 origin 是 Google LatLng 物件，直接用；如果是 {lat, lng} 也可以
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
                resolve([]); 
            }
        });
    });
}

// UI Reset
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
    document.getElementById('storeRating').innerText = "";
    document.getElementById('storeAddress').innerText = "";
    document.getElementById('storeDistance').innerText = "";
    document.getElementById('menuLink').style.display = "none";
}

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
        if (document.getElementById('storeRating')) {
            if (winner.rating) {
                document.getElementById('storeRating').innerText = `⭐ ${winner.rating} (${winner.user_ratings_total || 0} 則評價)`;
            } else {
                document.getElementById('storeRating').innerText = "暫無評價資料";
            }
        }
        document.getElementById('storeAddress').innerText = winner.formatted_address;
        if (winner.realDurationText) {
             document.getElementById('storeDistance').innerText = 
                `⏱️ 預估耗時：${winner.realDurationText} (${winner.realDistanceText})`;
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
    initLocation(); // 初始化定位
};
