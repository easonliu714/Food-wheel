// ================== ai_menu.js : Gemini AI 菜單處理 ==================
// Version: 2025-12-28-v2
// Tasks:
// 1. 轉盤半徑縮小避免遮擋
// 2. 增加上傳圖片預覽
// 3. 菜單明細可點擊編輯
// 4. 按下AI菜單按鈕預設載入舊資料

window.saveMenuData = function(placeId, menuItems) {
    if (!placeId || !menuItems) return;
    let allMenus = {};
    try {
        allMenus = JSON.parse(localStorage.getItem('food_wheel_menus')) || {};
    } catch(e) {}
    
    // 直接覆寫或合併？這裡採用覆寫目前類別，但為了簡單，直接更新整個店家菜單
    allMenus[placeId] = menuItems;
    localStorage.setItem('food_wheel_menus', JSON.stringify(allMenus));
};

window.openAiMenuSelector = function() {
    if (!window.currentStoreForMenu) return;
    
    // 檢查是否有存檔
    let allMenus = {};
    try { allMenus = JSON.parse(localStorage.getItem('food_wheel_menus')) || {}; } catch(e) {}
    const savedData = allMenus[window.currentStoreForMenu.place_id];

    document.getElementById('main-view').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'block';
    document.getElementById('menuStoreTitle').innerText = `菜單：${window.currentStoreForMenu.name}`;
    
    // 重置圖片預覽
    document.getElementById('maps-photo-grid').innerHTML = '';
    window.selectedPhotoDataList = [];

    // === 新邏輯：若有存檔，直接進入 Step 2 ===
    if (savedData && savedData.length > 0) {
        console.log("Loading saved menu data...");
        window.initAiMenuSystem(savedData);
    } else {
        // 無存檔，顯示上傳介面
        showUploadStep();
    }
};

window.showUploadStep = function() {
    document.getElementById('ai-step-1').style.display = 'block';
    document.getElementById('ai-step-2').style.display = 'none';
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('btnAnalyzeMenu').disabled = true;
    document.getElementById('btnAnalyzeMenu').style.opacity = '0.5';
    
    // 顯示「重新讀取」按鈕 (如果使用者是從 Step 2 按返回的)
    // 這裡簡化邏輯，如果是強制重新上傳，則不自動跳轉
};

window.closeMenuSystem = function() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
};

window.handleFileUpload = function(input) {
    if (input.files && input.files.length > 0) {
        window.selectedPhotoDataList = [];
        const grid = document.getElementById('maps-photo-grid');
        grid.innerHTML = ''; 
        
        let loadedCount = 0;
        Array.from(input.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                window.selectedPhotoDataList.push({
                    data: e.target.result,
                    mimeType: file.type
                });
                
                const div = document.createElement('div');
                div.className = 'photo-item selected';
                // 點擊預覽圖可開啟大圖
                div.innerHTML = `<img src="${e.target.result}" title="點擊查看原圖" onclick="window.open('${e.target.result}')">`;
                grid.appendChild(div);

                loadedCount++;
                if (loadedCount === input.files.length) {
                    const btn = document.getElementById('btnAnalyzeMenu');
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.innerText = `🤖 圖片已就緒 (${loadedCount}張)，開始 AI 解析`;
                }
            };
            reader.readAsDataURL(file);
        });
    }
};

