// ... initLocation ...

window.handleSearch = function() {
    if (typeof google === 'undefined' || !google.maps) return alert("API 尚未載入");
    const addrInput = document.getElementById('currentAddress');
    const keywordsRaw = document.getElementById('keywordInput').value;
    
    if (!addrInput.value) return alert("請輸入地址");
    if (!keywordsRaw.trim()) return alert("請輸入關鍵字");

    window.resetGame(false); 
    const spinBtn = document.getElementById('spinBtn');
    if(spinBtn) { spinBtn.disabled = true; spinBtn.innerText = "資料載入中..."; }
    
    const searchBtn = document.querySelector('.search-btn');
    searchBtn.innerText = "🔍 解析地址中...";
    searchBtn.disabled = true;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: addrInput.value }, (results, status) => {
        if (status === "OK" && results[0]) {
            window.userCoordinates = results[0].geometry.location;
            
            // [NEW] 統一地址格式
            // 取得標準格式地址
            const formattedAddress = results[0].formatted_address;
            // 更新輸入框 (讓它跟下方顯示的一致)
            // 這裡做個簡單處理：把 "台灣" 和 郵遞區號拿掉，讓它簡潔一點，並同步到輸入框
            const simplifiedAddress = formattedAddress.replace(/^\d+\s*/, '').replace(/^台灣/, '');
            
            addrInput.value = simplifiedAddress; // Sync input
            
            const detailDisplay = document.getElementById('detailedAddressDisplay');
            if (detailDisplay) { 
                detailDisplay.style.display = 'block'; 
                // 下方顯示完整地址 (包含行政區等)
                detailDisplay.innerText = `🎯 已定位至：${formattedAddress}`; 
            }
            
            window.startSearch(window.userCoordinates, keywordsRaw);
        } else {
            alert("無法解析此地址");
            searchBtn.innerText = "🔄 開始搜尋店家";
            searchBtn.disabled = false;
        }
    });
};

// ... startSearch, fetchPlacesWithPagination, processResults, getDistances 保持不變 ...
