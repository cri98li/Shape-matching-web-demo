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

function computeHoughAccumulator(edgeImage, thetaStep = 1, rhoStep = 1) {
    const width = edgeImage.cols;
    const height = edgeImage.rows;

    const maxRho = Math.hypot(width, height);
    const numRho = Math.ceil((2 * maxRho) / rhoStep); // +maxRho to -maxRho
    const numTheta = Math.floor(180 / thetaStep); // θ from 0 to 179

    // Initialize accumulator
    const accumulator = Array.from({ length: numRho }, () => new Array(numTheta).fill(0));

    const centerX = width / 2;
    const centerY = height / 2;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixel = edgeImage.ucharPtr(y, x)[0]; // Assuming grayscale edge image
            if (pixel === 0) continue; // Only consider edge points

            for (let t = 0; t < numTheta; t++) {
                const theta = t * thetaStep * Math.PI / 180; // convert to radians
                const rho = (x - centerX) * Math.cos(theta) + (y - centerY) * Math.sin(theta);
                const rIdx = Math.round((rho + maxRho) / rhoStep);

                accumulator[rIdx][t]++;
            }
        }
    }

    return {
        accumulator,
        numRho,
        numTheta,
        rhoStep,
        thetaStep
    };
}

function sumAccumulatorColumns(accumulator) {
    const numRho = accumulator.length;
    const numTheta = accumulator[0].length;

    const thetaSums = new Array(numTheta).fill(0);
    let massimo = 0

    for (let theta = 0; theta < numTheta; theta++) {
        for (let rho = 0; rho < numRho; rho++) {
            thetaSums[theta] += accumulator[rho][theta]*accumulator[rho][theta];
        }
        if (massimo < thetaSums[theta]){
            massimo = thetaSums[theta];
        }
    }

    for (let theta = 0; theta < numTheta; theta++) {
        thetaSums[theta] /= massimo;
    }

    return thetaSums;
}



function updateHoughAccumulator() {
    let gray = getGrayImage();
    cv.threshold(gray, gray, 10, 255, cv.THRESH_BINARY);

    let {accumulator, numRho, numTheta, rhoStep, thetaStep} = computeHoughAccumulator(gray)


    const logCounts = sumAccumulatorColumns(accumulator)

    const ctxChart = document.getElementById('accumulatorChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: Array.from({length: 180}, (_, i) => i),
            datasets: [{
                label: 'Σ accumulator² by θ',
                data: logCounts,
                borderColor: 'blue',
                fill: false,
                tension: 0.1,
                pointRadius: 0
            }]
        },
        options: {
            responsive: false,
            animation: false,
            scales: {
                x: { title: { display: true, text: 'θ (degrees)' },
                    min: 0,
                    max: 180
            },
                y: { 
                    title: { display: true, text: 'count' },
                    min: 0,
                    max: 1.04
                }
            }
        }
    });

    gray.delete();
    //lines.delete();
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
