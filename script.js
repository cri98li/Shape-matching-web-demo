const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let lastX, lastY;
let chart;
let originalImage = null;

// Initialize black canvas
ctx.fillStyle = "black";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.strokeStyle = "white";
ctx.lineWidth = 2;

// Drawing events
canvas.addEventListener('mousedown', e => {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
});
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', () => {
    isDrawing = false;
    saveOriginalImage();
    updateHoughAccumulator();
});
canvas.addEventListener('mouseout', () => isDrawing = false);


// Touch events per dispositivi mobili
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    lastX = touch.clientX - rect.left;
    lastY = touch.clientY - rect.top;
    isDrawing = true;
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const currentX = touch.clientX - rect.left;
    const currentY = touch.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();

    lastX = currentX;
    lastY = currentY;
});

canvas.addEventListener('touchend', () => {
    isDrawing = false;
    saveOriginalImage();
    updateHoughAccumulator();
});






function draw(e) {
    if (!isDrawing) return;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
    [lastX, lastY] = [e.offsetX, e.offsetY];
}

// Clear button
document.getElementById('clearButton').addEventListener('click', () => {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "white";
    originalImage = null;
    if (chart) chart.destroy();
});

// Save original image for rotation
function saveOriginalImage() {
    originalImage = document.createElement('canvas');
    originalImage.width = canvas.width;
    originalImage.height = canvas.height;
    const tempCtx = originalImage.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);
}

// Rotate slider
const rotateSlider = document.getElementById('rotateSlider');
const rotateInput = document.getElementById('rotateInput');

function updateRotation(angle) {
    rotateSlider.value = angle;
    rotateInput.value = angle;
    rotateCanvas(angle);
}

// Slider input
rotateSlider.addEventListener('input', () => updateRotation(parseInt(rotateSlider.value)));

// Number input
rotateInput.addEventListener('input', () => {
    let val = parseInt(rotateInput.value);
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 360) val = 360;
    updateRotation(val);
});


function rotateCanvas(angle) {
    if (!originalImage) return;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.rotate(angle * Math.PI / 180);
    ctx.imageSmoothingEnabled = false; // keep lines crisp
    ctx.drawImage(originalImage, -canvas.width/2, -canvas.height/2);
    ctx.restore();

    updateHoughAccumulator();
}

function clampPeaks(data, factor = 1.5) {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length);
    const maxAllowed = mean + factor * std;
    return data.map(v => (v > maxAllowed ? maxAllowed : v));
}



// Convert canvas to grayscale OpenCV Mat
function getGrayImage() {
    const src = cv.imread(canvas);
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    src.delete();
    return gray;
}

let savedMaxY = null; // globale per conservare il massimo

function updateHoughAccumulator() {
    let gray = getGrayImage();
    cv.threshold(gray, gray, 127, 255, cv.THRESH_BINARY);

    let lines = new cv.Mat();
    cv.HoughLines(gray, lines, 1, Math.PI / 180, 0);

    const thetaCounts = new Array(180).fill(0);
    for (let i = 0; i < lines.rows; ++i) {
        const theta = lines.data32F[i * 2 + 1];
        const deg = Math.round(theta * 180 / Math.PI) % 180;
        thetaCounts[deg]++;
    }

    //const logCounts = thetaCounts.map(v => Math.log1p(v));
    const logCounts = thetaCounts.map(v => v);

    MaxY = Math.max(5, Math.max(...logCounts));
    if (savedMaxY === null || MaxY > savedMaxY) {
        savedMaxY = MaxY;
    }

    const ctxChart = document.getElementById('accumulatorChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: Array.from({length: 180}, (_, i) => i),
            datasets: [{
                label: 'log(Σ accumulator by θ)',
                data: logCounts,
                borderColor: 'blue',
                fill: false,
                tension: 0.5,
                pointRadius: 0
            }]
        },
        options: {
            responsive: false,
            animation: false,
            scales: {
                x: { title: { display: true, text: 'θ (degrees)' } },
                y: { 
                    title: { display: true, text: 'count' },
                    min: 0,
                    max: savedMaxY
                }
            }
        }
    });

    gray.delete();
    lines.delete();
}

// Reset savedMaxY quando si preme Clear
document.getElementById('clearButton').addEventListener('click', () => {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "white";
    originalImage = null;
    savedMaxY = null; // reset maxY
    if (chart) chart.destroy();
});
