// ================== ai_menu.js : Gemini AI 菜單處理 ==================

// 儲存菜單資料到 LocalStorage
window.saveMenuData = function(placeId, menuItems) {
    if (!placeId || !menuItems) return;
    let allMenus = {};
    try {
        allMenus = JSON.parse(localStorage.getItem('food_wheel_menus')) || {};
    } catch(e) {}
    
    // 如果已有該商家的菜單，則進行合併 (避免重複)
    if (allMenus[placeId]) {
        const existingNames = new Set(allMenus[placeId].map(i => i.name));
        menuItems.forEach(item => {
            if (!existingNames.has(item.name)) {
                allMenus[placeId].push(item);
            }
        });
    } else {
        allMenus[placeId] = menuItems;
    }
    
    localStorage.setItem('food_wheel_menus', JSON.stringify(allMenus));
};

window.loadSavedMenu = function() {
    if (!window.currentStoreForMenu) return;
    const placeId = window.currentStoreForMenu.place_id;
    let allMenus = {};
    try {
        allMenus = JSON.parse(localStorage.getItem('food_wheel_menus')) || {};
    } catch(e) {}

    if (allMenus[placeId] && allMenus[placeId].length > 0) {
        if(confirm(`發現此店家 (${window.currentStoreForMenu.name}) 有 ${allMenus[placeId].length} 道已儲存的菜色。\n是否直接載入？`)) {
            window.initAiMenuSystem(allMenus[placeId]);
        }
    } else {
        alert("此店家尚無儲存的菜單資料，請先上傳圖片解析。");
    }
};

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
    window.selectedPhotoDataList = []; // 改為陣列，支援多圖

    const grid = document.getElementById('maps-photo-grid');
    grid.innerHTML = '';
    
    // 檢查是否有歷史存檔，顯示按鈕
    const loadBtn = document.getElementById('btnLoadSavedMenu');
    if(loadBtn) loadBtn.style.display = 'inline-block';
};

window.closeMenuSystem = function() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
};

window.handleFileUpload = function(input) {
    if (input.files && input.files.length > 0) {
        window.selectedPhotoDataList = []; // 重置
        const grid = document.getElementById('maps-photo-grid');
        grid.innerHTML = ''; // 清空預覽
        
        let loadedCount = 0;
        Array.from(input.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                window.selectedPhotoDataList.push({
                    data: e.target.result,
                    mimeType: file.type
                });
                
                // 顯示預覽圖
                const div = document.createElement('div');
                div.className = 'photo-item selected';
                div.innerHTML = `<img src="${e.target.result}">`;
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
        // 構建 Prompt
        const contentsParts = [
            { text: "請分析以下菜單圖片，擷取所有菜色名稱與價格。請嚴格只回傳一個 JSON 陣列，格式為：[{\"category\": \"類別\", \"name\": \"菜名\", \"price\": 數字}], 若無類別則歸類為'主餐'。不要包含 Markdown 格式 (```json ... ```)。" }
        ];

        // 加入所有圖片
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
            // 清理 Markdown
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const menuJson = JSON.parse(text);
            
            if (Array.isArray(menuJson) && menuJson.length > 0) {
                // 儲存並初始化
                window.saveMenuData(window.currentStoreForMenu.place_id, menuJson);
                window.initAiMenuSystem(menuJson);
            } else {
                alert("AI 無法辨識菜單資料，或回傳格式錯誤。");
                document.getElementById('ai-loading').style.display = 'none';
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
    // 重新讀取 (確保包含舊資料)
    let allMenus = {};
    try { allMenus = JSON.parse(localStorage.getItem('food_wheel_menus')) || {}; } catch(e) {}
    // 如果是讀取存檔，傳入的 menuData 就是完整的；如果是剛解析的，可能是部分。
    // 這裡簡單起見，直接使用傳入的 menuData (因為解析成功後已存檔並呼叫)
    
    // 如果是剛解析完，嘗試讀取完整存檔以獲得累加效果
    if (window.currentStoreForMenu && allMenus[window.currentStoreForMenu.place_id]) {
        window.fullMenuData = allMenus[window.currentStoreForMenu.place_id];
    } else {
        window.fullMenuData = menuData;
    }
    
    window.shoppingCart = [];
    
    const categories = [...new Set(window.fullMenuData.map(item => item.category || '主餐'))];
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
    
    // 綁定轉盤按鈕事件 (修復按鈕無反應問題)
    const spinBtn = document.getElementById('spinMenuBtn');
    if(spinBtn) spinBtn.onclick = window.spinMenu;
    
    window.updateCartUI();
    window.updateMenuWheel();
    window.renderFullMenuTable(); // 渲染完整表格
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

// 菜單轉盤邏輯
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

// 渲染完整菜單表格
window.renderFullMenuTable = function() {
    const container = document.getElementById('fullMenuContainer');
    if (!container) return;
    
    let html = `<table class="menu-table"><thead><tr><th>類別</th><th>名稱</th><th>價格</th><th>操作</th></tr></thead><tbody>`;
    
    // 依類別排序
    const sortedData = [...window.fullMenuData].sort((a,b) => (a.category || "").localeCompare(b.category || ""));
    
    sortedData.forEach((item, idx) => {
        html += `<tr>
            <td>${item.category || '主餐'}</td>
            <td>${item.name}</td>
            <td>$${item.price}</td>
            <td><button class="small-btn" onclick='window.addDishToCart(${JSON.stringify(item)})'>➕</button></td>
        </tr>`;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
};
