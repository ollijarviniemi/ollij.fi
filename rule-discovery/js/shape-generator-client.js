/**
 * Client-side shape generator for Maailmantutkija web applications
 * This is a JavaScript port of the Python shape_generator.py and poisson_sampling.py
 * Maintains exact functionality and visual output for seamless migration
 */

class ClientShapeGenerator {
    constructor(width = 800, height = 600, marginPercent = 0.2) {
        this.width = width;
        this.height = height;
        this.marginPercent = marginPercent;
        this.shapeTypes = ["circle", "square", "triangle", "star", "heart", "plus"];
        this.colors = ["red", "blue", "green", "purple", "black"];

        // Color mapping to match matplotlib exactly
        this.colorMap = {
            'red': '#FF0000',
            'blue': '#0000FF',
            'green': '#008000',
            'purple': '#800080',
            'black': '#000000',
            'yellow': '#FFD700' // Golden color like matplotlib
        };
    }

    /**
     * Generate random Gaussian mixture parameters
     * Ports the exact logic from Python shape_generator.py
     */
    generateRandomGaussianMixtureParams(numGaussians, domain) {
        const [xMin, xMax, yMin, yMax] = domain;
        const width = xMax - xMin;
        const height = yMax - yMin;

        const means = [];
        const covs = [];
        const weights = [];

        // Available variance choices - exact from Python
        const varChoices = [0.04, 0.05, 0.07, 0.09, 0.11, 0.14, 0.17, 0.2, 0.24, 0.29, 0.35];
        const weightChoices = [1, 1.5, 2, 3, 4, 6, 8, 11, 16, 22];

        for (let i = 0; i < numGaussians; i++) {
            // Random mean within domain (0.2 to 0.8 range like Python)
            const meanX = xMin + (0.2 + Math.random() * 0.6) * width;
            const meanY = yMin + (0.2 + Math.random() * 0.6) * height;
            means.push([meanX, meanY]);

            // Random covariance matrix
            let varX = varChoices[Math.floor(Math.random() * varChoices.length)] * width;
            let varY = varChoices[Math.floor(Math.random() * varChoices.length)] * height;

            // Scale by num_gaussians like Python
            varX /= Math.pow(numGaussians, 1/3);
            varY /= Math.pow(numGaussians, 1/3);

            // Add correlation with 50% probability like Python
            if (Math.random() < 0.5) {
                const covXY = (Math.random() * 2 - 1) * 0.5 * Math.sqrt(varX * varY);
                covs.push([[varX, covXY], [covXY, varY]]);
            } else {
                covs.push([[varX, 0], [0, varY]]);
            }

            // Random weight
            weights.push(weightChoices[Math.floor(Math.random() * weightChoices.length)]);
        }

        // Normalize weights to sum to 1
        const weightSum = weights.reduce((a, b) => a + b, 0);
        const normalizedWeights = weights.map(w => w / weightSum);

        return {
            means: means,
            covs: covs,
            weights: normalizedWeights
        };
    }

