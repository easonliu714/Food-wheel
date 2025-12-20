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

// 2. 獲取定位與搜尋店家 (含翻頁邏輯)
function fetchNearbyPlaces() {
    if (!navigator.geolocation) return alert("瀏覽器不支援定位");

    // 取得使用者設定
    const radius = document.getElementById('searchRadius').value;
    const maxCount = parseInt(document.getElementById('resultCount').value, 10);
    const type = document.getElementById('mealType').value;
    const btn = document.querySelector('.search-btn');

    btn.innerText = "搜尋中...";
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(position => {
        const userLoc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        const service = new google.maps.places.PlacesService(document.createElement('div'));
        
        const keywords = {
            breakfast: "早餐店",
            lunch: "餐廳",
            afternoon_tea: "飲料店 咖啡廳",
            dinner: "餐廳 晚餐",
            late_night: "宵夜 鹽酥雞"
        };

        const request = {
            location: userLoc,
            radius: radius,
            query: keywords[type]
        };

        places = []; // 清空舊資料

        // 使用遞迴處理分頁 (若需要超過20筆)
        service.textSearch(request, (results, status, pagination) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                places = places.concat(results);

                // 如果數量還不夠，且還有下一頁，就繼續抓
                if (places.length < maxCount && pagination && pagination.hasNextPage) {
                    // Google API 規定要等 2 秒才能抓下一頁
                    setTimeout(() => {
                        pagination.nextPage();
                    }, 2000);
                } else {
                    // 抓取結束或已達標
                    finalizeFetch(maxCount);
                }
            } else {
                alert("附近找不到店家，請嘗試擴大距離！");
                btn.innerText = "🔄 搜尋附近店家";
                btn.disabled = false;
            }
        });
    }, () => {
        alert("無法取得定位，請確認瀏覽器權限");
        btn.innerText = "🔄 搜尋附近店家";
        btn.disabled = false;
    });
}

// 處理抓取完成後的動作
function finalizeFetch(maxCount) {
    // 截斷到使用者設定的數量
    places = places.slice(0, maxCount);
    
    document.querySelector('.search-btn').innerText = `搜尋完成 (共 ${places.length} 間)`;
    document.querySelector('.search-btn').disabled = false;
    document.getElementById('storeName').innerText = "點擊輪盤開始抉擇";
    document.getElementById('storeAddress').innerText = "";
    document.getElementById('menuLink').style.display = "none";
    
    drawWheel();
}

// 3. 繪製輪盤
function drawWheel() {
    const numOptions = places.length;
    if (numOptions === 0) return;
    const arcSize = (2 * Math.PI) / numOptions;

    // 清除畫布
    ctx.clearRect(0, 0, 400, 400);

    places.forEach((place, i) => {
        const angle = i * arcSize;
        
        // 繪製扇形
        ctx.fillStyle = `hsl(${i * (360 / numOptions)}, 70%, 60%)`;
        ctx.beginPath();
        ctx.moveTo(200, 200);
        ctx.arc(200, 200, 200, angle, angle + arcSize);
        ctx.fill();
        ctx.stroke(); // 加個邊框比較清楚

        // 寫字 (自動調整字體大小)
        ctx.save();
        ctx.translate(200, 200);
        ctx.rotate(angle + arcSize / 2);
        
        // 數量越多字越小
        let fontSize = 16;
        if (numOptions > 20) fontSize = 12;
        if (numOptions > 30) fontSize = 10;
        
        ctx.fillStyle = "white";
        ctx.font = `bold ${fontSize}px Arial`;
        
        // 簡單截斷過長的店名
        let text = place.name;
        if (text.length > 8) text = text.substring(0, 7) + "..";
        ctx.fillText(text, 60, 5); // 稍微調整文字位置
        ctx.restore();
    });
}

// 4. 旋轉邏輯
document.getElementById('spinBtn').onclick = () => {
    if (places.length === 0) return alert("請先獲取店家名單");
    
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.disabled = true; // 旋轉中禁止連點

    // 隨機旋轉 5 ~ 10 圈 (1800 ~ 3600 度) + 隨機角度
    const spinAngle = Math.floor(Math.random() * 1800) + 1800; 
    currentRotation += spinAngle;
    
    canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvas.style.transform = `rotate(${currentRotation}deg)`;

    // 計算結果
    setTimeout(() => {
        const numOptions = places.length;
        const arcSize = 360 / numOptions;
        
        // --- 關鍵修正 ---
        // 輪盤是順時針旋轉 (角度增加)
        // 指針固定在上方 (270度 或 -90度 位置)
        // 我們要計算「旋轉停止後，哪一個扇形剛好停在 270度 的位置」
        // 公式：(270 - (目前總旋轉角度 % 360) + 360) % 360
        const resultAngle = (270 - (currentRotation % 360) + 360) % 360;
        const winningIndex = Math.floor(resultAngle / arcSize);
        
        const winner = places[winningIndex];

        // 顯示結果
        document.getElementById('storeName').innerText = "就決定吃：" + winner.name;
        document.getElementById('storeAddress').innerText = winner.formatted_address || "地址載入中...";
        const link = document.getElementById('menuLink');
        
        // 修正連結格式
        link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(winner.name)}&query_place_id=${winner.place_id}`;
        link.style.display = 'inline-block';
        link.innerText = "📍 導航去這家";
        
        spinBtn.disabled = false;
    }, 4000); // 配合 CSS transition 時間
};

// 初始化
window.onload = () => {
    autoSelectMealType();
    // 預設不自動抓取，讓使用者確認設定後再點按鈕，體驗較好
    // fetchNearbyPlaces(); 
};
