//現在時刻
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('clock').textContent = `${hours}:${minutes}:${seconds}`;
}

setInterval(updateClock, 1000);
updateClock(); // 初回実行

// ====== センサー1のAPIエンドポイント ======
const sensorEndpoints = {
    soil2n: "https://wiolink.seeed.co.jp/v1/node/GroveTemp1WireD1/temp?access_token=a04e60017fac97b4bfd1da3912ae7ed7",
    soil5n: "https://wiolink.seeed.co.jp/v1/node/GroveTemp1WireD1/temp?access_token=03d5be181d138741fb82ba16c14eb008",
    soil8n: "https://wiolink.seeed.co.jp/v1/node/GroveTemp1WireD1/temp?access_token=fe692e4c823a106599949775150ced82",

    soil10e: "https://wiolink.seeed.co.jp/v1/node/GroveTemp1WireD1/temp?access_token=18ea1e37afa57223fc89f81f41e0c890",
    soil10w: "https://wiolink.seeed.co.jp/v1/node/GroveTemp1WireD1/temp?access_token=c7a78328a4a91c967b5639fe92ba0e68"
};

const sensorKeyMap = {
    soil2n: "temperature",
    soil5n: "temperature",
    soil8n: "temperature",

    soil10e: "temperature",
    soil10w: "temperature"
};

const latestValues = {};
let chart;  // Chart.js のインスタンスを保持

// ====== センサー値取得 ======
async function fetchSensor(id) {
    try {
        const res = await fetch(sensorEndpoints[id]);
        const data = await res.json();
        const key = sensorKeyMap[id];
        const value = data[key];

        if (value === undefined) throw new Error("データなし");
        latestValues[id] = value;

        const unit = id === "humidity1" ? "%" : "°C";
        document.getElementById(id).textContent = value + " " + unit;
    } catch (e) {
        document.getElementById(id).textContent = "取得失敗";
        console.error(`${id} エラー:`, e);
    }
}

// ====== 全センサー更新 ======
function updateAllSensors() {
    return Promise.all(Object.keys(sensorEndpoints).map(fetchSensor));
}

// ====== ローカルストレージ保存 ======
function saveToLocalStorage() {
    const timestamp = new Date().toISOString();
    const stored = JSON.parse(localStorage.getItem("sensorDataLog") || "[]");

    const record = {
        timestamp,
        values: { ...latestValues }
    };

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48時間分
    const filtered = stored.filter(entry => new Date(entry.timestamp) > cutoff);
    filtered.push(record);

    while (filtered.length > 300) filtered.shift(); // 上限300件

    localStorage.setItem("sensorDataLog", JSON.stringify(filtered));
    console.log("保存:", record);
}

// ====== 任意の期間の平均値を算出 ======
function calculateAverage(startTime, endTime) {
    const stored = JSON.parse(localStorage.getItem("sensorDataLog") || "[]");
    if (stored.length === 0) return null;

    const recent = stored.filter(entry => {
        const t = new Date(entry.timestamp);
        return t >= startTime && t <= endTime;
    });
    if (recent.length === 0) return null;

    // 各センサーごとに合計
    const sum = {};
    const count = {};

    recent.forEach(entry => {
        for (const [key, value] of Object.entries(entry.values)) {
            if (!sum[key]) {
                sum[key] = 0;
                count[key] = 0;
            }
            sum[key] += value;
            count[key] += 1;
        }
    });

    const averages = {};
    for (const key of Object.keys(sum)) {
        averages[key] = sum[key] / count[key];
    }
    return averages;
}

// ====== 直近24h平均（既存） ======
function showGroupAverages() {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const avg = calculateAverage(start, now);
    if (!avg) return;
    updateGroupDisplays(avg, "soil-main-avg", "soil-10-avg");
}

// ====== 前日24h平均 ======
function showYesterdayAverages() {
    const now = new Date();

    // 昨日の0:00〜23:59:59を計算
    const start = new Date(now);
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const avg = calculateAverage(start, end);
    if (!avg) return;
    updateGroupDisplays(avg, "soil-main-avg-yesterday", "soil-10-avg-yesterday");
}

// ====== グループごとの表示更新共通処理 ======
function updateGroupDisplays(avg, northId, eastWestId) {
    const northKeys = ["soil2n", "soil5n", "soil8n"];
    const eastWestKeys = ["soil10e", "soil10w"];

    // 北地3地点
    let nTotal = 0, nCount = 0;
    northKeys.forEach(key => {
        if (avg[key] !== undefined) {
            nTotal += avg[key];
            nCount++;
        }
    });
    if (nCount > 0) {
        document.getElementById(northId).textContent =
            (nTotal / nCount).toFixed(2) + " °C";
    }

    // 育成地2地点
    let ewTotal = 0, ewCount = 0;
    eastWestKeys.forEach(key => {
        if (avg[key] !== undefined) {
            ewTotal += avg[key];
            ewCount++;
        }
    });
    if (ewCount > 0) {
        document.getElementById(eastWestId).textContent =
            (ewTotal / ewCount).toFixed(2) + " °C";
    }
}