    /**
     * Calculate maximum radius for shapes to prevent overlapping
     * Exact port from Python shape_generator.py
     */
    calculateMaxRadius(points) {
        if (points.length <= 1) {
            return Math.min(this.width, this.height) / 4;
        }

        const distances = [];
        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const dx = points[i][0] - points[j][0];
                const dy = points[i][1] - points[j][1];
                const dist = Math.sqrt(dx * dx + dy * dy);
                distances.push(dist);
            }
        }

        const minDistance = Math.min(...distances);
        return minDistance / (2 + this.marginPercent);
    }

    /**
     * Draw a shape on canvas context
     * Exact visual replication of Python matplotlib shapes
     */
    drawShape(ctx, shapeType, center, radius, color) {
        ctx.fillStyle = this.colorMap[color] || color;
        ctx.beginPath();

        switch (shapeType) {
            case "circle":
                // Matches Python: radius *= 0.8
                const circleRadius = radius * 0.8;
                ctx.arc(center[0], center[1], circleRadius, 0, 2 * Math.PI);
                break;

            case "square":
                // Matches Python: square_half_width = radius * 0.65
                const squareHalfWidth = radius * 0.65;
                ctx.rect(
                    center[0] - squareHalfWidth,
                    center[1] - squareHalfWidth,
                    2 * squareHalfWidth,
                    2 * squareHalfWidth
                );
                break;

            case "triangle":
                // Exact replication of Python triangle calculation
                const triangleRadius = radius * 0.6 * Math.sqrt(4 * Math.PI / (3 * Math.sqrt(3)));
                const angles = [-Math.PI/6, Math.PI/2, Math.PI*7/6];

                ctx.moveTo(
                    center[0] + triangleRadius * Math.cos(angles[0]),
                    center[1] - triangleRadius * Math.sin(angles[0]) // Invert Y for Canvas coordinate system
                );

                for (let i = 1; i < angles.length; i++) {
                    ctx.lineTo(
                        center[0] + triangleRadius * Math.cos(angles[i]),
                        center[1] - triangleRadius * Math.sin(angles[i]) // Invert Y for Canvas coordinate system
                    );
                }
                ctx.closePath();
                break;

            case "star":
                this.drawStar(ctx, center, radius * 0.7);
                break;

            case "heart":
                this.drawHeart(ctx, center, radius * 0.7);
                break;

            case "plus":
                this.drawPlus(ctx, center, radius * 0.7);
                break;
        }

        ctx.fill();
    }

    /**
     * Draw a five-pointed star - exact replication of Python star
     */
    drawStar(ctx, center, radius) {
        const outerRadius = radius;
        const innerRadius = radius * 0.4; // Exact from Python
        const numPoints = 5;

        const vertices = [];
        for (let i = 0; i < numPoints * 2; i++) {
            const angle = i * Math.PI / numPoints;
            const rotatedAngle = angle + Math.PI / 10; // Exact rotation from Python
            const r = i % 2 === 0 ? outerRadius : innerRadius;

            vertices.push([
                center[0] + r * Math.cos(rotatedAngle),
                center[1] - r * Math.sin(rotatedAngle) // Invert Y for Canvas coordinate system
            ]);
        }

        ctx.beginPath();
        ctx.moveTo(vertices[0][0], vertices[0][1]);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i][0], vertices[i][1]);
        }
        ctx.closePath();
    }

    /**
     * Draw heart shape - replicates Python parametric heart equations
     */
    drawHeart(ctx, center, radius) {
        const vertices = [];
        const numPoints = 100; // Match Python resolution

        for (let i = 0; i < numPoints; i++) {
            const t = i * 2 * Math.PI / numPoints;

            // Exact parametric equations from Python
            const x = center[0] + radius * (16 * Math.pow(Math.sin(t), 3)) / 16;
            const y = center[1] - radius * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 16; // Invert Y for Canvas coordinate system

            vertices.push([x, y]);
        }

        ctx.beginPath();
        ctx.moveTo(vertices[0][0], vertices[0][1]);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i][0], vertices[i][1]);
        }
        ctx.closePath();
    }

    /**
     * Draw plus shape - exact replication of Python plus
     */
    drawPlus(ctx, center, radius) {
        const armWidth = radius * 0.4; // Exact from Python

        // Horizontal arm
        ctx.beginPath();
        ctx.rect(
            center[0] - radius,
            center[1] - armWidth / 2,
            2 * radius,
            armWidth
        );
        ctx.fill();

        // Vertical arm
        ctx.beginPath();
        ctx.rect(
            center[0] - armWidth / 2,
            center[1] - radius,
            armWidth,
            2 * radius
        );
        ctx.fill();
    }

    /**
     * Sample from log-uniform distribution
     * Exact replication of Flask backend function
     */
    sampleLogUniform(minVal, maxVal) {
        const possibleValues = [];
        const weights = [];

        for (let n = minVal; n <= maxVal; n++) {
            possibleValues.push(n);
            weights.push(1 / n);
        }

        // Normalize weights
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const normalizedWeights = weights.map(w => w / totalWeight);

        // Sample using cumulative distribution
        const rand = Math.random();
        let cumulative = 0;

        for (let i = 0; i < possibleValues.length; i++) {
            cumulative += normalizedWeights[i];
            if (rand <= cumulative) {
                return possibleValues[i];
            }
        }

        return maxVal; // Fallback
    }

    /**
     * Generate image with shapes - main function replicating Flask backend
     */
    async generateImage(options = {}) {
        const {
            numShapes = this.sampleLogUniform(10, 100),
            shapeType = "circle",
            color = "blue",
            distribution = "uniform",
            numGaussians = 3,
            canvasWidth = this.width,
            canvasHeight = this.height
        } = options;

        // Create canvas for generation
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');

        // White background like matplotlib
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Set up domain (normalized coordinates like Python)
        const domain = [0, 1, 0, 1];

        // Generate PDF parameters if needed
        let pdfParams = null;
        if (distribution === "gaussian_mixture") {
            pdfParams = this.generateRandomGaussianMixtureParams(numGaussians, domain);
        }

        // Calculate m_target like Python
        let mTarget;
        if (distribution === "uniform") {
            const multipliers = [1.1, 1.15, 1.2, 1.25, 1.4, 1.7, 2, 2.5, 3, 3.5, 4, 5];
            mTarget = numShapes * multipliers[Math.floor(Math.random() * multipliers.length)];
        } else {
            mTarget = Math.pow(numShapes, 4/3) / 5;
        }

        mTarget = Math.max(1, Math.min(Math.floor(mTarget), 50000));

        // Generate points using Poisson disc sampling
        const points = await this.generatePointsFromPDF(
            numShapes,
            mTarget,
            distribution,
            domain,
            pdfParams
        );

        // Scale points to image dimensions with border margin (exact Python logic)
        let coeff = 0.03;
        if (numShapes <= 100) coeff += 0.02;
        if (numShapes <= 30) coeff += 0.03;
        if (numShapes <= 10) coeff += 0.02;

        const borderMarginX = canvasWidth * coeff;
        const borderMarginY = canvasHeight * coeff;

        const scaledPoints = points.map(point => [
            borderMarginX + point[0] * (canvasWidth - 2 * borderMarginX),
            borderMarginY + point[1] * (canvasHeight - 2 * borderMarginY)
        ]);

        // Calculate maximum radius
        const maxRadius = this.calculateMaxRadius(scaledPoints);

        // Draw shapes
        for (const point of scaledPoints) {
            this.drawShape(ctx, shapeType, point, maxRadius, color);
        }

        return {
            success: true,
            image: canvas.toDataURL(),
            numShapes: scaledPoints.length,
            shapeType: shapeType,
            color: color,
            distribution: distribution,
            canvas: canvas
        };
    }

    /**
     * Generate points from PDF using Poisson disc sampling
     * This will call the separate PoissonDiscSampler class
     */
    async generatePointsFromPDF(n, mTarget, pdfType, domain, pdfParams) {
        // Create PDF function
        let pdfFunc;
        if (pdfType === 'uniform') {
            pdfFunc = (x, y) => this.uniformPDF(x, y, domain);
        } else {
            pdfFunc = (x, y) => this.gaussianMixturePDF(x, y, pdfParams);
        }

        // Calculate adjusted r for approximately mTarget points
        const [xMin, xMax, yMin, yMax] = domain;
        const width = xMax - xMin;
        const height = yMax - yMin;
        const r = 0.1; // Base minimum distance
        const adjustedR = r * Math.sqrt(width * height / (mTarget * Math.PI * r * r));

        // Generate points with Poisson disc sampling
        const sampler = new PoissonDiscSampler(width, height, adjustedR);
        const allPoints = sampler.sample();

        // Compute PDF values at points
        const pdfValues = allPoints.map(point => pdfFunc(point[0], point[1]));

        // Sample n points from the PDF
        return this.sampleFromPDF(allPoints, pdfValues, n);
    }

    /**
     * Uniform PDF function
     */
    uniformPDF(x, y, domain) {
        const [xMin, xMax, yMin, yMax] = domain;
        if (x >= xMin && x <= xMax && y >= yMin && y <= yMax) {
            return 1.0 / ((xMax - xMin) * (yMax - yMin));
        }
        return 0.0;
    }

    /**
     * Gaussian mixture PDF function
     */
    gaussianMixturePDF(x, y, params) {
        const { means, covs, weights } = params;
        let result = 0;

        for (let i = 0; i < means.length; i++) {
            const mean = means[i];
            const cov = covs[i];
            const weight = weights[i];

            // Compute 2D Gaussian PDF
            const dx = x - mean[0];
            const dy = y - mean[1];

            // Compute determinant and inverse of covariance matrix
            const det = cov[0][0] * cov[1][1] - cov[0][1] * cov[1][0];
            const invCov = [
                [cov[1][1] / det, -cov[0][1] / det],
                [-cov[1][0] / det, cov[0][0] / det]
            ];

            // Compute quadratic form
            const quad = dx * (invCov[0][0] * dx + invCov[0][1] * dy) +
                        dy * (invCov[1][0] * dx + invCov[1][1] * dy);

            // Gaussian PDF formula
            const gaussianValue = Math.exp(-0.5 * quad) / (2 * Math.PI * Math.sqrt(det));
            result += weight * gaussianValue;
        }

        return result;
    }

    /**
     * Sample points from PDF using rejection sampling
     * Exact replication of Python sampling logic
     */
    sampleFromPDF(points, pdfValues, n) {
        const totalPDF = pdfValues.reduce((a, b) => a + b, 0);
        const cumulativeSum = [];
        let sum = 0;

        for (const value of pdfValues) {
            sum += value;
            cumulativeSum.push(sum);
        }

        const selectedIndices = new Set();

        while (selectedIndices.size < Math.min(n, points.length)) {
            const randVal = Math.random() * totalPDF;

            // Binary search for efficiency
            let idx = 0;
            for (let i = 0; i < cumulativeSum.length; i++) {
                if (randVal <= cumulativeSum[i]) {
                    idx = i;
                    break;
                }
            }

            selectedIndices.add(idx);
        }

        const selectedPoints = Array.from(selectedIndices).map(idx => points[idx]);
        return selectedPoints;
    }
}

