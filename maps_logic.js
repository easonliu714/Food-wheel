// ================== maps_logic.js ==================

window.initLocation = function() {
    if (typeof google === 'undefined') { console.warn("Maps API not loaded"); return; }
    const addrInput = document.getElementById('currentAddress');
    if(addrInput) addrInput.value = "定位中...";

    if (!navigator.geolocation) return alert("瀏覽器不支援定位");

    navigator.geolocation.getCurrentPosition(
        (position) => {
            window.userCoordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: window.userCoordinates }, (results, status) => {
                if (status === "OK" && results[0]) {
                    if(addrInput) addrInput.value = results[0].formatted_address.replace(/^\d+\s*/, '').replace(/^台灣/, '');
                } else {
                    if(addrInput) addrInput.value = `${window.userCoordinates.lat.toFixed(5)}, ${window.userCoordinates.lng.toFixed(5)}`;
                }
            });
        },
        (error) => { if(addrInput) { addrInput.value = ""; addrInput.placeholder = "無法定位，請手動輸入"; } },
        { enableHighAccuracy: true }
    );
};

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
            
            // 地址同步邏輯
            const formattedAddress = results[0].formatted_address;
            const simplifiedAddress = formattedAddress.replace(/^\d+\s*/, '').replace(/^台灣/, '');
            
            addrInput.value = simplifiedAddress; // Sync input
            
            const detailDisplay = document.getElementById('detailedAddressDisplay');
            if (detailDisplay) { 
                detailDisplay.style.display = 'block'; 
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

window.startSearch = function(location, keywordsRaw) {
    const btn = document.querySelector('.search-btn');
    btn.innerText = "☁️ 搜尋周邊店家...";

    const service = new google.maps.places.PlacesService(document.createElement('div'));
    const priceLevel = parseInt(document.getElementById('priceLevel').value, 10);
    const transportMode = document.getElementById('transportMode').value;
    const maxTime = parseInt(document.getElementById('maxTime').value, 10);
    const searchMode = document.getElementById('searchMode').value;
    
    const splitKeywords = keywordsRaw.split(/\s+/).filter(k => k.length > 0);
    let searchQueries = [...splitKeywords];
    if (splitKeywords.length > 1) searchQueries.push(keywordsRaw);

    let speedMetersPerMin = (transportMode === 'DRIVING') ? 1000 : 333.33;
    const maxTheoreticalRadius = speedMetersPerMin * maxTime;
    const maxLinearDist = maxTheoreticalRadius * 1.5;

    let promises = [];
    if (searchMode === 'nearby') {
        searchQueries.forEach(keyword => {
            let request = { location: location, rankBy: google.maps.places.RankBy.DISTANCE, keyword: keyword };
            if (priceLevel !== -1) request.maxPrice = priceLevel;
            promises.push(window.fetchPlacesWithPagination(service, request, 3));
        });
    } else {
        let steps = [];
        for (let t = 5; t <= maxTime; t += 5) steps.push(t);
        if (maxTime % 5 !== 0) steps.push(maxTime);
        steps = [...new Set(steps)].sort((a,b)=>a-b);
        searchQueries.forEach(keyword => {
            steps.forEach(stepTime => {
                let stepRadius = stepTime * speedMetersPerMin;
                if (stepRadius < 500) stepRadius = 500; 
                let request = { location: location, radius: stepRadius, rankBy: google.maps.places.RankBy.PROMINENCE, keyword: keyword };
                if (priceLevel !== -1) request.maxPrice = priceLevel;
                promises.push(window.fetchPlacesWithPagination(service, request, 3));
            });
        });
    }

    Promise.all(promises).then(resultsArray => {
        let combinedResults = [].concat(...resultsArray);
        if (combinedResults.length === 0) {
            alert("API 回傳 0 筆資料");
            btn.innerText = "🔄 開始搜尋店家";
            btn.disabled = false;
            return;
        }
        window.processResults(location, combinedResults, maxLinearDist);
    }).catch(err => {
        console.error(err);
        alert("搜尋錯誤: " + err);
        btn.innerText = "🔄 開始搜尋店家";
        btn.disabled = false;
    });
};

window.fetchPlacesWithPagination = function(service, request, maxPages = 3) {
    return new Promise((resolve) => {
        let allResults = [];
        let pageCount = 0;
        service.nearbySearch(request, (results, status, pagination) => {
            if ((status === google.maps.places.PlacesServiceStatus.OK || status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) && results) {
                allResults = allResults.concat(results);
                pageCount++;
                if (pagination && pagination.hasNextPage && pageCount < maxPages && allResults.length < (maxPages * 20)) {
                    setTimeout(() => { pagination.nextPage(); }, 2000);
                } else {
                    resolve(allResults);
                }
            } else {
                resolve(allResults);
            }
        });
    });
};

window.processResults = function(origin, results, maxLinearDist) {
    const btn = document.querySelector('.search-btn');
    const userMaxCount = parseInt(document.getElementById('resultCount').value, 10);
    const transportMode = document.getElementById('transportMode').value;
    const maxTime = parseInt(document.getElementById('maxTime').value, 10);
    const searchMode = document.getElementById('searchMode').value;

    const uniqueIds = new Set();
    let filtered = [];
    results.forEach(p => {
        if (!uniqueIds.has(p.place_id)) {
            uniqueIds.add(p.place_id);
            const loc = p.geometry.location;
            const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(origin, loc);
            if (distanceMeters <= maxLinearDist) {
                p.geometryDistance = distanceMeters;
                filtered.push(p);
            }
        }
    });

    if (filtered.length === 0) {
        alert("無符合店家");
        btn.innerText = "🔄 開始搜尋店家";
        btn.disabled = false;
        return;
    }

    btn.innerText = `🚚 計算 ${Math.min(filtered.length, 60)} 筆路程中...`;

    // 截斷
    if (searchMode === 'nearby') filtered.sort((a, b) => a.geometryDistance - b.geometryDistance);
    if (filtered.length > 60) filtered = filtered.slice(0, 60);

    // 批次計算距離
    const batchSize = 25;
    const batches = [];
    for (let i = 0; i < filtered.length; i += batchSize) {
        batches.push(filtered.slice(i, i + batchSize));
    }

    Promise.all(batches.map(batch => window.getDistances(origin, batch, transportMode)))
        .then(resultsArray => {
            let validPlaces = [].concat(...resultsArray);
            validPlaces = validPlaces.filter(p => p.realDurationMins <= maxTime);

            if (validPlaces.length === 0) {
                alert("所有店家路程皆超時");
                btn.innerText = "🔄 開始搜尋店家";
                btn.disabled = false;
                return;
            }
            if (searchMode === 'nearby') validPlaces.sort((a, b) => a.realDurationMins - b.realDurationMins);
            
            window.allSearchResults = validPlaces.slice(0, userMaxCount); 
            window.eliminatedIds.clear(); 
            window.hitCounts = {};
            window.allSearchResults.forEach(p => window.hitCounts[p.place_id] = 0);

            if (typeof window.refreshWheelData === 'function') {
                window.refreshWheelData();
                btn.innerText = `搜尋完成 (共 ${window.places.length} 間)`;
                btn.disabled = false;
            } else {
                console.error("Critical: refreshWheelData not found!");
                alert("系統錯誤：UI 模組未載入");
                btn.disabled = false;
            }
        })
        .catch(err => {
            console.error("Distance Matrix Error:", err);
            if (confirm(`路程計算失敗 (${err})。\n是否使用「直線距離」顯示結果？`)) {
                let fallbackPlaces = filtered.map(p => {
                    let speed = (transportMode === 'DRIVING') ? 600 : 80;
                    p.realDurationMins = Math.ceil(p.geometryDistance / speed);
                    p.realDistanceText = (p.geometryDistance / 1000).toFixed(1) + " km (直線)";
                    p.realDurationText = "~" + p.realDurationMins + " 分 (估計)";
                    return p;
                });
                fallbackPlaces = fallbackPlaces.filter(p => p.realDurationMins <= maxTime);
                
                if (fallbackPlaces.length === 0) {
                    alert("即便用直線距離估算，也無符合店家。");
                    btn.innerText = "🔄 開始搜尋店家";
                    btn.disabled = false;
                    return;
                }
                
                window.allSearchResults = fallbackPlaces.slice(0, userMaxCount); 
                window.eliminatedIds.clear(); 
                window.hitCounts = {};
                window.allSearchResults.forEach(p => window.hitCounts[p.place_id] = 0);
                
                if (typeof window.refreshWheelData === 'function') {
                    window.refreshWheelData();
                    btn.innerText = `搜尋完成 (共 ${window.places.length} 間) - 直線估算`;
                    btn.disabled = false;
                }
            } else {
                btn.innerText = "🔄 開始搜尋店家";
                btn.disabled = false;
            }
        });
};

window.getDistances = function(origin, destinations, mode) {
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
                console.warn(`Distance Matrix Status: ${status}`);
                if (status === 'OVER_QUERY_LIMIT' || status === 'REQUEST_DENIED' || status === 'UNKNOWN_ERROR') {
                    reject(status);
                } else {
                    resolve([]); 
                }
            }
        });
    });
};