// ====== グラフ描画 ======
function drawMultiChart() {
    const data = JSON.parse(localStorage.getItem("sensorDataLog") || "[]");
    const recentData = data.filter(entry => new Date(entry.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000));

    if (recentData.length === 0) return;

    const labels = recentData.map(entry => new Date(entry.timestamp));

    const datasets = [
        {
            label: "本2北地 (°C)",
            data: recentData.map(e => e.values.soil2n ?? null),
            borderColor: "#4bc0c0",
            backgroundColor: "#4bc0c033",
            yAxisID: "y1",
            tension: 0.3,
            fill: false,
            spanGaps: true
        },
        {
            label: "本5北地 (°C)",
            data: recentData.map(e => e.values.soil5n ?? null),
            borderColor: "#ff9f40",
            backgroundColor: "#ff9f4033",
            yAxisID: "y1",
            tension: 0.3,
            fill: false,
            spanGaps: true
        },
        {
            label: "本8北地 (°C)",
            data: recentData.map(e => e.values.soil8n ?? null),
            borderColor: "#9966ff",
            backgroundColor: "#9966ff33",
            yAxisID: "y1",
            tension: 0.3,
            fill: false,
            spanGaps: true,
            //borderDash: [10, 5], // 長めの点線
        },

        {
            label: "育西地 (°C)",
            data: recentData.map(e => e.values.soil10e ?? null),
            borderColor: "#ff6384",
            backgroundColor: "#ff638433",
            yAxisID: "y1",
            tension: 0.3,
            fill: false,
            spanGaps: true,
            //borderDash: [5, 5],  // 点線
        },
        {
            label: "育東地 (°C)",
            data: recentData.map(e => e.values.soil10w ?? null),
            borderColor: "#36a2eb",
            backgroundColor: "#36a2eb33",
            yAxisID: "y1",
            tension: 0.3,
            fill: false,
            spanGaps: true
        }
    ];

    //00:00に縦線を描画
    const midnightLinesPlugin = {
        id: 'midnightLines',
        afterDraw: (chart) => {
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y1 || chart.scales.y; // y軸を取得（y1優先）

            if (!xAxis || !yAxis) return;

            const ctx = chart.ctx;

            // X軸の表示範囲を取得
            const min = xAxis.min;
            const max = xAxis.max;

            // 開始日の 00:00 を基準に
            let current = new Date(min);
            current.setHours(0, 0, 0, 0);

            while (current.getTime() <= max) {
                const x = xAxis.getPixelForValue(current);

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, yAxis.top);
                ctx.lineTo(x, yAxis.bottom);
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#e6e6e6';   // ← 縦線の色
                ctx.setLineDash([4, 4]);   // ← 点線（消したいなら削除OK）
                ctx.stroke();
                ctx.restore();

                // 翌日の00:00へ
                current.setDate(current.getDate() + 1);
            }
        }
    };

    // === 最高値・最低値を描画するプラグイン ===
    const extremaGroupLabelsPlugin = {
        id: "extremaGroupLabels",
        afterDatasetsDraw(chart) {
            const ctx = chart.ctx;

            // グループごとのデータセットインデックス
            const groupNorth = [0, 1, 2]; // soil2n,5n,8n
            const groupEastWest = [3, 4]; // soil10e,10w

            function drawGroupExtrema(group, labelPrefix) {
                let maxVal = -Infinity, minVal = Infinity;
                let maxPoint = null, minPoint = null;
                let maxColor = "#e6e6e6", minColor = "#e6e6e6";
                let maxLabel = "", minLabel = "";

                group.forEach(idx => {
                    const dataset = chart.data.datasets[idx];
                    const meta = chart.getDatasetMeta(idx);
                    if (!dataset || !meta) return;

                    dataset.data.forEach((v, i) => {
                        if (v == null || meta.data[i] == null) return;
                        const pt = meta.data[i];

                        if (v > maxVal) {
                            maxVal = v;
                            maxPoint = pt;
                            maxColor = dataset.borderColor;
                            maxLabel = dataset.label;
                        }
                        if (v < minVal) {
                            minVal = v;
                            minPoint = pt;
                            minColor = dataset.borderColor;
                            minLabel = dataset.label;
                        }
                    });
                });

                // === MAX ラベル ===
                if (maxPoint) {
                    const {x, y} = maxPoint.getProps(['x','y'], true);
                    const labelY = y - 25; // 上に表示
                    ctx.save();
                    ctx.fillStyle = maxColor;
                    ctx.strokeStyle = maxColor;
                    ctx.font = "bold 12px sans-serif";
                    ctx.textAlign = "center";

                    // 点を強調
                    ctx.beginPath();
                    ctx.arc(x, y, 5, 0, Math.PI * 2);
                    ctx.fill();

                    // 点とラベルを線で結ぶ
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, labelY + 5);
                    ctx.stroke();

                    // ラベル文字
                    ctx.fillText(`${labelPrefix} MAX ${maxVal.toFixed(2)}°C`, x, labelY);
                    ctx.restore();
                }

                // === MIN ラベル ===
                if (minPoint) {
                    const {x, y} = minPoint.getProps(['x','y'], true);
                    const labelY = y + 25; // 下に表示
                    ctx.save();
                    ctx.fillStyle = minColor;
                    ctx.strokeStyle = minColor;
                    ctx.font = "bold 12px sans-serif";
                    ctx.textAlign = "center";

                    // 点を強調
                    ctx.beginPath();
                    ctx.arc(x, y, 5, 0, Math.PI * 2);
                    ctx.fill();

                    // 点とラベルを線で結ぶ
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, labelY - 12);
                    ctx.stroke();

                    // ラベル文字
                    ctx.fillText(`${labelPrefix} MIN ${minVal.toFixed(2)}°C`, x, labelY);
                    ctx.restore();
                }
            }

            // 北側 soil2n〜soil8n
            drawGroupExtrema(groupNorth, "本圃");

            // 東西側 soil10e,10w
            drawGroupExtrema(groupEastWest, "育苗");
        }
    };

    if (chart) chart.destroy(); // 既存チャート削除

    chart = new Chart(document.getElementById("multchart"), {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false,
                    labels: {color: "#c8c8c8"}
                },

                title: {
                    color:"#c8c8c8",
                    display: true,
                    // text: "本圃と育苗の地温変化"
                }
            },
            scales: {
                x: {
                    grid: {
                        color: "#c8c8c8"   // X軸のマス目線の色
                    },
                    type: 'time',
                    time: {
                        unit: 'hour',                // ← 1時間ごとに区切る
                        tooltipFormat: 'HH:mm',      // ホバー時のツールチップ表示
                        displayFormats: { hour: 'HH:mm' } // 軸ラベルのフォーマット
                    },
                    ticks: {
                        color: "#c8c8c8",
                        callback: function(value) {
                            const date = new Date(value);
                            return date.toLocaleTimeString('ja-JP', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                        },
                        autoSkip: true,
                        maxRotation: 0,
                        minRotation: 0
                    },
                    // 右側に1時間分の余白を作る
                    min: undefined, // 自動
                    max: (function() {
                        const now = new Date();
                        const lastLabel = new Date(now);
                        lastLabel.setMinutes(0, 0, 0);           // 今の時間を切り捨て
                        lastLabel.setHours(lastLabel.getHours() + 1); // 次の1時間
                        return lastLabel;
                    })(),
                },
                y1: {
                    grid: {
                        color: "#c8c8c8"   // X軸のマス目線の色
                    },
                    type: "linear",
                    position: "left",
                    title: { color:"#c8c8c8", display: true, text: "温度 (°C)" },
                    ticks: {
                        color:"#c8c8c8",
                        stepSize: 5  // ← 5単位ごとにラベルを表示
                    },
                    min: 10,
                    max: 40
                },
                y2: {
                    grid: {
                        color: "#c8c8c8"   // X軸のマス目線の色
                    },
                    type: "linear",
                    position: "right",
                    ticks: {
                        color:"#c8c8c8",
                        stepSize: 5  // ← 5単位ごとにラベルを表示
                    },
                    grid: {
                        display: false
                    },
                    min: 10,
                    max: 40
                }
            },
        },
        plugins: [midnightLinesPlugin, extremaGroupLabelsPlugin]
    });
}

// ====== センサー取得 → 保存 → グラフ更新 ======
async function fetchSaveAndUpdate() {
    await updateAllSensors();
    saveToLocalStorage();
    drawMultiChart();
    showGroupAverages();
    showYesterdayAverages();
}

// ====== 10分区切りで更新スケジュール ======
window.addEventListener("load", () => {
    // 現在時刻
    const now = new Date();
    const ms = now.getMinutes();
    const sec = now.getSeconds();
    const msec = now.getMilliseconds();

    // 次の「10分区切り」までの残り時間を計算
    const minutesToNext = 10 - (ms % 10);
    let delay = (minutesToNext * 60 - sec) * 1000 - msec;
    if (delay < 0) delay += 10 * 60 * 1000; // 念のため調整

    console.log(`次の更新まで: ${Math.round(delay / 1000)} 秒`);

    // 最初の「区切り時刻」に合わせて実行
    setTimeout(() => {
        fetchSaveAndUpdate();

        // 以降は10分ごとに実行
        setInterval(fetchSaveAndUpdate, 10 * 60 * 1000);
    }, delay);

    // ページ表示直後にもデータを描画（グラフが空にならないように）
    fetchSaveAndUpdate();
});