/**
 * Poisson Disc Sampling implementation
 * Exact port of Python PoissonDiscSampling class
 */
class PoissonDiscSampler {
    constructor(width, height, r, k = 30) {
        this.width = width;
        this.height = height;
        this.r = r;
        this.k = k;
        this.cellSize = r / Math.sqrt(2);
        this.gridWidth = Math.ceil(width / this.cellSize);
        this.gridHeight = Math.ceil(height / this.cellSize);
        this.grid = new Array(this.gridWidth * this.gridHeight).fill(null);
        this.activeList = [];
        this.points = [];
    }

    gridIndex(x, y) {
        return Math.floor(x / this.cellSize) + Math.floor(y / this.cellSize) * this.gridWidth;
    }

    isValidPoint(point) {
        if (point[0] < 0 || point[0] >= this.width || point[1] < 0 || point[1] >= this.height) {
            return false;
        }

        const cellX = Math.floor(point[0] / this.cellSize);
        const cellY = Math.floor(point[1] / this.cellSize);

        // Check surrounding cells
        for (let i = Math.max(0, cellX - 2); i < Math.min(this.gridWidth, cellX + 3); i++) {
            for (let j = Math.max(0, cellY - 2); j < Math.min(this.gridHeight, cellY + 3); j++) {
                const gridIdx = i + j * this.gridWidth;
                if (gridIdx < this.grid.length && this.grid[gridIdx] !== null) {
                    const neighbor = this.grid[gridIdx];
                    const dx = point[0] - neighbor[0];
                    const dy = point[1] - neighbor[1];
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < this.r) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    sample() {
        // Add first point
        const x = Math.random() * this.width;
        const y = Math.random() * this.height;
        const firstPoint = [x, y];

        this.points.push(firstPoint);
        this.activeList.push(firstPoint);

        const gridIdx = this.gridIndex(x, y);
        if (gridIdx < this.grid.length) {
            this.grid[gridIdx] = firstPoint;
        }

        // Process active list
        while (this.activeList.length > 0) {
            const activeIdx = Math.floor(Math.random() * this.activeList.length);
            const activePoint = this.activeList[activeIdx];

            let found = false;

            for (let attempt = 0; attempt < this.k; attempt++) {
                const angle = Math.random() * 2 * Math.PI;
                const distance = this.r + Math.random() * this.r; // Between r and 2r
                const newX = activePoint[0] + distance * Math.cos(angle);
                const newY = activePoint[1] + distance * Math.sin(angle);
                const newPoint = [newX, newY];

                if (this.isValidPoint(newPoint)) {
                    this.points.push(newPoint);
                    this.activeList.push(newPoint);

                    const newGridIdx = this.gridIndex(newX, newY);
                    if (newGridIdx < this.grid.length) {
                        this.grid[newGridIdx] = newPoint;
                    }

                    found = true;
                    break;
                }
            }

            if (!found) {
                this.activeList.splice(activeIdx, 1);
            }
        }

        return this.points;
    }
}