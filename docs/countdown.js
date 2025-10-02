// countdown.js
document.addEventListener('DOMContentLoaded', () => {
    // 启动 50 秒倒数计时器，并更新 UI
    function startCountdown(seconds) {
        const countdownEl = document.getElementById('countdown');
        const barWrapEl = document.getElementById('barWrap');
        let time = seconds;

        // 确保进度条容器可见（如果它被外部JS隐藏了）
        if (barWrapEl) barWrapEl.style.display = 'block';
        
        // 确保 countdown 元素存在
        if (!countdownEl) {
            console.error("Countdown element (#countdown) not found.");
            return;
        }

        // 首次更新显示
        countdownEl.textContent = `倒数: ${time}s`;

        const interval = setInterval(() => {
            time--;
            if (time >= 0) {
                countdownEl.textContent = `倒数: ${time}s`;
            } else {
                clearInterval(interval);
                countdownEl.textContent = '计时结束';
            }
        }, 1000); 
    }

    // 在页面加载后立即启动 50 秒倒数。
    startCountdown(50);
});
