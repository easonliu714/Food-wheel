// ================== ai_menu.js : Gemini AI 菜單處理 ==================

window.openAiMenuSelector = function() {
    if (!window.currentStoreForMenu) return;
    document.getElementById('main-view').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'block';
    document.getElementById('menuStoreTitle').innerText = `菜單：${window.currentStoreForMenu.name}`;
    
    document.getElementById('ai-step-1').style.display = 'block';
    document.getElementById('ai-step-2').style.display = 'none';
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('btnAnalyzeMenu').disabled = true;
    document.getElementById('btnAnalyzeMenu').style.opacity = '0.5';
    window.selectedPhotoData = null;

    const grid = document.getElementById('maps-photo-grid');
    grid.innerHTML = '';
    
    if (window.currentStoreForMenu.photos && window.currentStoreForMenu.photos.length > 0) {
        window.currentStoreForMenu.photos.slice(0, 10).forEach((photo) => {
            const imgUrl = photo.getUrl({ maxWidth: 200, maxHeight: 200 });
            const div = document.createElement('div');
            div.className = 'photo-item';
            div.innerHTML = `<img src="${imgUrl}">`;
            div.onclick = () => alert("由於瀏覽器安全限制 (CORS)，無法直接分析 Google Maps 圖片。\n請使用「上傳/拍攝」按鈕上傳菜單截圖。");
            grid.appendChild(div);
        });
    } else {
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center;">此店家沒有提供 Google Maps 照片。</p>';
    }
};

window.closeMenuSystem = function() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
};

window.handleFileUpload = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            window.selectedPhotoData = e.target.result;
            const grid = document.getElementById('maps-photo-grid');
            grid.innerHTML = `<div class="photo-item selected" style="grid-column:1/-1; width:200px; margin:0 auto;"><img src="${window.selectedPhotoData}"></div>`;
            const btn = document.getElementById('btnAnalyzeMenu');
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerText = "🤖 圖片已就緒，開始 AI 解析";
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.analyzeSelectedPhotos = async function() {
    if (!window.selectedPhotoData) return;
    
    const geminiKey = localStorage.getItem('food_wheel_gemini_key');
    if (!geminiKey) return alert("請先在設定頁面輸入 Google Gemini API Key");

    // 讀取使用者選擇的模型，若無則預設 flash
    const selectedModel = document.getElementById('geminiModelSelect').value || 'gemini-1.5-flash';

    document.getElementById('ai-loading').style.display = 'block';

    try {
        const base64Data = window.selectedPhotoData.split(',')[1];
        const mimeType = window.selectedPhotoData.split(';')[0].split(':')[1];
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${geminiKey}`;
        
        const requestBody = {
            contents: [{
                parts: [
                    { text: "請分析這張圖片，擷取菜色名稱與價格。請嚴格只回傳一個 JSON 陣列：[{\"category\": \"類別\", \"name\": \"菜名\", \"price\": 數字}], 若無類別則歸類為'主餐'。不要包含 Markdown。" },
                    { inlineData: { mimeType: mimeType, data: base64Data } }
                ]
            }]
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content) {
            let text = data.candidates[0].content.parts[0].text;
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const menuJson = JSON.parse(text);
            if (Array.isArray(menuJson) && menuJson.length > 0) {
                window.initAiMenuSystem(menuJson);
            } else {
                alert("AI 無法辨識菜單資料。");
                document.getElementById('ai-loading').style.display = 'none';
            }
        } else {
            throw new Error("AI 回應格式錯誤");
        }
    } catch (e) {
        console.error(e);
        alert("AI 解析失敗: " + e.message);
        document.getElementById('ai-loading').style.display = 'none';
    }
};

window.initAiMenuSystem = function(menuData) {
    window.fullMenuData = menuData;
    window.shoppingCart = [];
    
    const categories = [...new Set(menuData.map(item => item.category || '主餐'))];
    const catSelect = document.getElementById('menuCategorySelect');
    catSelect.innerHTML = "";
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        catSelect.appendChild(opt);
    });

    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('ai-step-1').style.display = 'none';
    document.getElementById('ai-step-2').style.display = 'block';
    
    window.updateCartUI();
    window.updateMenuWheel();
};

window.updateMenuWheel = function() {
    const cat = document.getElementById('menuCategorySelect').value;
    window.currentMenuData = window.fullMenuData.filter(item => (item.category || '主餐') === cat);
    window.drawMenuWheel();
};

window.drawMenuWheel = function() {
    const numOptions = window.currentMenuData.length;
    if(window.menuCtx) window.menuCtx.clearRect(0, 0, 400, 400);
    if (numOptions === 0) return;
    
    const arcSize = (2 * Math.PI) / numOptions;
    const startAngleOffset = -Math.PI / 2;

    window.currentMenuData.forEach((item, i) => {
        const angle = startAngleOffset + (i * arcSize);
        if(window.menuCtx) {
            window.menuCtx.fillStyle = `hsl(${i * (360 / numOptions)}, 60%, 85%)`;
            window.menuCtx.beginPath();
            window.menuCtx.moveTo(200, 200);
            window.menuCtx.arc(200, 200, 200, angle, angle + arcSize);
            window.menuCtx.fill();
            window.menuCtx.stroke();

            window.menuCtx.save();
            window.menuCtx.translate(200, 200);
            window.menuCtx.rotate(angle + arcSize / 2);
            let fontSize = 14; if (numOptions > 10) fontSize = 12;
            window.menuCtx.fillStyle = "#333";
            window.menuCtx.font = `bold ${fontSize}px Arial`;
            let text = item.name; if (text.length > 6) text = text.substring(0, 5) + "..";
            window.menuCtx.fillText(text, 60, 5);
            window.menuCtx.restore();
        }
    });
    
    window.menuRotation = 0;
    window.menuCanvas.style.transform = `rotate(0deg)`;
    window.menuCanvas.style.transition = 'none';
    
    document.getElementById('dishName').innerText = "準備選菜...";
    document.getElementById('dishPrice').innerText = "";
    document.getElementById('addToOrderBtn').style.display = 'none';
};

window.addDishToCart = function(dish) {
    if(!dish) dish = window.currentMenuData[0]; 
    window.shoppingCart.push(dish);
    window.updateCartUI();
    document.getElementById('addToOrderBtn').style.display = 'none';
};

window.updateCartUI = function() {
    const list = document.getElementById('cartList');
    list.innerHTML = "";
    let total = 0;
    window.shoppingCart.forEach((item, index) => {
        total += item.price;
        const li = document.createElement('li');
        li.innerHTML = `<span>${item.name}</span> <span>$${item.price} <button onclick="removeCartItem(${index})" style="background:none;border:none;cursor:pointer;color:#c0392b;">❌</button></span>`;
        list.appendChild(li);
    });
    document.getElementById('cartTotalDisplay').innerText = `$${total}`;
};

window.removeCartItem = function(index) {
    window.shoppingCart.splice(index, 1);
    window.updateCartUI();
};

window.checkout = function() {
    if (window.shoppingCart.length === 0) return alert("購物車是空的！");
    let total = 0;
    let msg = `🧾 【${window.currentStoreForMenu.name}】 點餐明細\n------------------\n`;
    window.shoppingCart.forEach(item => {
        msg += `${item.name} ... $${item.price}\n`;
        total += item.price;
    });
    msg += `------------------\n總計：$${total}`;
    alert(msg);
};