window.analyzeSelectedPhotos = async function() {
    if (!window.selectedPhotoDataList || window.selectedPhotoDataList.length === 0) return;
    
    const geminiKey = localStorage.getItem('food_wheel_gemini_key');
    if (!geminiKey) return alert("請先在設定頁面輸入 Google Gemini API Key");

    const selectedModel = document.getElementById('geminiModelSelect').value || 'gemini-1.5-flash';
    document.getElementById('ai-loading').style.display = 'block';

    try {
        const contentsParts = [
            { text: "請分析以下菜單圖片，擷取所有菜色名稱與價格。請嚴格只回傳一個 JSON 陣列，格式為：[{\"category\": \"類別\", \"name\": \"菜名\", \"price\": 數字}], 若無類別則歸類為'主餐'。不要包含 Markdown 格式 (```json ... ```)。" }
        ];

        window.selectedPhotoDataList.forEach(photo => {
            const base64Data = photo.data.split(',')[1];
            contentsParts.push({
                inlineData: { mimeType: photo.mimeType, data: base64Data }
            });
        });

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${geminiKey}`;
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: contentsParts }] })
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content) {
            let text = data.candidates[0].content.parts[0].text;
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            
            // 嘗試修復常見 JSON 錯誤 (如結尾多餘逗號)
            try {
                const menuJson = JSON.parse(text);
                if (Array.isArray(menuJson) && menuJson.length > 0) {
                    window.saveMenuData(window.currentStoreForMenu.place_id, menuJson);
                    window.initAiMenuSystem(menuJson);
                } else {
                    throw new Error("解析結果為空或是格式不符");
                }
            } catch (jsonErr) {
                 console.error("JSON Parse Error", text);
                 throw new Error("AI 回傳格式無法讀取，請重試。");
            }
        } else {
            throw new Error("AI 回應格式錯誤或被阻擋");
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
    
    const spinBtn = document.getElementById('spinMenuBtn');
    if(spinBtn) spinBtn.onclick = window.spinMenu;
    
    // 如果有剛剛上傳的圖片，顯示在上方預覽
    const previewContainer = document.getElementById('menuImagesPreview');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        if (window.selectedPhotoDataList && window.selectedPhotoDataList.length > 0) {
            window.selectedPhotoDataList.forEach(photo => {
                const img = document.createElement('img');
                img.src = photo.data;
                img.onclick = () => window.open(photo.data);
                previewContainer.appendChild(img);
            });
            previewContainer.style.display = 'flex';
        } else {
            previewContainer.style.display = 'none';
        }
    }

    window.updateCartUI();
    window.updateMenuWheel();
    window.renderFullMenuTable();
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
    
    // === 修正：縮小半徑，避免遮擋按鈕 (200 -> 160) ===
    const radius = 160; 
    const centerX = 200;
    const centerY = 200;

    window.currentMenuData.forEach((item, i) => {
        const angle = startAngleOffset + (i * arcSize);
        if(window.menuCtx) {
            window.menuCtx.fillStyle = `hsl(${i * (360 / numOptions)}, 60%, 85%)`;
            window.menuCtx.beginPath();
            window.menuCtx.moveTo(centerX, centerY);
            window.menuCtx.arc(centerX, centerY, radius, angle, angle + arcSize);
            window.menuCtx.fill();
            window.menuCtx.stroke();

            window.menuCtx.save();
            window.menuCtx.translate(centerX, centerY);
            window.menuCtx.rotate(angle + arcSize / 2);
            let fontSize = 14; if (numOptions > 10) fontSize = 12;
            window.menuCtx.fillStyle = "#333";
            window.menuCtx.font = `bold ${fontSize}px Arial`;
            // 文字只顯示前幾個字
            let text = item.name; if (text.length > 6) text = text.substring(0, 5) + "..";
            // 調整文字位置，確保在半徑內
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

window.spinMenu = function() {
    if (!window.currentMenuData || window.currentMenuData.length === 0) return;
    
    const spinBtn = document.getElementById('spinMenuBtn');
    spinBtn.disabled = true;
    
    const spinAngle = Math.floor(Math.random() * 1800) + 1800; 
    window.menuRotation = (window.menuRotation || 0) + spinAngle;
    
    window.menuCanvas.style.transition = 'transform 3s cubic-bezier(0.15, 0, 0.15, 1)';
    window.menuCanvas.style.transform = `rotate(${window.menuRotation}deg)`;
    
    document.getElementById('dishName').innerText = "選菜中...";
    document.getElementById('dishPrice').innerText = "";
    document.getElementById('addToOrderBtn').style.display = 'none';

    setTimeout(() => {
        const numOptions = window.currentMenuData.length;
        const arcSize = 360 / numOptions;
        const actualRotation = window.menuRotation % 360;
        let winningIndex = Math.floor((360 - actualRotation) / arcSize) % numOptions;
        if (winningIndex < 0) winningIndex += numOptions;
        
        const winner = window.currentMenuData[winningIndex];
        
        document.getElementById('dishName').innerText = winner.name;
        document.getElementById('dishPrice').innerText = `$${winner.price}`;
        
        const addBtn = document.getElementById('addToOrderBtn');
        addBtn.style.display = 'inline-block';
        addBtn.onclick = () => window.addDishToCart(winner);
        
        spinBtn.disabled = false;
    }, 3000);
};

window.addDishToCart = function(dish) {
    window.shoppingCart.push(dish);
    window.updateCartUI();
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

// === 新增：菜單編輯功能 ===
window.editMenuItem = function(index, field) {
    const item = window.fullMenuData[index];
    const oldValue = item[field];
    const newValue = prompt(`修改 ${field === 'name' ? '菜名' : '價格'}：`, oldValue);
    
    if (newValue !== null && newValue !== oldValue) {
        if (field === 'price') {
            const price = parseInt(newValue);
            if (!isNaN(price)) item.price = price;
            else return alert("價格必須是數字");
        } else {
            item.name = newValue;
        }
        
        // 儲存並重新渲染
        window.saveMenuData(window.currentStoreForMenu.place_id, window.fullMenuData);
        window.renderFullMenuTable();
        window.updateMenuWheel(); // 同步更新轉盤
    }
};

window.renderFullMenuTable = function() {
    const container = document.getElementById('fullMenuContainer');
    if (!container) return;
    
    let html = `<p style="font-size:0.8rem; color:#666; text-align:center;">(點擊菜名或價格可修改)</p>
    <table class="menu-table"><thead><tr><th>類別</th><th>名稱</th><th>價格</th><th>操作</th></tr></thead><tbody>`;
    
    // 為了讓 index 對應正確，這裡不排序，或者需要紀錄原始 index
    // 這裡直接使用 window.fullMenuData 的順序
    
    window.fullMenuData.forEach((item, idx) => {
        html += `<tr>
            <td>${item.category || '主餐'}</td>
            <td onclick="editMenuItem(${idx}, 'name')" style="cursor:pointer; text-decoration:underline dashed; text-underline-offset:4px;">${item.name}</td>
            <td onclick="editMenuItem(${idx}, 'price')" style="cursor:pointer;">$${item.price}</td>
            <td><button class="small-btn" onclick='window.addDishToCart(window.fullMenuData[${idx}])'>➕</button></td>
        </tr>`;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
};
