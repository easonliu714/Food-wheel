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

// 2. 獲取定位與搜尋店家
function fetchNearbyPlaces() {
    if (!navigator.geolocation) return alert("瀏覽器不支援定位");

    navigator.geolocation.getCurrentPosition(position => {
        const userLoc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        const service = new google.maps.places.PlacesService(document.createElement('div'));
        const type = document.getElementById('mealType').value;
        
        // 設定關鍵字
        const keywords = {
            breakfast: "早餐店",
            lunch: "餐廳",
            afternoon_tea: "飲料店 咖啡廳",
            dinner: "餐廳 晚餐",
            late_night: "宵夜 鹽酥雞"
        };

        const request = {
            location: userLoc,
            radius: '2000', // 2公里
            query: keywords[type]
        };

        service.textSearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                places = results.slice(0, 10); // 取前10筆避免輪盤太擠
                drawWheel();
            }
        });
    });
}

// 3. 繪製輪盤
function drawWheel() {
    const numOptions = places.length;
    if (numOptions === 0) return;
    const arcSize = (2 * Math.PI) / numOptions;

    places.forEach((place, i) => {
        const angle = i * arcSize;
        ctx.fillStyle = `hsl(${i * (360 / numOptions)}, 70%, 60%)`;
        ctx.beginPath();
        ctx.moveTo(200, 200);
        ctx.arc(200, 200, 200, angle, angle + arcSize);
        ctx.fill();

        // 寫字
        ctx.save();
        ctx.translate(200, 200);
        ctx.rotate(angle + arcSize / 2);
        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText(place.name.substring(0, 6), 70, 10);
        ctx.restore();
    });
}

// 4. 旋轉邏輯
document.getElementById('spinBtn').onclick = () => {
    if (places.length === 0) return alert("請先獲取店家名單");
    
    const spinAngle = Math.floor(Math.random() * 360) + 3600; // 旋轉至少10圈
    currentRotation += spinAngle;
    canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvas.style.transform = `rotate(${currentRotation}deg) `;

    // 計算結果
    setTimeout(() => {
        const actualRotation = currentRotation % 360;
        const arcSize = 360 / places.length;
        // 由於座標系與旋轉方向，需要計算索引
        const winningIndex = Math.floor((360 - (actualRotation % 360)) / arcSize) % places.length;
        const winner = places[winningIndex];

        document.getElementById('storeName').innerText = winner.name;
        document.getElementById('storeAddress').innerText = winner.formatted_address;
        const link = document.getElementById('menuLink');
        link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(winner.name)}&query_place_id=${winner.place_id}`;
        link.style.display = 'inline-block';
    }, 4000);
};

// 初始化
window.onload = () => {
    autoSelectMealType();
    fetchNearbyPlaces();
};
