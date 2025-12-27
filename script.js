// script.js - 入口點與事件綁定

window.onload = () => {
    try {
        console.log("Window loaded. Initializing...");

        // 1. 初始化 Canvas
        window.canvas = document.getElementById('wheel');
        if(window.canvas) window.ctx = window.canvas.getContext('2d');
        window.menuCanvas = document.getElementById('menuWheel');
        if(window.menuCanvas) window.menuCtx = window.menuCanvas.getContext('2d');

        // 2. 載入資料
        const savedRatings = localStorage.getItem('food_wheel_user_ratings');
        if (savedRatings) {
            try { window.userRatings = JSON.parse(savedRatings); } catch(e) { console.error(e); }
        }

        if (typeof window.loadUserKeywords === 'function') window.loadUserKeywords();
        else window.activeKeywordDict = { ...window.defaultKeywordDict };

        // 3. 載入 API 或 顯示設定
        const savedKey = localStorage.getItem('food_wheel_api_key');
        if (savedKey) {
            if (typeof window.loadGoogleMapsScript === 'function') window.loadGoogleMapsScript(savedKey);
        } else {
            document.getElementById('setup-screen').style.display = 'block';
            document.getElementById('app-screen').style.display = 'none';
            if (typeof window.populateSetupKeywords === 'function') window.populateSetupKeywords(); 
            if (typeof window.populateSetupGeneralPrefs === 'function') window.populateSetupGeneralPrefs();
            
            const geminiKey = localStorage.getItem('food_wheel_gemini_key');
            if(geminiKey && document.getElementById('userGeminiKey')) {
                document.getElementById('userGeminiKey').value = geminiKey;
            }
            if (typeof window.showGuide === 'function') window.showGuide('desktop');
        }

        // 4. 綁定過濾器
        const filterCheckbox = document.getElementById('filterDislike');
        if (filterCheckbox) {
            filterCheckbox.addEventListener('change', () => { 
                if (typeof window.refreshWheelData === 'function') window.refreshWheelData(); 
            });
        }

    } catch (err) {
        console.error("Initialization Crash:", err);
        alert("程式初始化失敗：" + err.message);
    }
};

// Spin 按鈕邏輯
const spinBtn = document.getElementById('spinBtn');
if(spinBtn) {
    spinBtn.onclick = () => {
        try {
            if (window.places.length === 0) return;
            
            let spinMode = 'repeat';
            const spinModeEl = document.getElementById('spinMode'); 
            if (spinModeEl) spinMode = spinModeEl.value;
            
            spinBtn.disabled = true; 
            if (typeof window.setControlsDisabled === 'function') window.setControlsDisabled(true); 

            const spinAngle = Math.floor(Math.random() * 1800) + 1800; 
            window.currentRotation += spinAngle;
            window.canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
            window.canvas.style.transform = `rotate(${window.currentRotation}deg)`;

            // 隱藏結果區
            ['storeName', 'storeRating', 'storeAddress', 'storeDistance', 'userPersonalRating'].forEach(id => {
                const el = document.getElementById(id);
                if(el) {
                    if(id==='storeName') el.innerText = "命運旋轉中...";
                    else el.innerText = "";
                }
            });
            
            ['navLink', 'webLink', 'menuPhotoLink', 'btnAiMenu', 'btnLike', 'btnDislike'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.style.display = 'none';
            });

            setTimeout(() => {
                try {
                    const numOptions = window.places.length;
                    const arcSize = 360 / numOptions;
                    const actualRotation = window.currentRotation % 360;
                    let winningIndex = Math.floor((360 - actualRotation) / arcSize) % numOptions;
                    if (winningIndex < 0) winningIndex += numOptions;
                    
                    const winner = window.places[winningIndex];
                    if(!winner) throw new Error("Winner undefined");

                    // 顯示結果
                    if (typeof window.updateWinnerStatus === 'function') window.updateWinnerStatus(winner);
                    if (typeof window.updateHitCountUI === 'function') window.updateHitCountUI(winner.place_id);

                    if (spinMode === 'eliminate') {
                        window.eliminatedIds.add(winner.place_id); 
                        setTimeout(() => {
                            window.canvas.style.transition = 'none';
                            window.currentRotation = 0;
                            window.canvas.style.transform = `rotate(0deg)`;
                            if (typeof window.refreshWheelData === 'function') window.refreshWheelData(); 
                            if (typeof window.setControlsDisabled === 'function') window.setControlsDisabled(false); 
                        }, 2000); 
                    } else {
                        if (typeof window.setControlsDisabled === 'function') window.setControlsDisabled(false);
                        spinBtn.disabled = false;
                        if (typeof window.refreshWheelData === 'function') window.refreshWheelData(); 
                    }
                } catch (error) {
                    console.error("Spin Logic Error:", error);
                    if (typeof window.setControlsDisabled === 'function') window.setControlsDisabled(false);
                    spinBtn.disabled = false;
                }
            }, 4000);

        } catch (e) {
            console.error("Spin Init Error:", e);
            spinBtn.disabled = false;
            if (typeof window.setControlsDisabled === 'function') window.setControlsDisabled(false);
        }
    };
}
