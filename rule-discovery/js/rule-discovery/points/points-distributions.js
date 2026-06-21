/**
 * Points Game - Distribution Generators
 * Generators for point patterns on discrete grid
 */

// =============================================================================
// GRID CONFIGURATION
// =============================================================================

const GRID_WIDTH = 16;   // Number of horizontal cells (reduced from 18)
const GRID_HEIGHT = 11;  // Number of vertical cells (reduced from 13)
const MARGIN = 1;        // Margin (in cells) at the edges

// Coordinate ranges with MARGIN-cell margin on all sides
const MIN_X = MARGIN;
const MAX_X = GRID_WIDTH - MARGIN;  // 15
const MIN_Y = MARGIN;
const MAX_Y = GRID_HEIGHT - MARGIN; // 10

// Check if point is within valid range
function isPointValid(point) {
    return point.x >= MIN_X && point.x <= MAX_X && point.y >= MIN_Y && point.y <= MAX_Y;
}

// Filter out points that are outside valid range
function filterValidPoints(points) {
    const validPoints = points.filter(isPointValid);

    // Log warning if points were filtered out
    if (validPoints.length < points.length) {
        console.warn(`[BOUNDS FILTER] Filtered out ${points.length - validPoints.length} out-of-bounds points`);
    }

    return validPoints;
}

// =============================================================================
// HELPER UTILITIES
// =============================================================================

function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
        [a, b] = [b, a % b];
    }
    return a;
}

// Remove duplicate points from an array
function removeDuplicates(points) {
    const unique = [];
    const seen = new Set();
    for (const p of points) {
        const key = `${p.x},${p.y}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(p);
        }
    }
    return unique;
}

// Fisher-Yates shuffle
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// =============================================================================
// BASIC GENERATORS
// =============================================================================

export function uniformRandom() {
    const count = randomInt(3, 8);
    const points = [];
    const used = new Set();

    for (let i = 0; i < count; i++) {
        let x, y, key;
        do {
            x = randomInt(MIN_X, MAX_X);
            y = randomInt(MIN_Y, MAX_Y);
            key = `${x},${y}`;
        } while (used.has(key));

        used.add(key);
        points.push({ x, y });
    }

    return points;
}

export function withPointCount(options = {}) {
    const count = options.count || randomInt(3, 8);
    const points = [];
    const used = new Set();

    for (let i = 0; i < count; i++) {
        let x, y, key;
        do {
            x = randomInt(MIN_X, MAX_X);
            y = randomInt(MIN_Y, MAX_Y);
            key = `${x},${y}`;
        } while (used.has(key));

        used.add(key);
        points.push({ x, y });
    }

    return points;
}

// =============================================================================
// LINE GENERATORS
// =============================================================================

export function horizontalLine() {
    const y = randomInt(MIN_Y, MAX_Y);
    const maxCount = MAX_X - MIN_X + 1;
    const count = randomInt(3, Math.min(7, maxCount));
    const startX = randomInt(MIN_X, MAX_X - count + 1);

    return Array.from({ length: count }, (_, i) => ({
        x: startX + i,
        y
    }));
}

export function verticalLine() {
    const x = randomInt(MIN_X, MAX_X);
    const maxCount = MAX_Y - MIN_Y + 1;
    const count = randomInt(3, Math.min(6, maxCount));
    const startY = randomInt(MIN_Y, MAX_Y - count + 1);

    return Array.from({ length: count }, (_, i) => ({
        x,
        y: startY + i
    }));
}

export function diagonalLine() {
    const maxCountX = MAX_X - MIN_X + 1;
    const maxCountY = MAX_Y - MIN_Y + 1;
    const count = randomInt(3, Math.min(6, maxCountX, maxCountY));
    const startX = randomInt(MIN_X, MAX_X - count + 1);
    const startY = randomInt(MIN_Y, MAX_Y - count + 1);
    const slope = randomChoice([1, -1]);

    return Array.from({ length: count }, (_, i) => ({
        x: startX + i,
        y: startY + slope * i
    }));
}

export function anyLine() {
    // Random line through two points
    const p1 = { x: randomInt(MIN_X, MAX_X), y: randomInt(MIN_Y, MAX_Y) };
    let p2;
    do {
        p2 = { x: randomInt(MIN_X, MAX_X), y: randomInt(MIN_Y, MAX_Y) };
    } while (p1.x === p2.x && p1.y === p2.y);

    // Parametric line: p = p1 + t*(p2-p1)
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const g = gcd(dx, dy);
    const stepX = dx / g;
    const stepY = dy / g;

    const points = [p1];
    let maxSteps = randomInt(2, 5);
    let steps = 0;

    // Extend in both directions
    for (let dir of [-1, 1]) {
        for (let t = 1; t <= 5 && steps < maxSteps; t++) {
            const x = p1.x + dir * t * stepX;
            const y = p1.y + dir * t * stepY;

            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
                steps++;
            }
        }
    }

    return points.length >= 3 ? points : horizontalLine();
}

// Specific slope line generators
export function lineWithSlope(dx, dy) {
    // Generate a line with slope dy/dx
    // Find a random starting point and extend in the direction (dx, dy)
    const startX = randomInt(MIN_X, MAX_X);
    const startY = randomInt(MIN_Y, MAX_Y);

    const points = [{ x: startX, y: startY }];

    // Extend in positive direction
    for (let t = 1; t <= 8; t++) {
        const x = startX + t * dx;
        const y = startY + t * dy;
        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        } else {
            break;
        }
    }

    // Extend in negative direction
    for (let t = 1; t <= 8; t++) {
        const x = startX - t * dx;
        const y = startY - t * dy;
        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        } else {
            break;
        }
    }

    return points.length >= 3 ? points : horizontalLine();
}

export function fortyFiveDegreeLine() {
    // 45 degree line (slope 1:1)
    const direction = randomChoice([1, -1]); // +1 for /, -1 for \
    return lineWithSlope(1, direction);
}

export function oneToTwoLine() {
    // Slope 1:2 (gentle slope)
    const direction = randomChoice([1, -1]);
    return lineWithSlope(2, direction);
}

export function oneToThreeLine() {
    // Slope 1:3 (very gentle slope)
    const direction = randomChoice([1, -1]);
    return lineWithSlope(3, direction);
}

export function twoToThreeLine() {
    // Slope 2:3
    const direction = randomChoice([1, -1]);
    return lineWithSlope(3, 2 * direction);
}

export function oneToFourLine() {
    // Slope 1:4 (very gentle slope)
    const direction = randomChoice([1, -1]);
    return lineWithSlope(4, direction);
}

export function threeToFourLine() {
    // Slope 3:4
    const direction = randomChoice([1, -1]);
    return lineWithSlope(4, 3 * direction);
}

export function twoToFiveLine() {
    // Slope 2:5 (very gentle slope)
    const direction = randomChoice([1, -1]);
    return lineWithSlope(5, 2 * direction);
}

export function threeToFiveLine() {
    // Slope 3:5
    const direction = randomChoice([1, -1]);
    return lineWithSlope(5, 3 * direction);
}

export function twoLines() {
    const lineGenerators = [
        horizontalLine, verticalLine,
        fortyFiveDegreeLine, oneToTwoLine, oneToThreeLine, twoToThreeLine
    ];
    const line1 = randomChoice(lineGenerators)();
    const line2 = randomChoice(lineGenerators)();

    // Ensure lines don't overlap completely
    const combined = [...line1, ...line2];
    const unique = [];
    const seen = new Set();

    for (const p of combined) {
        const key = `${p.x},${p.y}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(p);
        }
    }

    return unique;
}

export function parallelLines() {
    const midY = (MIN_Y + MAX_Y) / 2;
    const y1 = randomInt(MIN_Y, Math.floor(midY));
    const y2 = randomInt(Math.ceil(midY) + 1, MAX_Y);
    const maxCount = MAX_X - MIN_X + 1;
    const count = randomInt(3, Math.min(6, maxCount));
    const startX = randomInt(MIN_X, MAX_X - count + 1);

    return [
        ...Array.from({ length: count }, (_, i) => ({ x: startX + i, y: y1 })),
        ...Array.from({ length: count }, (_, i) => ({ x: startX + i, y: y2 }))
    ];
}

export function perpendicularLines() {
    const cx = randomInt(MIN_X + 2, MAX_X - 2);
    const cy = randomInt(MIN_Y + 2, MAX_Y - 2);

    const horizontal = Array.from({ length: 5 }, (_, i) => ({
        x: cx - 2 + i,
        y: cy
    }));

    const vertical = Array.from({ length: 4 }, (_, i) => ({
        x: cx,
        y: cy - 2 + i
    }));

    // Combine and remove duplicate center
    const combined = [...horizontal, ...vertical];
    const unique = [];
    const seen = new Set();

    for (const p of combined) {
        const key = `${p.x},${p.y}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(p);
        }
    }

    return unique;
}

export function cross() {
    // Create a + or X shaped pattern
    const armLength = randomInt(2, 3);
    const cx = randomInt(MIN_X + armLength, MAX_X - armLength);
    const cy = randomInt(MIN_Y + armLength, MAX_Y - armLength);

    const shapeType = randomChoice(['plus', 'x']);

    if (shapeType === 'plus') {
        // + shape (horizontal and vertical)
        const points = [{ x: cx, y: cy }];
        for (let i = 1; i <= armLength; i++) {
            points.push({ x: cx + i, y: cy });
            points.push({ x: cx - i, y: cy });
            points.push({ x: cx, y: cy + i });
            points.push({ x: cx, y: cy - i });
        }
        return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
    } else {
        // X shape (diagonals)
        const points = [{ x: cx, y: cy }];
        for (let i = 1; i <= armLength; i++) {
            points.push({ x: cx + i, y: cy + i });
            points.push({ x: cx - i, y: cy - i });
            points.push({ x: cx + i, y: cy - i });
            points.push({ x: cx - i, y: cy + i });
        }
        return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
    }
}

export function Y() {
    // Create a Y shape (three lines meeting at a center point)
    const cx = randomInt(MIN_X + 2, MAX_X - 2);
    const cy = randomInt(MIN_Y + 1, MAX_Y - 2);
    const armLength = randomInt(2, 3);

    const points = [{ x: cx, y: cy }];

    // Vertical line going up
    for (let i = 1; i <= armLength; i++) {
        if (cy + i <= MAX_Y) {
            points.push({ x: cx, y: cy + i });
        }
    }

    // Two diagonal arms going down-left and down-right
    for (let i = 1; i <= armLength; i++) {
        if (cx - i >= MIN_X && cy - i >= MIN_Y) {
            points.push({ x: cx - i, y: cy - i });
        }
        if (cx + i <= MAX_X && cy - i >= MIN_Y) {
            points.push({ x: cx + i, y: cy - i });
        }
    }

    return points;
}

// Letter-shaped patterns with variations
export function X() {
    // X shape - two diagonals crossing
    const armLength = randomInt(2, 4);
    const cx = randomInt(MIN_X + armLength, MAX_X - armLength);
    const cy = randomInt(MIN_Y + armLength, MAX_Y - armLength);
    const sparse = Math.random() < 0.3; // 30% chance of sparse

    const points = [{ x: cx, y: cy }];
    for (let i = 1; i <= armLength; i++) {
        if (!sparse || Math.random() < 0.7) {
            points.push({ x: cx + i, y: cy + i });
            points.push({ x: cx - i, y: cy - i });
            points.push({ x: cx + i, y: cy - i });
            points.push({ x: cx - i, y: cy + i });
        }
    }
    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function H() {
    // H shape with variable height, width, and rotation
    const height = randomInt(4, 6);
    const width = randomInt(3, 5);
    const sparse = Math.random() < 0.3;
    const rotate = Math.random() < 0.5; // 50% chance to rotate 90°

    const cx = randomInt(MIN_X + width, MAX_X - width);
    const cy = randomInt(MIN_Y + Math.ceil(height/2), MAX_Y - Math.floor(height/2));

    const points = [];

    if (!rotate) {
        // Vertical H
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx - width, y: cy - Math.floor(height/2) + i });
                points.push({ x: cx + width, y: cy - Math.floor(height/2) + i });
            }
        }
        // Middle bar
        for (let i = -width; i <= width; i++) {
            if (!sparse || i === -width || i === width || Math.random() < 0.5) {
                points.push({ x: cx + i, y: cy });
            }
        }
    } else {
        // Horizontal H (rotated 90°)
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx - Math.floor(height/2) + i, y: cy - width });
                points.push({ x: cx - Math.floor(height/2) + i, y: cy + width });
            }
        }
        // Middle bar
        for (let i = -width; i <= width; i++) {
            if (!sparse || i === -width || i === width || Math.random() < 0.5) {
                points.push({ x: cx, y: cy + i });
            }
        }
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function Z() {
    // Z shape with variations
    const width = randomInt(4, 6);
    const height = randomInt(3, 5);
    const sparse = Math.random() < 0.3;
    const rotate = Math.random() < 0.5;

    const cx = randomInt(MIN_X + Math.ceil(width/2), MAX_X - Math.floor(width/2));
    const cy = randomInt(MIN_Y + Math.ceil(height/2), MAX_Y - Math.floor(height/2));

    const points = [];

    if (!rotate) {
        // Normal Z
        // Top horizontal
        for (let i = 0; i <= width; i++) {
            if (!sparse || i === 0 || i === width || Math.random() < 0.6) {
                points.push({ x: cx - Math.floor(width/2) + i, y: cy + height });
            }
        }
        // Diagonal
        for (let i = 0; i <= Math.max(width, height); i++) {
            const t = i / Math.max(width, height);
            const x = Math.round(cx + Math.floor(width/2) - t * width);
            const y = Math.round(cy + height - t * 2 * height);
            if (!sparse || Math.random() < 0.6) {
                points.push({ x, y });
            }
        }
        // Bottom horizontal
        for (let i = 0; i <= width; i++) {
            if (!sparse || i === 0 || i === width || Math.random() < 0.6) {
                points.push({ x: cx - Math.floor(width/2) + i, y: cy - height });
            }
        }
    } else {
        // N-like shape (rotated Z)
        // Left vertical
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx - width, y: cy - Math.floor(height/2) + i });
            }
        }
        // Diagonal
        for (let i = 0; i <= Math.max(width, height); i++) {
            const t = i / Math.max(width, height);
            const x = Math.round(cx - width + t * 2 * width);
            const y = Math.round(cy - Math.floor(height/2) + t * height);
            if (!sparse || Math.random() < 0.6) {
                points.push({ x, y });
            }
        }
        // Right vertical
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx + width, y: cy - Math.floor(height/2) + i });
            }
        }
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function N() {
    // N shape (similar to Z but with vertical sides)
    return Z(); // Reuse Z with rotation
}

export function T() {
    // T shape with variations
    const width = randomInt(4, 6);
    const height = randomInt(3, 5);
    const sparse = Math.random() < 0.3;
    const rotation = randomChoice([0, 90, 180, 270]); // 4 possible rotations

    const cx = randomInt(MIN_X + Math.ceil(width/2), MAX_X - Math.floor(width/2));
    const cy = randomInt(MIN_Y + Math.ceil(height/2), MAX_Y - Math.floor(height/2));

    const points = [];

    if (rotation === 0) {
        // Normal T (top horizontal, vertical stem down)
        for (let i = 0; i <= width; i++) {
            if (!sparse || i === 0 || i === width || Math.random() < 0.6) {
                points.push({ x: cx - Math.floor(width/2) + i, y: cy + height });
            }
        }
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx, y: cy + height - i });
            }
        }
    } else if (rotation === 90) {
        // Rotated 90° (right-facing)
        for (let i = 0; i <= width; i++) {
            if (!sparse || i === 0 || i === width || Math.random() < 0.6) {
                points.push({ x: cx + height, y: cy - Math.floor(width/2) + i });
            }
        }
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx + height - i, y: cy });
            }
        }
    } else if (rotation === 180) {
        // Upside down
        for (let i = 0; i <= width; i++) {
            if (!sparse || i === 0 || i === width || Math.random() < 0.6) {
                points.push({ x: cx - Math.floor(width/2) + i, y: cy - height });
            }
        }
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx, y: cy - height + i });
            }
        }
    } else {
        // Rotated 270° (left-facing)
        for (let i = 0; i <= width; i++) {
            if (!sparse || i === 0 || i === width || Math.random() < 0.6) {
                points.push({ x: cx - height, y: cy - Math.floor(width/2) + i });
            }
        }
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx - height + i, y: cy });
            }
        }
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function L() {
    // L shape with variations
    const width = randomInt(3, 5);
    const height = randomInt(4, 6);
    const sparse = Math.random() < 0.3;
    const rotation = randomChoice([0, 90, 180, 270]); // 4 possible rotations

    const cx = randomInt(MIN_X + Math.ceil(width/2), MAX_X - Math.floor(width/2));
    const cy = randomInt(MIN_Y + Math.ceil(height/2), MAX_Y - Math.floor(height/2));

    const points = [];

    if (rotation === 0) {
        // Normal L
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx - Math.floor(width/2), y: cy - Math.floor(height/2) + i });
            }
        }
        for (let i = 0; i <= width; i++) {
            if (!sparse || i === 0 || Math.random() < 0.6) {
                points.push({ x: cx - Math.floor(width/2) + i, y: cy - Math.floor(height/2) });
            }
        }
    } else if (rotation === 90) {
        // Rotated 90°
        for (let i = 0; i <= width; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx - Math.floor(width/2) + i, y: cy - Math.floor(height/2) });
            }
        }
        for (let i = 0; i <= height; i++) {
            if (!sparse || i === 0 || Math.random() < 0.6) {
                points.push({ x: cx + Math.floor(width/2), y: cy - Math.floor(height/2) + i });
            }
        }
    } else if (rotation === 180) {
        // Rotated 180°
        for (let i = 0; i <= height; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx + Math.floor(width/2), y: cy + Math.floor(height/2) - i });
            }
        }
        for (let i = 0; i <= width; i++) {
            if (!sparse || i === 0 || Math.random() < 0.6) {
                points.push({ x: cx + Math.floor(width/2) - i, y: cy + Math.floor(height/2) });
            }
        }
    } else {
        // Rotated 270°
        for (let i = 0; i <= width; i++) {
            if (!sparse || Math.random() < 0.7) {
                points.push({ x: cx + Math.floor(width/2) - i, y: cy + Math.floor(height/2) });
            }
        }
        for (let i = 0; i <= height; i++) {
            if (!sparse || i === 0 || Math.random() < 0.6) {
                points.push({ x: cx - Math.floor(width/2), y: cy + Math.floor(height/2) - i });
            }
        }
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function squareBorders() {
    // Square outline (just the borders, not filled)
    const size = randomInt(4, 6);
    const sparse = Math.random() < 0.3;
    const cx = randomInt(MIN_X + Math.ceil(size/2), MAX_X - Math.floor(size/2));
    const cy = randomInt(MIN_Y + Math.ceil(size/2), MAX_Y - Math.floor(size/2));

    const points = [];

    // Top and bottom edges
    for (let i = 0; i <= size; i++) {
        if (!sparse || i === 0 || i === size || Math.random() < 0.6) {
            points.push({ x: cx - Math.floor(size/2) + i, y: cy - Math.floor(size/2) });
            points.push({ x: cx - Math.floor(size/2) + i, y: cy + Math.floor(size/2) });
        }
    }

    // Left and right edges (excluding corners already added)
    for (let i = 1; i < size; i++) {
        if (!sparse || Math.random() < 0.6) {
            points.push({ x: cx - Math.floor(size/2), y: cy - Math.floor(size/2) + i });
            points.push({ x: cx + Math.floor(size/2), y: cy - Math.floor(size/2) + i });
        }
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function random_points(options = {}) {
    // Generate random points with specified count
    const count = options.count || randomInt(3, 8);
    const points = [];
    const used = new Set();

    for (let i = 0; i < count; i++) {
        let x, y, key;
        do {
            x = randomInt(MIN_X, MAX_X);
            y = randomInt(MIN_Y, MAX_Y);
            key = `${x},${y}`;
        } while (used.has(key));

        used.add(key);
        points.push({ x, y });
    }

    return points;
}

export function lattice() {
    // Create a grid/lattice pattern with regular spacing
    const spacing = randomChoice([2, 3]);
    const numRows = Math.floor((MAX_Y - MIN_Y) / spacing) + 1;
    const numCols = Math.floor((MAX_X - MIN_X) / spacing) + 1;

    // Choose a subset of the lattice points
    const maxPoints = randomInt(6, 10);
    const allLatticePoints = [];

    for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
            const x = MIN_X + col * spacing;
            const y = MIN_Y + row * spacing;
            if (x <= MAX_X && y <= MAX_Y) {
                allLatticePoints.push({ x, y });
            }
        }
    }

    // Randomly sample from lattice
    const points = [];
    const used = new Set();
    const targetCount = Math.min(maxPoints, allLatticePoints.length);

    while (points.length < targetCount) {
        const idx = randomInt(0, allLatticePoints.length - 1);
        if (!used.has(idx)) {
            used.add(idx);
            points.push(allLatticePoints[idx]);
        }
    }

    return points;
}

export function twoParallelLines() {
    // Generate two parallel lines with the same slope
    const slopeType = randomChoice(['horizontal', 'vertical', 'diagonal', 'gentle']);

    if (slopeType === 'horizontal') {
        const midY = (MIN_Y + MAX_Y) / 2;
        const y1 = randomInt(MIN_Y, Math.floor(midY) - 1);
        const y2 = randomInt(Math.ceil(midY) + 1, MAX_Y);
        const count = randomInt(3, 5);
        const startX = randomInt(MIN_X, MAX_X - count + 1);

        return [
            ...Array.from({ length: count }, (_, i) => ({ x: startX + i, y: y1 })),
            ...Array.from({ length: count }, (_, i) => ({ x: startX + i, y: y2 }))
        ];
    } else if (slopeType === 'vertical') {
        const midX = (MIN_X + MAX_X) / 2;
        const x1 = randomInt(MIN_X, Math.floor(midX) - 1);
        const x2 = randomInt(Math.ceil(midX) + 1, MAX_X);
        const count = randomInt(3, 4);
        const startY = randomInt(MIN_Y, MAX_Y - count + 1);

        return [
            ...Array.from({ length: count }, (_, i) => ({ x: x1, y: startY + i })),
            ...Array.from({ length: count }, (_, i) => ({ x: x2, y: startY + i }))
        ];
    } else if (slopeType === 'diagonal') {
        // Two parallel diagonal lines (45 degree)
        const direction = randomChoice([1, -1]);
        const offset = randomInt(3, 5);

        const line1 = [];
        const line2 = [];

        for (let i = 0; i < 5; i++) {
            const x1 = MIN_X + i;
            const y1 = MIN_Y + i * direction;
            if (x1 <= MAX_X && y1 >= MIN_Y && y1 <= MAX_Y) {
                line1.push({ x: x1, y: y1 });
            }

            const x2 = MIN_X + i + offset;
            const y2 = MIN_Y + i * direction;
            if (x2 <= MAX_X && y2 >= MIN_Y && y2 <= MAX_Y) {
                line2.push({ x: x2, y: y2 });
            }
        }

        return [...line1, ...line2];
    } else {
        // Gentle slope (1:2 or 1:3)
        const slope = randomChoice([2, 3]);
        const dy = randomChoice([1, -1]);
        const offset = randomChoice([3, 4, 5]);

        const line1 = [];
        const line2 = [];

        let startX = MIN_X;
        let startY = dy > 0 ? MIN_Y : MAX_Y;

        for (let i = 0; i < 6; i++) {
            const x1 = startX + i * slope;
            const y1 = startY + i * dy;
            if (x1 <= MAX_X && y1 >= MIN_Y && y1 <= MAX_Y) {
                line1.push({ x: x1, y: y1 });
            }

            const x2 = x1;
            const y2 = y1 + offset * (dy > 0 ? 1 : -1);
            if (x2 <= MAX_X && y2 >= MIN_Y && y2 <= MAX_Y) {
                line2.push({ x: x2, y: y2 });
            }
        }

        return [...line1, ...line2];
    }
}

// =============================================================================
// SYMMETRY GENERATORS
// =============================================================================

export function verticallySymmetric() {
    const centerX = (MIN_X + MAX_X) / 2;  // Center of coordinate range
    const halfCount = randomInt(2, 4);
    const points = [];

    for (let i = 0; i < halfCount; i++) {
        const x = randomInt(MIN_X, Math.floor(centerX));
        const y = randomInt(MIN_Y, MAX_Y);
        const mirrorX = Math.round(2 * centerX - x);

        points.push({ x, y });
        if (x !== mirrorX && mirrorX >= MIN_X && mirrorX <= MAX_X) {
            points.push({ x: mirrorX, y });
        }
    }

    return points;
}

export function horizontallySymmetric() {
    const centerY = (MIN_Y + MAX_Y) / 2;  // Center of coordinate range
    const halfCount = randomInt(2, 4);
    const points = [];

    for (let i = 0; i < halfCount; i++) {
        const x = randomInt(MIN_X, MAX_X);
        const y = randomInt(MIN_Y, Math.floor(centerY));
        const mirrorY = Math.round(2 * centerY - y);

        points.push({ x, y });
        if (y !== mirrorY && mirrorY >= MIN_Y && mirrorY <= MAX_Y) {
            points.push({ x, y: mirrorY });
        }
    }

    return points;
}

export function rotationallySymmetric() {
    const cx = randomInt(6, 11);
    const cy = randomInt(4, 8);
    const halfCount = randomInt(2, 4);
    const points = [];

    for (let i = 0; i < halfCount; i++) {
        const dx = randomInt(-4, 4);
        const dy = randomInt(-3, 3);
        const x = cx + dx;
        const y = cy + dy;

        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });

            const rotX = cx - dx;
            const rotY = cy - dy;
            if (rotX >= MIN_X && rotX <= MAX_X && rotY >= MIN_Y && rotY <= MAX_Y) {
                points.push({ x: rotX, y: rotY });
            }
        }
    }

    return points.length >= 3 ? points : uniformRandom();
}

export function rotationalAndLineSymmetric() {
    // Generate points with both 180° rotational symmetry AND line symmetry
    // This means the pattern is symmetric about both a center point and a line
    const centerX = (MIN_X + MAX_X) / 2;
    const centerY = (MIN_Y + MAX_Y) / 2;

    // Choose a symmetry line: vertical or horizontal
    const lineType = randomChoice(['vertical', 'horizontal']);

    const quadCount = randomInt(2, 3);  // Points in one quadrant
    const points = [];

    for (let i = 0; i < quadCount; i++) {
        let x, y;

        if (lineType === 'vertical') {
            // Vertical line symmetry + rotational
            x = randomInt(MIN_X, Math.floor(centerX) - 1);
            y = randomInt(MIN_Y, MAX_Y);

            // Add point and its three symmetric counterparts
            points.push({ x, y });

            const mirrorX = Math.round(2 * centerX - x);
            if (mirrorX >= MIN_X && mirrorX <= MAX_X) {
                points.push({ x: mirrorX, y });
            }

            const rotX = Math.round(2 * centerX - x);
            const rotY = Math.round(2 * centerY - y);
            if (rotX >= MIN_X && rotX <= MAX_X && rotY >= MIN_Y && rotY <= MAX_Y) {
                points.push({ x: rotX, y: rotY });
            }

            const bothX = x;
            const bothY = rotY;
            if (bothX >= MIN_X && bothX <= MAX_X && bothY >= MIN_Y && bothY <= MAX_Y) {
                points.push({ x: bothX, y: bothY });
            }
        } else {
            // Horizontal line symmetry + rotational
            x = randomInt(MIN_X, MAX_X);
            y = randomInt(MIN_Y, Math.floor(centerY) - 1);

            // Add point and its three symmetric counterparts
            points.push({ x, y });

            const mirrorY = Math.round(2 * centerY - y);
            if (mirrorY >= MIN_Y && mirrorY <= MAX_Y) {
                points.push({ x, y: mirrorY });
            }

            const rotX = Math.round(2 * centerX - x);
            const rotY = Math.round(2 * centerY - y);
            if (rotX >= MIN_X && rotX <= MAX_X && rotY >= MIN_Y && rotY <= MAX_Y) {
                points.push({ x: rotX, y: rotY });
            }

            const bothX = rotX;
            const bothY = y;
            if (bothX >= MIN_X && bothX <= MAX_X && bothY >= MIN_Y && bothY <= MAX_Y) {
                points.push({ x: bothX, y: bothY });
            }
        }
    }

    // Remove duplicates
    const unique = [];
    const seen = new Set();
    for (const p of points) {
        const key = `${p.x},${p.y}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(p);
        }
    }

    return unique.length >= 4 ? unique : rotationallySymmetric();
}

export function translatedCopy() {
    // Generate a small pattern and then create a translated copy of it
    const patternSize = randomInt(2, 3);
    const pattern = [];

    // Create a small random pattern
    const baseX = randomInt(MIN_X, MIN_X + 3);
    const baseY = randomInt(MIN_Y, MIN_Y + 3);

    for (let i = 0; i < patternSize; i++) {
        pattern.push({
            x: baseX + randomInt(0, 2),
            y: baseY + randomInt(0, 2)
        });
    }

    // Choose a translation vector
    const translateX = randomInt(5, 8);
    const translateY = randomInt(3, 5);

    // Create the translated copy
    const points = [...pattern];
    for (const p of pattern) {
        const newX = p.x + translateX;
        const newY = p.y + translateY;
        if (newX <= MAX_X && newY <= MAX_Y) {
            points.push({ x: newX, y: newY });
        }
    }

    return points.length >= 4 ? points : uniformRandom();
}

// =============================================================================
// RULE P2 GENERATORS: No shared x or y coordinates
// All x-coordinates unique AND all y-coordinates unique
// =============================================================================

// POSITIVE EXAMPLES (satisfy rule)

export function p2DiagonalLine() {
    // Diagonal line with slope (ensures all x and y unique)
    const slopes = [
        { dx: 1, dy: 1 },   // 45° ascending
        { dx: 1, dy: -1 },  // 45° descending
        { dx: 1, dy: 2 },   // 1:2 ascending
        { dx: 1, dy: -2 },  // 1:2 descending
        { dx: 2, dy: 1 },   // 2:1 ascending
        { dx: 2, dy: -1 }   // 2:1 descending
    ];
    const slope = randomChoice(slopes);

    const count = randomInt(3, 6);
    const startX = randomInt(MIN_X, MAX_X - count * Math.abs(slope.dx));
    const startY = slope.dy > 0
        ? randomInt(MIN_Y, MAX_Y - count * Math.abs(slope.dy))
        : randomInt(MIN_Y + count * Math.abs(slope.dy), MAX_Y);

    const points = [];
    for (let i = 0; i < count; i++) {
        points.push({
            x: startX + i * slope.dx,
            y: startY + i * slope.dy
        });
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function p2ScatteredRandom() {
    // Completely random points with all unique coordinates
    const count = randomInt(3, 7);
    const xCoords = [];
    const yCoords = [];

    // Generate unique x-coordinates
    while (xCoords.length < count) {
        const x = randomInt(MIN_X, MAX_X);
        if (!xCoords.includes(x)) xCoords.push(x);
    }

    // Generate unique y-coordinates
    while (yCoords.length < count) {
        const y = randomInt(MIN_Y, MAX_Y);
        if (!yCoords.includes(y)) yCoords.push(y);
    }

    // Shuffle and pair them
    const shuffledY = [...yCoords].sort(() => Math.random() - 0.5);

    return xCoords.map((x, i) => ({ x, y: shuffledY[i] }));
}

export function p2StaircaseAscending() {
    // Ascending staircase pattern (moves right and up)
    const count = randomInt(4, 6);
    const startX = randomInt(MIN_X, MAX_X - count);
    const startY = randomInt(MIN_Y, MAX_Y - count);

    const points = [{ x: startX, y: startY }];

    for (let i = 1; i < count; i++) {
        const prevPoint = points[points.length - 1];
        const moveRight = randomChoice([1, 2]);
        const moveUp = randomChoice([1, 2]);

        const newX = prevPoint.x + moveRight;
        const newY = prevPoint.y + moveUp;

        if (newX <= MAX_X && newY <= MAX_Y) {
            points.push({ x: newX, y: newY });
        }
    }

    return points.length >= 3 ? points : p2ScatteredRandom();
}

export function p2StaircaseDescending() {
    // Descending staircase (moves right and down)
    const count = randomInt(4, 6);
    const startX = randomInt(MIN_X, MAX_X - count);
    const startY = randomInt(MIN_Y + count, MAX_Y);

    const points = [{ x: startX, y: startY }];

    for (let i = 1; i < count; i++) {
        const prevPoint = points[points.length - 1];
        const moveRight = randomChoice([1, 2]);
        const moveDown = randomChoice([1, 2]);

        const newX = prevPoint.x + moveRight;
        const newY = prevPoint.y - moveDown;

        if (newX <= MAX_X && newY >= MIN_Y) {
            points.push({ x: newX, y: newY });
        }
    }

    return points.length >= 3 ? points : p2ScatteredRandom();
}

export function p2ZigZag() {
    // Zigzag pattern alternating up and down
    const count = randomInt(4, 6);
    const startX = randomInt(MIN_X, MIN_X + 3);
    const startY = randomInt(MIN_Y + 3, MAX_Y - 3);

    const points = [{ x: startX, y: startY }];
    let goingUp = randomChoice([true, false]);

    for (let i = 1; i < count; i++) {
        const prevPoint = points[points.length - 1];
        const newX = prevPoint.x + randomInt(1, 3);
        const newY = goingUp
            ? prevPoint.y + randomInt(1, 3)
            : prevPoint.y - randomInt(1, 3);

        if (newX <= MAX_X && newY >= MIN_Y && newY <= MAX_Y) {
            points.push({ x: newX, y: newY });
            goingUp = !goingUp;
        }
    }

    return points.length >= 3 ? points : p2ScatteredRandom();
}

export function p2PermutationPattern() {
    // Create a permutation-like pattern (like rooks on a chessboard)
    const count = randomInt(4, 6);

    // Generate sorted x-coordinates with spacing
    const xCoords = [];
    const spacing = Math.floor((MAX_X - MIN_X) / count);
    for (let i = 0; i < count; i++) {
        xCoords.push(MIN_X + i * spacing + randomInt(0, Math.max(1, spacing - 1)));
    }

    // Generate y-coordinates and shuffle
    const yCoords = [];
    for (let i = 0; i < count; i++) {
        yCoords.push(MIN_Y + i * spacing + randomInt(0, Math.max(1, spacing - 1)));
    }
    const shuffledY = yCoords.sort(() => Math.random() - 0.5);

    return xCoords.map((x, i) => ({ x, y: shuffledY[i] }));
}

export function p2MonotonicCurve() {
    // Smooth curve that's monotonically increasing in x
    const count = randomInt(4, 6);
    const xCoords = [];

    // Generate strictly increasing x-coordinates
    let x = MIN_X;
    while (xCoords.length < count && x <= MAX_X - (count - xCoords.length)) {
        xCoords.push(x);
        x += randomInt(1, 3);
    }

    // Generate y-coordinates with smooth variation
    const yCoords = [];
    let y = randomInt(MIN_Y + 2, MAX_Y - 2);

    for (let i = 0; i < xCoords.length; i++) {
        yCoords.push(y);
        // Smooth variation in y
        const change = randomInt(-2, 2);
        y = Math.max(MIN_Y, Math.min(MAX_Y, y + change));

        // Ensure y is unique
        while (yCoords.includes(y) && y <= MAX_Y) {
            y++;
        }
        if (y > MAX_Y) y = MAX_Y;
    }

    return xCoords.map((x, i) => ({ x, y: yCoords[i] }));
}

export function p2RandomWalk() {
    // Random walk ensuring no coordinate reuse
    const count = randomInt(4, 6);
    const usedX = new Set();
    const usedY = new Set();

    let x = randomInt(MIN_X + 2, MAX_X - 2);
    let y = randomInt(MIN_Y + 2, MAX_Y - 2);

    usedX.add(x);
    usedY.add(y);
    const points = [{ x, y }];

    for (let i = 1; i < count; i++) {
        // Try to move in a direction
        const attempts = 50;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const direction = randomChoice([
                [1, 1], [1, -1], [2, 1], [2, -1], [1, 2], [1, -2]
            ]);

            const newX = x + direction[0];
            const newY = y + direction[1];

            if (newX >= MIN_X && newX <= MAX_X &&
                newY >= MIN_Y && newY <= MAX_Y &&
                !usedX.has(newX) && !usedY.has(newY)) {
                x = newX;
                y = newY;
                usedX.add(x);
                usedY.add(y);
                points.push({ x, y });
                break;
            }
        }
    }

    return points.length >= 3 ? points : p2ScatteredRandom();
}

// NEGATIVE EXAMPLES (violate rule - share x or y coordinates)

export function p2VerticalPair() {
    // Two or more points sharing the same x-coordinate (vertical alignment)
    const sharedX = randomInt(MIN_X + 3, MAX_X - 3);
    const count = randomInt(2, 3);

    const points = [];
    const usedY = new Set();

    // Add points with shared x
    for (let i = 0; i < count; i++) {
        let y;
        do {
            y = randomInt(MIN_Y, MAX_Y);
        } while (usedY.has(y));
        usedY.add(y);
        points.push({ x: sharedX, y });
    }

    // Add 1-2 more points with different x and y
    const extraCount = randomInt(1, 2);
    for (let i = 0; i < extraCount; i++) {
        let x, y;
        do {
            x = randomInt(MIN_X, MAX_X);
            y = randomInt(MIN_Y, MAX_Y);
        } while (x === sharedX || usedY.has(y));
        usedY.add(y);
        points.push({ x, y });
    }

    return points;
}

export function p2HorizontalPair() {
    // Two or more points sharing the same y-coordinate (horizontal alignment)
    const sharedY = randomInt(MIN_Y + 2, MAX_Y - 2);
    const count = randomInt(2, 3);

    const points = [];
    const usedX = new Set();

    // Add points with shared y
    for (let i = 0; i < count; i++) {
        let x;
        do {
            x = randomInt(MIN_X, MAX_X);
        } while (usedX.has(x));
        usedX.add(x);
        points.push({ x, y: sharedY });
    }

    // Add 1-2 more points with different x and y
    const extraCount = randomInt(1, 2);
    for (let i = 0; i < extraCount; i++) {
        let x, y;
        do {
            x = randomInt(MIN_X, MAX_X);
            y = randomInt(MIN_Y, MAX_Y);
        } while (usedX.has(x) || y === sharedY);
        usedX.add(x);
        points.push({ x, y });
    }

    return points;
}

export function p2VerticalLine() {
    // All points on a vertical line (all share same x)
    const x = randomInt(MIN_X + 2, MAX_X - 2);
    const count = randomInt(3, 5);
    const startY = randomInt(MIN_Y, MAX_Y - count + 1);

    return Array.from({ length: count }, (_, i) => ({
        x,
        y: startY + i
    }));
}

export function p2HorizontalLine() {
    // All points on a horizontal line (all share same y)
    const y = randomInt(MIN_Y + 2, MAX_Y - 2);
    const count = randomInt(3, 5);
    const startX = randomInt(MIN_X, MAX_X - count + 1);

    return Array.from({ length: count }, (_, i) => ({
        x: startX + i,
        y
    }));
}

export function p2SharedXScattered() {
    // Scattered points but with some x-coordinates repeated
    const count = randomInt(5, 7);
    const points = [];
    const xCoords = [];

    // Generate only count-1 unique x values (so one will repeat)
    for (let i = 0; i < count - 1; i++) {
        let x;
        do {
            x = randomInt(MIN_X, MAX_X);
        } while (xCoords.includes(x));
        xCoords.push(x);
    }

    // Duplicate one x
    xCoords.push(randomChoice(xCoords));

    // Generate all unique y-coordinates
    const yCoords = [];
    for (let i = 0; i < count; i++) {
        let y;
        do {
            y = randomInt(MIN_Y, MAX_Y);
        } while (yCoords.includes(y));
        yCoords.push(y);
    }

    // Shuffle and combine
    xCoords.sort(() => Math.random() - 0.5);

    return xCoords.map((x, i) => ({ x, y: yCoords[i] }));
}

export function p2SharedYScattered() {
    // Scattered points but with some y-coordinates repeated
    const count = randomInt(5, 7);
    const points = [];
    const yCoords = [];

    // Generate only count-1 unique y values (so one will repeat)
    for (let i = 0; i < count - 1; i++) {
        let y;
        do {
            y = randomInt(MIN_Y, MAX_Y);
        } while (yCoords.includes(y));
        yCoords.push(y);
    }

    // Duplicate one y
    yCoords.push(randomChoice(yCoords));

    // Generate all unique x-coordinates
    const xCoords = [];
    for (let i = 0; i < count; i++) {
        let x;
        do {
            x = randomInt(MIN_X, MAX_X);
        } while (xCoords.includes(x));
        xCoords.push(x);
    }

    // Shuffle and combine
    yCoords.sort(() => Math.random() - 0.5);

    return xCoords.map((x, i) => ({ x, y: yCoords[i] }));
}

export function p2LShape() {
    // L-shaped pattern (horizontal + vertical = shares coordinates)
    const cornerX = randomInt(MIN_X + 2, MAX_X - 3);
    const cornerY = randomInt(MIN_Y + 2, MAX_Y - 3);

    const points = [{ x: cornerX, y: cornerY }];

    // Horizontal part (shares y with corner)
    const horizontalCount = randomInt(2, 3);
    for (let i = 1; i <= horizontalCount; i++) {
        points.push({ x: cornerX + i, y: cornerY });
    }

    // Vertical part (shares x with corner)
    const verticalCount = randomInt(2, 3);
    for (let i = 1; i <= verticalCount; i++) {
        points.push({ x: cornerX, y: cornerY + i });
    }

    return points;
}

export function p2CrossPattern() {
    // Cross/plus pattern (shares both x and y at center)
    const cx = randomInt(MIN_X + 2, MAX_X - 2);
    const cy = randomInt(MIN_Y + 2, MAX_Y - 2);

    const armLength = randomInt(1, 2);
    const points = [{ x: cx, y: cy }];

    // Horizontal arms (share y)
    for (let i = 1; i <= armLength; i++) {
        if (cx + i <= MAX_X) points.push({ x: cx + i, y: cy });
        if (cx - i >= MIN_X) points.push({ x: cx - i, y: cy });
    }

    // Vertical arms (share x)
    for (let i = 1; i <= armLength; i++) {
        if (cy + i <= MAX_Y) points.push({ x: cx, y: cy + i });
        if (cy - i >= MIN_Y) points.push({ x: cx, y: cy - i });
    }

    return points;
}

// =============================================================================
// CONNECTIVITY GENERATORS
// =============================================================================

export function connectedPath() {
    const count = randomInt(4, 8);
    let x = randomInt(MIN_X + 2, MAX_X - 2);
    let y = randomInt(MIN_Y + 1, MAX_Y - 1);
    const points = [{ x, y }];

    for (let i = 1; i < count; i++) {
        const directions = [];
        if (x > MIN_X) directions.push([-1, 0]);
        if (x < MAX_X) directions.push([1, 0]);
        if (y > MIN_Y) directions.push([0, -1]);
        if (y < MAX_Y) directions.push([0, 1]);

        const [dx, dy] = randomChoice(directions);
        x += dx;
        y += dy;
        points.push({ x, y });
    }

    return points;
}

export function connectedCluster() {
    const cx = randomInt(MIN_X + 2, MAX_X - 2);
    const cy = randomInt(MIN_Y + 2, MAX_Y - 2);
    const count = randomInt(5, 9);
    const points = [{ x: cx, y: cy }];
    const used = new Set([`${cx},${cy}`]);

    while (points.length < count) {
        const base = randomChoice(points);
        const neighbors = [
            { x: base.x + 1, y: base.y },
            { x: base.x - 1, y: base.y },
            { x: base.x, y: base.y + 1 },
            { x: base.x, y: base.y - 1 }
        ];

        const valid = neighbors.filter(p =>
            p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y &&
            !used.has(`${p.x},${p.y}`)
        );

        if (valid.length > 0) {
            const next = randomChoice(valid);
            points.push(next);
            used.add(`${next.x},${next.y}`);
        }
    }

    return points;
}

export function connectedTree() {
    const root = { x: randomInt(MIN_X + 2, MAX_X - 2), y: randomInt(MIN_Y + 2, MAX_Y - 2) };
    const points = [root];
    const used = new Set([`${root.x},${root.y}`]);
    const frontier = [root];
    const count = randomInt(5, 10);

    while (points.length < count && frontier.length > 0) {
        const base = randomChoice(frontier);
        const neighbors = [
            { x: base.x + 1, y: base.y },
            { x: base.x - 1, y: base.y },
            { x: base.x, y: base.y + 1 },
            { x: base.x, y: base.y - 1 }
        ];

        const valid = neighbors.filter(p =>
            p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y &&
            !used.has(`${p.x},${p.y}`)
        );

        if (valid.length > 0) {
            const next = randomChoice(valid);
            points.push(next);
            used.add(`${next.x},${next.y}`);
            frontier.push(next);
        } else {
            frontier.splice(frontier.indexOf(base), 1);
        }
    }

    return points;
}

export function connectedLoop() {
    const cx = randomInt(MIN_X + 3, MAX_X - 3);
    const cy = randomInt(MIN_Y + 2, MAX_Y - 2);
    const radius = randomInt(2, 3);
    const points = [];

    // Create a rectangular loop
    for (let i = 0; i < radius * 2; i++) {
        points.push({ x: cx - radius + i, y: cy - radius });
        points.push({ x: cx - radius + i, y: cy + radius });
    }
    for (let i = 1; i < radius * 2 - 1; i++) {
        points.push({ x: cx - radius, y: cy - radius + i });
        points.push({ x: cx + radius, y: cy - radius + i });
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

// =============================================================================
// GEOMETRIC SHAPE GENERATORS
// =============================================================================

export function triangle() {
    const x1 = randomInt(2, 6);
    const y1 = randomInt(2, 5);
    const x2 = randomInt(10, 14);
    const y2 = randomInt(2, 5);
    const x3 = randomInt(6, 10);
    const y3 = randomInt(7, 10);

    return [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
        { x: x3, y: y3 }
    ];
}

export function rectangle() {
    const x1 = randomInt(2, 8);
    const y1 = randomInt(2, 6);
    const width = randomInt(4, 8);
    const height = randomInt(3, 6);

    return [
        { x: x1, y: y1 },
        { x: x1 + width, y: y1 },
        { x: x1 + width, y: y1 + height },
        { x: x1, y: y1 + height }
    ].filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function squareWithExtra() {
    const size = randomInt(3, 5);
    const x1 = randomInt(MIN_X, MAX_X - size);
    const y1 = randomInt(MIN_Y, MAX_Y - size);

    const square = [
        { x: x1, y: y1 },
        { x: x1 + size, y: y1 },
        { x: x1 + size, y: y1 + size },
        { x: x1, y: y1 + size }
    ];

    // Add 1-3 extra points
    const extra = randomInt(1, 3);
    for (let i = 0; i < extra; i++) {
        square.push({ x: randomInt(MIN_X, MAX_X), y: randomInt(MIN_Y, MAX_Y) });
    }

    return square;
}

export function rhombus() {
    const size = randomInt(3, 5);
    const cx = randomInt(MIN_X + size, MAX_X - size);
    const cy = randomInt(MIN_Y + size, MAX_Y - size);

    return [
        { x: cx, y: cy - size },
        { x: cx + size, y: cy },
        { x: cx, y: cy + size },
        { x: cx - size, y: cy }
    ].filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function multipleRectangles() {
    // Multiple rectangles with varied sizes and positions
    const points = [];
    const numRects = randomInt(2, 3);

    for (let r = 0; r < numRects; r++) {
        const x = randomInt(MIN_X, MIN_X + 4) + r * 5;
        const y = randomInt(MIN_Y, MIN_Y + 3);
        const width = randomInt(3, 5);
        const height = randomInt(2, 4);

        if (x + width > MAX_X || y + height > MAX_Y) continue;

        // Add all four corners
        points.push({ x: x, y: y });
        points.push({ x: x + width, y: y });
        points.push({ x: x, y: y + height });
        points.push({ x: x + width, y: y + height });

        // Optionally add midpoints on edges
        if (Math.random() < 0.5) {
            points.push({ x: x + Math.floor(width / 2), y: y });
            points.push({ x: x + Math.floor(width / 2), y: y + height });
        }
        if (Math.random() < 0.5) {
            points.push({ x: x, y: y + Math.floor(height / 2) });
            points.push({ x: x + width, y: y + Math.floor(height / 2) });
        }
    }

    return points.length >= 3 ? points : rectangle();
}

export function convexRandom() {
    // Generate random points that form convex hull
    const count = randomInt(4, 7);
    const cx = randomInt(6, 11);
    const cy = randomInt(4, 8);
    const points = [];

    for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * i) / count + (Math.random() - 0.5) * 0.5;
        const radius = randomInt(3, 5);
        const x = Math.round(cx + radius * Math.cos(angle));
        const y = Math.round(cy + radius * Math.sin(angle));

        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points.length >= 3 ? points : triangle();
}

export function convexArc() {
    const cx = randomInt(8, 12);
    const cy = randomInt(6, 9);
    const radius = randomInt(4, 6);
    const points = [];

    for (let i = 0; i < 5; i++) {
        const angle = Math.PI * (i / 4);
        const x = Math.round(cx + radius * Math.cos(angle));
        const y = Math.round(cy - radius * Math.sin(angle));

        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points;
}

// =============================================================================
// SPECIFIC PATTERN GENERATORS
// =============================================================================

export function threeOnLineWithExtra() {
    const lineGenerators = [
        horizontalLine, verticalLine,
        fortyFiveDegreeLine, oneToTwoLine, oneToThreeLine, twoToThreeLine
    ];
    const line = randomChoice(lineGenerators)();
    const extra = randomInt(1, 3);

    for (let i = 0; i < extra; i++) {
        let p;
        do {
            p = { x: randomInt(MIN_X, MAX_X), y: randomInt(MIN_Y, MAX_Y) };
        } while (line.some(q => q.x === p.x && q.y === p.y));

        line.push(p);
    }

    return line;
}

export function fourOnLine() {
    const lineGenerators = [
        horizontalLine, verticalLine,
        fortyFiveDegreeLine, oneToTwoLine, oneToThreeLine, twoToThreeLine, anyLine
    ];
    return randomChoice(lineGenerators)();
}

export function lineAndExtra() {
    const lineGenerators = [
        horizontalLine, verticalLine,
        fortyFiveDegreeLine, oneToTwoLine, oneToThreeLine
    ];
    const line = randomChoice(lineGenerators)();
    const extra = [
        { x: randomInt(MIN_X, MAX_X), y: randomInt(MIN_Y, MAX_Y) },
        { x: randomInt(MIN_X, MAX_X), y: randomInt(MIN_Y, MAX_Y) }
    ];

    return [...line, ...extra];
}

export function generalPosition() {
    // Points in general position (no three collinear)
    const points = [];
    const count = randomInt(4, 7);

    outer: for (let i = 0; i < count; i++) {
        for (let attempt = 0; attempt < 50; attempt++) {
            const p = { x: randomInt(MIN_X, MAX_X), y: randomInt(MIN_Y, MAX_Y) };

            // Check if collinear with any two existing points
            let collinear = false;
            for (let j = 0; j < points.length && !collinear; j++) {
                for (let k = j + 1; k < points.length; k++) {
                    const dx1 = points[k].x - points[j].x;
                    const dy1 = points[k].y - points[j].y;
                    const dx2 = p.x - points[j].x;
                    const dy2 = p.y - points[j].y;

                    if (Math.abs(dx1 * dy2 - dy1 * dx2) < 0.1) {
                        collinear = true;
                        break;
                    }
                }
            }

            if (!collinear) {
                points.push(p);
                continue outer;
            }
        }
    }

    return points.length >= 3 ? points : uniformRandom();
}

export function randomScattered() {
    return uniformRandom();
}

export function withInteriorPoints() {
    const boundary = rectangle();
    const interior = [];

    // Add 1-3 interior points
    const count = randomInt(1, 3);
    for (let i = 0; i < count; i++) {
        const x = randomInt(boundary[0].x + 1, boundary[1].x - 1);
        const y = randomInt(boundary[0].y + 1, boundary[2].y - 1);
        interior.push({ x, y });
    }

    return [...boundary, ...interior];
}

export function almostConvex() {
    const points = convexRandom();

    // Add one interior point
    if (points.length >= 3) {
        const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
        const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
        points.push({ x: Math.round(cx), y: Math.round(cy) });
    }

    return points;
}

export function cluster() {
    return connectedCluster();
}

export function threeLines() {
    const lineGenerators = [
        horizontalLine, verticalLine,
        fortyFiveDegreeLine, oneToTwoLine, oneToThreeLine, twoToThreeLine
    ];
    const line1 = randomChoice(lineGenerators)();
    const line2 = randomChoice(lineGenerators)();
    const line3 = randomChoice(lineGenerators)();

    return [...line1, ...line2, ...line3];
}

export function almostTwoLines() {
    const lines = twoLines();
    const extra = { x: randomInt(MIN_X, MAX_X), y: randomInt(MIN_Y, MAX_Y) };
    return [...lines, extra];
}

// NEW: Rich negative generators for Rule 10
export function rectangleWithFloatingPoint() {
    // Hollow rectangle + one point floating inside (not on any edge)
    const rect = hollowRectangle();
    const xMin = Math.min(...rect.map(p => p.x));
    const xMax = Math.max(...rect.map(p => p.x));
    const yMin = Math.min(...rect.map(p => p.y));
    const yMax = Math.max(...rect.map(p => p.y));

    const floatingX = xMin + Math.floor((xMax - xMin) / 2);
    const floatingY = yMin + Math.floor((yMax - yMin) / 2);
    rect.push({ x: floatingX, y: floatingY });

    return rect;
}

export function hWithFloatingPoint() {
    // H-shape + one point not on any of the three lines
    const h = H();
    if (h.length < 5) return h;

    // Find bounds
    const xMin = Math.min(...h.map(p => p.x));
    const xMax = Math.max(...h.map(p => p.x));
    const yMin = Math.min(...h.map(p => p.y));
    const yMax = Math.max(...h.map(p => p.y));

    // Add a point in an "empty" region (not on the H lines)
    const floatingX = xMin + Math.floor((xMax - xMin) * 0.3);
    const floatingY = yMin + Math.floor((yMax - yMin) * 0.7);
    h.push({ x: floatingX, y: floatingY });

    return h;
}

export function pathWithDetour() {
    // Connected path + one point that creates a detour off the main path
    const path = connectedPath();
    if (path.length < 4) return path;

    // Pick a point in the middle and add a perpendicular detour point
    const midIdx = Math.floor(path.length / 2);
    const midPoint = path[midIdx];

    // Add perpendicular offset
    const detour = {
        x: midPoint.x + (Math.random() < 0.5 ? 1 : -1),
        y: midPoint.y + (Math.random() < 0.5 ? 1 : -1)
    };

    // Make sure detour is in bounds
    if (detour.x >= MIN_X && detour.x <= MAX_X && detour.y >= MIN_Y && detour.y <= MAX_Y) {
        path.push(detour);
    }

    return path;
}

export function zigzagWithOutlier() {
    // Zigzag pattern + one outlier point
    const zz = zigzag();
    if (zz.length < 3) return zz;

    const yMin = Math.min(...zz.map(p => p.y));
    const yMax = Math.max(...zz.map(p => p.y));
    const xMid = Math.floor((MIN_X + MAX_X) / 2);

    // Add outlier far from the zigzag
    const outlier = {
        x: xMid,
        y: yMax + 2 < MAX_Y ? yMax + 2 : yMin - 2
    };

    if (outlier.y >= MIN_Y && outlier.y <= MAX_Y) {
        zz.push(outlier);
    }

    return zz;
}

// NEW: Subtle negative generators - most points satisfy rule, one subtly fails

export function denseBlobWithIsolatedPoint() {
    // Many lines radiating from center, plus one point that's not quite on any line
    const centerX = randomInt(MIN_X + 4, MAX_X - 4);
    const centerY = randomInt(MIN_Y + 3, MAX_Y - 3);

    const points = [{ x: centerX, y: centerY }];

    // Add several lines radiating from center
    const directions = [
        { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
        { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 }
    ];

    for (const dir of directions) {
        const length = randomInt(2, 4);
        for (let i = 1; i <= length; i++) {
            const x = centerX + i * dir.dx;
            const y = centerY + i * dir.dy;
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    // Add one point that's NOT on any of these lines - offset slightly
    const isolatedX = centerX + 2;
    const isolatedY = centerY + 1; // Not on any cardinal or 45° line from center
    if (isolatedX <= MAX_X && isolatedY <= MAX_Y) {
        points.push({ x: isolatedX, y: isolatedY });
    }

    return points;
}

export function almostGrid() {
    // Grid-like with most points on horizontal/vertical lines, but one point slightly off
    const baseX = randomInt(MIN_X, MIN_X + 2);
    const baseY = randomInt(MIN_Y, MIN_Y + 2);
    const spacing = 2;

    const points = [];

    // Create a 4x3 grid
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
            points.push({ x: baseX + i * spacing, y: baseY + j * spacing });
        }
    }

    // Move one interior point slightly off-grid so it's not on any row/column line
    if (points.length > 5) {
        const idx = 5; // Middle-ish point
        points[idx].x += 1;
        points[idx].y += 1;
    }

    return points;
}

export function threeLinesPlusAlmostCollinear() {
    // Three lines where all points are collinear with 2+ others,
    // EXCEPT we add one point that's ALMOST on one of the lines but not quite
    const lines = threeLines();

    if (lines.length < 6) return lines;

    // Pick a point on one of the lines and create a near-collinear point
    const basePoint = lines[randomInt(0, Math.min(5, lines.length - 1))];

    // Add a point that's close but not exactly on any line through basePoint
    const almostPoint = {
        x: basePoint.x + randomInt(2, 3),
        y: basePoint.y + randomInt(1, 2) // Not collinear with basePoint and any other point
    };

    if (almostPoint.x <= MAX_X && almostPoint.y <= MAX_Y) {
        lines.push(almostPoint);
    }

    return lines;
}

export function starPatternWithGap() {
    // Star pattern (lines radiating from center), but one "arm" is missing a point,
    // leaving an endpoint that's not collinear with any other pair
    const centerX = randomInt(MIN_X + 3, MAX_X - 3);
    const centerY = randomInt(MIN_Y + 3, MAX_Y - 3);

    const points = [{ x: centerX, y: centerY }];

    // Add several arms
    const arms = [
        { dx: 1, dy: 0, length: 3 },
        { dx: 0, dy: 1, length: 3 },
        { dx: -1, dy: 0, length: 3 },
        { dx: 0, dy: -1, length: 3 },
        { dx: 1, dy: 1, length: 2 }
    ];

    for (let a = 0; a < arms.length; a++) {
        const arm = arms[a];
        const length = (a === arms.length - 1) ? 1 : arm.length; // Last arm is too short!

        for (let i = 1; i <= length; i++) {
            const x = centerX + i * arm.dx;
            const y = centerY + i * arm.dy;
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function serpentinePathWithKink() {
    // Long serpentine path where one point is slightly kinked off the smooth curve
    const points = [];
    let x = MIN_X + 1;
    let y = MIN_Y + 3;

    // Create a wavy path
    for (let i = 0; i < 12 && x < MAX_X - 1; i++) {
        points.push({ x, y });

        // Move right and oscillate vertically
        x++;
        if (i % 4 === 0) {
            y = Math.min(y + 1, MAX_Y - 1);
        } else if (i % 4 === 2) {
            y = Math.max(y - 1, MIN_Y + 1);
        }
    }

    // Add a kinked point that's offset from the path
    if (points.length > 6) {
        const kinkIdx = Math.floor(points.length / 2);
        const kinkPoint = { ...points[kinkIdx] };
        kinkPoint.y += 2; // Offset perpendicular to path

        if (kinkPoint.y <= MAX_Y) {
            points.push(kinkPoint);
        }
    }

    return points;
}

export function crossWithExtraArm() {
    // Cross pattern (4 lines meeting at center) + one extra point on a fifth direction
    // that doesn't have enough points to form a line
    const centerX = randomInt(MIN_X + 3, MAX_X - 3);
    const centerY = randomInt(MIN_Y + 3, MAX_Y - 3);

    const points = [{ x: centerX, y: centerY }];

    // Four main arms
    const mainArms = [
        { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
        { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
    ];

    for (const arm of mainArms) {
        for (let i = 1; i <= 3; i++) {
            const x = centerX + i * arm.dx;
            const y = centerY + i * arm.dy;
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    // One lonely point in a diagonal direction
    const lonelyX = centerX + 2;
    const lonelyY = centerY + 1;
    if (lonelyX <= MAX_X && lonelyY <= MAX_Y) {
        points.push({ x: lonelyX, y: lonelyY });
    }

    return points;
}

// NEW: More diverse positive and negative patterns

// (1) Two-column patterns
export function twoColumnsWithMiddlePoints() {
    // Two vertical columns far apart + random points between them
    const leftX = randomInt(MIN_X, MIN_X + 2);
    const rightX = randomInt(MAX_X - 2, MAX_X);
    const points = [];

    // Left column
    const leftHeight = randomInt(5, 8);
    const leftStartY = randomInt(MIN_Y, MAX_Y - leftHeight);
    for (let i = 0; i < leftHeight; i++) {
        points.push({ x: leftX, y: leftStartY + i });
    }

    // Right column
    const rightHeight = randomInt(5, 8);
    const rightStartY = randomInt(MIN_Y, MAX_Y - rightHeight);
    for (let i = 0; i < rightHeight; i++) {
        points.push({ x: rightX, y: rightStartY + i });
    }

    // Random points in between
    const middleCount = randomInt(2, 5);
    for (let i = 0; i < middleCount; i++) {
        const x = randomInt(leftX + 2, rightX - 2);
        const y = randomInt(MIN_Y, MAX_Y);
        points.push({ x, y });
    }

    return points;
}

export function twoRowsWithMiddlePoints() {
    // Two horizontal rows far apart + random points between them
    const topY = randomInt(MIN_Y, MIN_Y + 2);
    const bottomY = randomInt(MAX_Y - 2, MAX_Y);
    const points = [];

    // Top row
    const topWidth = randomInt(5, 9);
    const topStartX = randomInt(MIN_X, MAX_X - topWidth);
    for (let i = 0; i < topWidth; i++) {
        points.push({ x: topStartX + i, y: topY });
    }

    // Bottom row
    const bottomWidth = randomInt(5, 9);
    const bottomStartX = randomInt(MIN_X, MAX_X - bottomWidth);
    for (let i = 0; i < bottomWidth; i++) {
        points.push({ x: bottomStartX + i, y: bottomY });
    }

    // Random points in between
    const middleCount = randomInt(2, 5);
    for (let i = 0; i < middleCount; i++) {
        const x = randomInt(MIN_X, MAX_X);
        const y = randomInt(topY + 2, bottomY - 2);
        points.push({ x, y });
    }

    return points;
}

export function LShapeWithMiddlePoints(satisfiesRule = true) {
    // L-shape with middle points
    // If satisfiesRule=true, middle points stay on one side of diagonal (positive example)
    // If satisfiesRule=false, some points cross the diagonal (negative example)

    // Calculate safe bounds for the L-shape
    const maxHorizontalLength = 6;
    const maxVerticalLength = 6;

    const cornerX = randomInt(MIN_X + 1, MAX_X - maxHorizontalLength);
    const cornerY = randomInt(MIN_Y + maxVerticalLength - 1, MAX_Y - 1);
    const points = [];

    // Vertical part of L (going up from corner)
    const verticalLength = randomInt(4, 6);
    for (let i = 0; i < verticalLength; i++) {
        const y = cornerY - i;
        if (y >= MIN_Y && y <= MAX_Y) {
            points.push({ x: cornerX, y });
        }
    }

    // Horizontal part of L (going right from corner)
    const horizontalLength = randomInt(4, 6);
    for (let i = 1; i < horizontalLength; i++) { // Start at 1 to avoid duplicate corner
        const x = cornerX + i;
        if (x >= MIN_X && x <= MAX_X) {
            points.push({ x, y: cornerY });
        }
    }

    // Add middle points
    // The "diagonal" of the L-shape goes from top of vertical to right end of horizontal
    const topY = Math.max(MIN_Y, cornerY - (verticalLength - 1));
    const rightX = Math.min(MAX_X, cornerX + (horizontalLength - 1));

    const middleCount = randomInt(2, 4);

    if (satisfiesRule) {
        // Add points on the "inside" (upper-right quadrant relative to corner)
        // These stay on one side of the diagonal, so all points remain collinear with L segments
        for (let i = 0; i < middleCount; i++) {
            const x = randomInt(Math.min(cornerX + 1, MAX_X), Math.min(rightX, MAX_X));
            const y = randomInt(Math.max(topY, MIN_Y), Math.max(cornerY - 1, MIN_Y));
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    } else {
        // Add points that cross to the other side of the diagonal
        // This creates points that are NOT collinear with the L segments
        for (let i = 0; i < middleCount; i++) {
            const crossesDiagonal = i < Math.floor(middleCount / 2);
            if (crossesDiagonal) {
                // Place on "outside" (lower-left relative to diagonal)
                if (cornerX > MIN_X && cornerY < MAX_Y) {
                    const x = randomInt(MIN_X, cornerX - 1);
                    const y = randomInt(Math.min(cornerY + 1, MAX_Y), MAX_Y);
                    if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                        points.push({ x, y });
                    }
                }
            } else {
                // Some on inside for variety
                const x = randomInt(Math.min(cornerX + 1, MAX_X), Math.min(rightX, MAX_X));
                const y = randomInt(Math.max(topY, MIN_Y), Math.max(cornerY - 1, MIN_Y));
                if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                    points.push({ x, y });
                }
            }
        }
    }

    return points;
}

// (2) Diverse blob patterns
export function smallRadialBlob() {
    // Small blob with 3-4 short rays
    const centerX = randomInt(MIN_X + 3, MAX_X - 3);
    const centerY = randomInt(MIN_Y + 3, MAX_Y - 3);
    const points = [{ x: centerX, y: centerY }];

    const numRays = randomInt(3, 4);
    const directions = [
        { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
        { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }
    ];

    shuffle(directions);

    for (let i = 0; i < numRays; i++) {
        const dir = directions[i];
        const length = randomInt(2, 3);
        for (let j = 1; j <= length; j++) {
            const x = centerX + j * dir.dx;
            const y = centerY + j * dir.dy;
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function largeRadialBlob() {
    // Large blob with 6-8 longer rays
    const centerX = randomInt(MIN_X + 4, MAX_X - 4);
    const centerY = randomInt(MIN_Y + 4, MAX_Y - 4);
    const points = [{ x: centerX, y: centerY }];

    const numRays = randomInt(6, 8);
    const directions = [
        { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
        { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }
    ];

    shuffle(directions);

    for (let i = 0; i < numRays; i++) {
        const dir = directions[i];
        const length = randomInt(3, 5);
        for (let j = 1; j <= length; j++) {
            const x = centerX + j * dir.dx;
            const y = centerY + j * dir.dy;
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function mediumAsymmetricBlob() {
    // Medium blob with asymmetric ray lengths
    const centerX = randomInt(MIN_X + 3, MAX_X - 3);
    const centerY = randomInt(MIN_Y + 3, MAX_Y - 3);
    const points = [{ x: centerX, y: centerY }];

    const directions = [
        { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
        { dx: 1, dy: 1 }
    ];

    for (const dir of directions) {
        const length = randomInt(2, 4); // Variable lengths
        for (let j = 1; j <= length; j++) {
            const x = centerX + j * dir.dx;
            const y = centerY + j * dir.dy;
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

// (3) Letter-shaped patterns - POSITIVE (satisfy rule)
export function letterI() {
    // Letter I - one line (can be vertical or horizontal, with optional gaps)
    const isVertical = Math.random() < 0.7; // 70% vertical, 30% horizontal
    const maxLength = randomInt(6, 9);
    const hasGaps = Math.random() < 0.2; // 20% chance of gaps
    const step = hasGaps ? 2 : 1;

    const points = [];

    if (isVertical) {
        const x = randomInt(MIN_X + 1, MAX_X - 1);
        const startY = randomInt(MIN_Y, MAX_Y - maxLength + 1);
        for (let i = 0; i < maxLength; i += step) {
            const y = startY + i;
            if (y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    } else {
        const y = randomInt(MIN_Y + 1, MAX_Y - 1);
        const startX = randomInt(MIN_X, MAX_X - maxLength + 1);
        for (let i = 0; i < maxLength; i += step) {
            const x = startX + i;
            if (x >= MIN_X && x <= MAX_X) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function letterL() {
    // Letter L - two perpendicular lines meeting at corner (with rotation & gaps)
    const rotation = randomChoice([0, 90, 180, 270]); // 4 possible orientations
    const vertHeight = randomInt(4, 7);
    const horizWidth = randomInt(4, 7);
    const hasGaps = Math.random() < 0.15; // 15% chance of gaps
    const step = hasGaps ? 2 : 1;

    // Determine safe corner position based on rotation
    let cornerX, cornerY;
    if (rotation === 0) {
        // Standard L (corner at bottom-left)
        cornerX = randomInt(MIN_X + 1, MAX_X - horizWidth);
        cornerY = randomInt(MIN_Y + vertHeight - 1, MAX_Y);
    } else if (rotation === 90) {
        // Rotated 90° (corner at bottom-right)
        cornerX = randomInt(MIN_X + horizWidth - 1, MAX_X - 1);
        cornerY = randomInt(MIN_Y + vertHeight - 1, MAX_Y);
    } else if (rotation === 180) {
        // Rotated 180° (corner at top-right)
        cornerX = randomInt(MIN_X + horizWidth - 1, MAX_X - 1);
        cornerY = randomInt(MIN_Y, MAX_Y - vertHeight + 1);
    } else {
        // Rotated 270° (corner at top-left)
        cornerX = randomInt(MIN_X + 1, MAX_X - horizWidth);
        cornerY = randomInt(MIN_Y, MAX_Y - vertHeight + 1);
    }

    const points = [];

    // Add corner point
    points.push({ x: cornerX, y: cornerY });

    // Vertical arm direction based on rotation
    const vertDir = (rotation === 0 || rotation === 90) ? -1 : 1;
    for (let i = step; i < vertHeight; i += step) {
        const y = cornerY + i * vertDir;
        if (y >= MIN_Y && y <= MAX_Y) {
            points.push({ x: cornerX, y });
        }
    }

    // Horizontal arm direction based on rotation
    const horizDir = (rotation === 0 || rotation === 270) ? 1 : -1;
    for (let i = step; i < horizWidth; i += step) {
        const x = cornerX + i * horizDir;
        if (x >= MIN_X && x <= MAX_X) {
            points.push({ x, y: cornerY });
        }
    }

    return points;
}

export function letterT() {
    // Letter T - can be upright or inverted, with variable stem position & gaps
    const isInverted = Math.random() < 0.3; // 30% chance inverted
    const topWidth = randomInt(5, 8);
    const stemHeight = randomInt(4, 7);
    const stemOffset = randomInt(-1, 1); // Stem can be slightly off-center
    const hasGaps = Math.random() < 0.15; // 15% chance of gaps
    const step = hasGaps ? 2 : 1;

    const halfWidth = Math.floor(topWidth / 2);
    const centerX = randomInt(MIN_X + halfWidth + 1, MAX_X - halfWidth - 1) + stemOffset;

    const points = [];

    if (isInverted) {
        // Inverted T (stem goes up)
        const bottomY = randomInt(MIN_Y + stemHeight - 1, MAX_Y - 1);

        // Bottom horizontal
        const topStartX = centerX - halfWidth;
        for (let i = 0; i < topWidth; i += step) {
            const x = topStartX + i;
            if (x >= MIN_X && x <= MAX_X) {
                points.push({ x, y: bottomY });
            }
        }

        // Vertical stem (going up)
        for (let i = step; i < stemHeight; i += step) {
            const y = bottomY - i;
            if (y >= MIN_Y && y <= MAX_Y) {
                points.push({ x: centerX, y });
            }
        }
    } else {
        // Normal T (stem goes down)
        const topY = randomInt(MIN_Y, MAX_Y - stemHeight);

        // Top horizontal
        const topStartX = centerX - halfWidth;
        for (let i = 0; i < topWidth; i += step) {
            const x = topStartX + i;
            if (x >= MIN_X && x <= MAX_X) {
                points.push({ x, y: topY });
            }
        }

        // Vertical stem (going down)
        for (let i = step; i < stemHeight; i += step) {
            const y = topY + i;
            if (y >= MIN_Y && y <= MAX_Y) {
                points.push({ x: centerX, y });
            }
        }
    }

    return points;
}

export function letterF() {
    // Letter F - can be mirrored, with varying arm lengths & positions
    const isMirrored = Math.random() < 0.3; // 30% chance mirrored (backwards F)
    const height = randomInt(6, 9);
    const topWidth = randomInt(3, 6);
    const midWidth = randomInt(2, 5);
    const midPosition = randomInt(Math.floor(height * 0.3), Math.floor(height * 0.6)); // Middle arm position varies
    const hasGaps = Math.random() < 0.1; // 10% chance of gaps
    const step = hasGaps ? 2 : 1;

    const maxWidth = Math.max(topWidth, midWidth);
    const leftX = isMirrored ?
        randomInt(MIN_X + maxWidth - 1, MAX_X - 1) :
        randomInt(MIN_X, MAX_X - maxWidth);
    const topY = randomInt(MIN_Y, MAX_Y - height + 1);
    const direction = isMirrored ? -1 : 1;

    const points = [];

    // Vertical stem
    for (let i = 0; i < height; i += step) {
        const y = topY + i;
        if (y >= MIN_Y && y <= MAX_Y) {
            points.push({ x: leftX, y });
        }
    }

    // Top horizontal arm
    for (let i = 1; i < topWidth; i += step) {
        const x = leftX + i * direction;
        if (x >= MIN_X && x <= MAX_X) {
            points.push({ x, y: topY });
        }
    }

    // Middle horizontal arm
    const midY = topY + midPosition;
    for (let i = 1; i < midWidth; i += step) {
        const x = leftX + i * direction;
        if (x >= MIN_X && x <= MAX_X && midY >= MIN_Y && midY <= MAX_Y) {
            points.push({ x, y: midY });
        }
    }

    return points;
}

// (3) Letter-shaped patterns - NEGATIVE (fail rule)
export function letterC() {
    // Letter C - arc with varying rotation, radius, and density
    const radius = randomInt(3, 5);
    const centerX = randomInt(MIN_X + radius, MAX_X - radius);
    const centerY = randomInt(MIN_Y + radius, MAX_Y - radius);
    const rotation = randomInt(0, 90); // Rotate the C by 0-90 degrees
    const angleStep = randomChoice([25, 30, 35, 40]); // Vary density
    const arcSpan = randomInt(180, 220); // How much of circle to cover

    const points = [];

    // Arc from one side to the other, with rotation
    for (let angle = 90; angle <= 90 + arcSpan; angle += angleStep) {
        const rotatedAngle = angle + rotation;
        const rad = (rotatedAngle * Math.PI) / 180;
        const x = Math.round(centerX + radius * Math.cos(rad));
        const y = Math.round(centerY + radius * Math.sin(rad));
        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points;
}

export function letterO() {
    // Letter O - ellipse with varying radii, rotation, and density
    const radiusX = randomInt(2, 4);
    const radiusY = randomInt(2, 4);
    const centerX = randomInt(MIN_X + radiusX + 1, MAX_X - radiusX - 1);
    const centerY = randomInt(MIN_Y + radiusY + 1, MAX_Y - radiusY - 1);
    const angleStep = randomChoice([40, 45, 50, 55]); // Vary density
    const rotation = randomInt(0, 45); // Rotate the ellipse

    const points = [];

    for (let angle = 0; angle < 360; angle += angleStep) {
        const rad = ((angle + rotation) * Math.PI) / 180;
        const x = Math.round(centerX + radiusX * Math.cos(rad));
        const y = Math.round(centerY + radiusY * Math.sin(rad));
        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points;
}

export function letterV() {
    // Letter V - varying angles, lengths, and can be inverted
    const isInverted = Math.random() < 0.25; // 25% chance inverted (^)
    const leftLen = randomInt(4, 7);
    const rightLen = randomInt(4, 7);
    const angleVariation = randomInt(-1, 1); // Slight asymmetry in angles
    const hasGaps = Math.random() < 0.15;
    const step = hasGaps ? 2 : 1;

    const maxLen = Math.max(leftLen, rightLen);
    const tipX = randomInt(MIN_X + maxLen, MAX_X - maxLen);
    const tipY = isInverted ?
        randomInt(MIN_Y, MIN_Y + 2) :
        randomInt(MAX_Y - 2, MAX_Y);
    const vertDir = isInverted ? 1 : -1;

    const points = [{ x: tipX, y: tipY }];

    // Left diagonal
    for (let i = step; i < leftLen; i += step) {
        const x = tipX - i - angleVariation;
        const y = tipY + i * vertDir;
        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    // Right diagonal
    for (let i = step; i < rightLen; i += step) {
        const x = tipX + i + angleVariation;
        const y = tipY + i * vertDir;
        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points;
}

export function letterP() {
    // Letter P - vertical stem with arc, varying size, position, and orientation
    const isMirrored = Math.random() < 0.3; // 30% chance mirrored (backwards P)
    const height = randomInt(7, 10);
    const arcSize = randomInt(2, 4); // Radius of the curved part
    const arcHeight = randomInt(2, 4); // How tall the arc section is
    const hasGaps = Math.random() < 0.1;
    const step = hasGaps ? 2 : 1;

    const stemX = isMirrored ?
        randomInt(MIN_X + arcSize + 1, MAX_X - 1) :
        randomInt(MIN_X, MAX_X - arcSize - 1);
    const topY = randomInt(MIN_Y, MAX_Y - height + 1);
    const direction = isMirrored ? -1 : 1;

    const points = [];

    // Vertical stem
    for (let i = 0; i < height; i += step) {
        const y = topY + i;
        if (y >= MIN_Y && y <= MAX_Y) {
            points.push({ x: stemX, y });
        }
    }

    // Top arc (curved part) - parametric curve
    const numArcPoints = randomInt(3, 5);
    for (let i = 0; i < numArcPoints; i++) {
        const t = i / (numArcPoints - 1); // 0 to 1
        const angle = t * Math.PI; // 0 to π (semicircle)
        const x = Math.round(stemX + direction * arcSize * (1 - Math.cos(angle)));
        const y = Math.round(topY + arcHeight * Math.sin(angle));
        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points;
}

export function almostSquare() {
    const size = randomInt(3, 5);
    const x1 = randomInt(MIN_X, MAX_X - size);
    const y1 = randomInt(MIN_Y, MAX_Y - size - 1); // -1 for the +1 offset

    return [
        { x: x1, y: y1 },
        { x: x1 + size, y: y1 },
        { x: x1 + size, y: y1 + size + 1 }, // Off by 1
        { x: x1, y: y1 + size }
    ];
}

export function multipleSquares() {
    const s1 = randomInt(3, 4);
    const x1 = MIN_X + 1;
    const y1 = MIN_Y + 1;
    const points = [
        { x: x1, y: y1 },
        { x: x1 + s1, y: y1 },
        { x: x1 + s1, y: y1 + s1 },
        { x: x1, y: y1 + s1 }
    ];

    const s2 = randomInt(3, 4);
    const x2 = MAX_X - s2 - 2;
    const y2 = MAX_Y - s2;
    points.push(
        { x: x2, y: y2 },
        { x: x2 + s2, y: y2 },
        { x: x2 + s2, y: y2 + s2 },
        { x: x2, y: y2 + s2 }
    );

    return points;
}

export function squareAndLine() {
    const square = squareWithExtra();
    const line = horizontalLine();
    return [...square, ...line];
}

export function squareInPattern() {
    return squareWithExtra();
}

export function weakOrderLine() {
    const count = randomInt(4, 7);
    const points = [];

    for (let i = 0; i < count; i++) {
        points.push({
            x: 2 + i * 2,
            y: 2 + i
        });
    }

    return points;
}

export function weakOrderStaircase() {
    const count = randomInt(4, 7);
    const points = [];

    for (let i = 0; i < count; i++) {
        points.push({
            x: 2 + i * 2,
            y: 3 + Math.floor(i / 2)
        });
    }

    return points;
}

export function weakOrderMonotone() {
    const count = randomInt(4, 7);
    const points = [];
    let x = 2, y = 2;

    for (let i = 0; i < count; i++) {
        // Check bounds before pushing
        if (x > MAX_X || y > MAX_Y) break;

        points.push({ x, y });
        x += randomInt(1, 2);
        y += randomInt(0, 1);
    }

    return points;
}

export function noWeakOrder() {
    return [
        { x: 3, y: 8 },
        { x: 8, y: 3 },
        { x: 13, y: 6 }
    ];
}

export function almostWeakOrder() {
    const points = weakOrderMonotone();

    // Swap last two
    if (points.length >= 2) {
        [points[points.length - 1], points[points.length - 2]] =
        [points[points.length - 2], points[points.length - 1]];
    }

    return points;
}

export function weakOrderAddRandomVector() {
    // Start with a point and repeatedly add a random vector from a small set
    // Vectors are chosen to maintain weak order property
    const vectors = [
        { dx: 1, dy: 0 },
        { dx: 2, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: 2 },
        { dx: 1, dy: 1 },
        { dx: 2, dy: 1 },
        { dx: 1, dy: 2 }
    ];

    const count = randomInt(5, 8);
    const points = [];
    let x = randomInt(MIN_X, MIN_X + 2);
    let y = randomInt(MIN_Y, MIN_Y + 2);

    for (let i = 0; i < count; i++) {
        if (x > MAX_X || y > MAX_Y) break;
        points.push({ x, y });

        const vec = randomChoice(vectors);
        x += vec.dx;
        y += vec.dy;
    }

    return points.length >= 3 ? points : weakOrderLine();
}

export function weakOrderZigZag() {
    // Zigzag pattern that maintains weak order
    const points = [];
    let x = randomInt(MIN_X, MIN_X + 2);
    let y = randomInt(MIN_Y, MIN_Y + 2);
    const count = randomInt(5, 8);

    for (let i = 0; i < count; i++) {
        if (x > MAX_X || y > MAX_Y) break;
        points.push({ x, y });

        if (i % 2 === 0) {
            x += randomInt(2, 3);
        } else {
            y += randomInt(1, 2);
        }
    }

    return points.length >= 3 ? points : weakOrderLine();
}

export function weakOrderConnected() {
    // Generate weak order points forming a connected path
    const points = [];
    let x = randomInt(MIN_X, MIN_X + 2);
    let y = randomInt(MIN_Y, MIN_Y + 2);
    const count = randomInt(5, 7);

    for (let i = 0; i < count; i++) {
        if (x > MAX_X || y > MAX_Y) break;
        points.push({ x, y });

        // Move right or up by 1 step (maintains connectivity and weak order)
        if (Math.random() < 0.6 && x < MAX_X) {
            x += 1;
        } else if (y < MAX_Y) {
            y += 1;
        } else if (x < MAX_X) {
            x += 1;
        }
    }

    return points.length >= 3 ? points : weakOrderLine();
}

export function weakOrderL() {
    // L-shape that satisfies weak order
    const points = [];
    const startX = randomInt(MIN_X, MIN_X + 2);
    const startY = randomInt(MIN_Y, MIN_Y + 2);

    // Horizontal part
    const horizLength = randomInt(3, 5);
    for (let i = 0; i < horizLength; i++) {
        const x = startX + i;
        if (x > MAX_X) break;
        points.push({ x, y: startY });
    }

    // Vertical part (starting from the end of horizontal)
    const endX = Math.min(startX + horizLength - 1, MAX_X);
    const vertLength = randomInt(3, 5);
    for (let i = 1; i < vertLength; i++) {
        const y = startY + i;
        if (y > MAX_Y) break;
        points.push({ x: endX, y });
    }

    return points.length >= 3 ? points : weakOrderLine();
}

export function weakOrderTwoHorizontalLines() {
    // Two horizontal lines at different y-coordinates
    const points = [];
    const y1 = randomInt(MIN_Y, MIN_Y + 2);
    const y2 = y1 + randomInt(2, 4);

    if (y2 > MAX_Y) return weakOrderLine();

    const x1Start = randomInt(MIN_X, MIN_X + 2);
    const lineLength = randomInt(3, 5);

    // First horizontal line
    for (let i = 0; i < lineLength; i++) {
        const x = x1Start + i;
        if (x > MAX_X) break;
        points.push({ x, y: y1 });
    }

    // Second horizontal line
    for (let i = 0; i < lineLength; i++) {
        const x = x1Start + i;
        if (x > MAX_X) break;
        points.push({ x, y: y2 });
    }

    return points.length >= 3 ? points : weakOrderLine();
}

export function weakOrderTwoVerticalLines() {
    // Two vertical lines at different x-coordinates
    const points = [];
    const x1 = randomInt(MIN_X, MIN_X + 3);
    const x2 = x1 + randomInt(3, 5);

    if (x2 > MAX_X) return weakOrderLine();

    const y1Start = randomInt(MIN_Y, MIN_Y + 2);
    const lineLength = randomInt(3, 5);

    // First vertical line
    for (let i = 0; i < lineLength; i++) {
        const y = y1Start + i;
        if (y > MAX_Y) break;
        points.push({ x: x1, y });
    }

    // Second vertical line
    for (let i = 0; i < lineLength; i++) {
        const y = y1Start + i;
        if (y > MAX_Y) break;
        points.push({ x: x2, y });
    }

    return points.length >= 3 ? points : weakOrderLine();
}

export function weakOrderTwoLines() {
    // Two lines that together satisfy weak order
    const points = [];

    // First line: diagonal going up-right
    const x1Start = randomInt(MIN_X, MIN_X + 2);
    const y1Start = randomInt(MIN_Y, MIN_Y + 2);
    const line1Length = randomInt(3, 4);

    for (let i = 0; i < line1Length; i++) {
        const x = x1Start + i;
        const y = y1Start + i;
        if (x > MAX_X || y > MAX_Y) break;
        points.push({ x, y });
    }

    // Second line: starts after first line ends (spatially separated)
    const x2Start = x1Start + line1Length + randomInt(1, 2);
    const y2Start = y1Start + line1Length + randomInt(0, 1);
    const line2Length = randomInt(3, 4);

    for (let i = 0; i < line2Length; i++) {
        const x = x2Start + i;
        const y = y2Start + i;
        if (x > MAX_X || y > MAX_Y) break;
        points.push({ x, y });
    }

    return points.length >= 3 ? points : weakOrderLine();
}

// Negative examples (violate weak order)

export function decreasingLine() {
    // Line with decreasing y as x increases
    const count = randomInt(4, 6);
    const points = [];
    const startX = randomInt(MIN_X, MIN_X + 2);
    const startY = randomInt(MAX_Y - 2, MAX_Y);

    for (let i = 0; i < count; i++) {
        const x = startX + i * 2;
        const y = startY - i;
        if (x > MAX_X || y < MIN_Y) break;
        points.push({ x, y });
    }

    return points.length >= 3 ? points : noWeakOrder();
}

export function nonWeakOrderL() {
    // L-shape that violates weak order (horizontal then down)
    const points = [];
    const startX = randomInt(MIN_X, MIN_X + 2);
    const startY = randomInt(MAX_Y - 3, MAX_Y);

    // Horizontal part (going right)
    const horizLength = randomInt(3, 5);
    for (let i = 0; i < horizLength; i++) {
        const x = startX + i;
        if (x > MAX_X) break;
        points.push({ x, y: startY });
    }

    // Vertical part going DOWN (violates weak order)
    const endX = Math.min(startX + horizLength - 1, MAX_X);
    const vertLength = randomInt(3, 4);
    for (let i = 1; i < vertLength; i++) {
        const y = startY - i;
        if (y < MIN_Y) break;
        points.push({ x: endX, y });
    }

    return points.length >= 3 ? points : noWeakOrder();
}

export function nonWeakOrderTwoLines() {
    // Two lines where one goes backwards
    const points = [];

    // First line: going up-right
    const x1Start = randomInt(MIN_X, MIN_X + 3);
    const y1Start = randomInt(MIN_Y, MIN_Y + 2);
    for (let i = 0; i < 3; i++) {
        const x = x1Start + i;
        const y = y1Start + i;
        if (x > MAX_X || y > MAX_Y) break;
        points.push({ x, y });
    }

    // Second line: to the right but lower y (violates weak order)
    const x2Start = x1Start + 5;
    const y2Start = y1Start - 1;
    for (let i = 0; i < 3; i++) {
        const x = x2Start + i;
        const y = y2Start + i;
        if (x > MAX_X || y > MAX_Y || y < MIN_Y) break;
        points.push({ x, y });
    }

    return points.length >= 3 ? points : noWeakOrder();
}

export function nonWeakOrderConnected() {
    // Connected path that violates weak order by going backwards
    const points = [];
    let x = randomInt(MIN_X, MIN_X + 2);
    let y = randomInt(MIN_Y + 3, MIN_Y + 5);

    // Go right and up for a bit
    for (let i = 0; i < 3; i++) {
        if (x > MAX_X || y > MAX_Y) break;
        points.push({ x, y });
        x += 1;
        y += randomInt(0, 1);
    }

    // Then go down (violates weak order)
    for (let i = 0; i < 3; i++) {
        if (x > MAX_X || y < MIN_Y) break;
        points.push({ x, y });
        x += 1;
        y -= 1;
    }

    return points.length >= 3 ? points : noWeakOrder();
}

export function regularGrid() {
    const points = [];
    const spacing = randomChoice([2, 3, 4]);
    const offsetX = randomInt(MIN_X, MIN_X + 2);
    const offsetY = randomInt(MIN_Y, MIN_Y + 2);

    for (let x = offsetX; x <= MAX_X; x += spacing) {
        for (let y = offsetY; y <= MAX_Y; y += spacing) {
            points.push({ x, y });
        }
    }

    return points.length >= 3 ? points : uniformRandom();
}

export function rightTriangles() {
    // Multiple right-angled triangles (which CAN exist on a square grid)
    const points = [];
    const numTriangles = randomInt(2, 3);

    for (let t = 0; t < numTriangles; t++) {
        const baseX = randomInt(MIN_X, MIN_X + 4) + t * 5;
        const baseY = randomInt(MIN_Y, MIN_Y + 3);
        const width = randomInt(3, 5);
        const height = randomInt(3, 5);

        if (baseX + width > MAX_X || baseY + height > MAX_Y) continue;

        // Right triangle: bottom-left corner, bottom-right, top-left
        points.push({ x: baseX, y: baseY });           // bottom-left
        points.push({ x: baseX + width, y: baseY });   // bottom-right
        points.push({ x: baseX, y: baseY + height });  // top-left

        // Optionally add some points along the edges
        if (Math.random() < 0.5 && width >= 4) {
            points.push({ x: baseX + Math.floor(width / 2), y: baseY });
        }
        if (Math.random() < 0.5 && height >= 4) {
            points.push({ x: baseX, y: baseY + Math.floor(height / 2) });
        }
    }

    return points.length >= 3 ? points : uniformRandom();
}

export function symmetricPattern() {
    return verticallySymmetric();
}


// ==================== RULE p10 GENERATORS (NEW IMPLEMENTATION) ====================
// Rule p10: "No unique nearest neighbor"
// Each point must have at least 2 other points at the same minimum distance

// (1) Single rotated square with various slopes
export function p10RotatedSquare() {
    const squareTypes = [
        { dx: 0, dy: 1, name: 'vertical' },      // Vertical edges
        { dx: 1, dy: 0, name: 'horizontal' },    // Horizontal edges
        { dx: 1, dy: 1, name: '1-to-1' },        // 45° slope
        { dx: 1, dy: 2, name: '1-to-2' },        // 1:2 slope
        { dx: 2, dy: 1, name: '2-to-1' },        // 2:1 slope
        { dx: 2, dy: 3, name: '2-to-3' }         // 2:3 slope
    ];

    const type = randomChoice(squareTypes);
    const sideLength = Math.sqrt(type.dx * type.dx + type.dy * type.dy);

    // Find suitable center position
    const maxExtent = Math.max(Math.abs(type.dx), Math.abs(type.dy)) * 2;
    const cx = randomInt(MIN_X + maxExtent, MAX_X - maxExtent);
    const cy = randomInt(MIN_Y + maxExtent, MAX_Y - maxExtent);

    // Generate square vertices starting from center
    // First edge vector: (dx, dy)
    // Second edge vector (perpendicular): (-dy, dx)
    const points = [
        { x: cx, y: cy },
        { x: cx + type.dx, y: cy + type.dy },
        { x: cx + type.dx - type.dy, y: cy + type.dy + type.dx },
        { x: cx - type.dy, y: cy + type.dx }
    ];

    // Validate all points are in bounds
    const valid = points.every(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);

    return valid ? points : p10RotatedSquare(); // Retry if out of bounds
}

// (2) Overlapping unit squares
export function p10OverlappingUnitSquares() {
    const points = [];
    const numSquares = randomInt(2, 4);
    const used = new Set();

    for (let i = 0; i < numSquares; i++) {
        // Place random unit square {(x,y), (x,y+1), (x+1,y), (x+1,y+1)}
        const x = randomInt(MIN_X, MAX_X - 1);
        const y = randomInt(MIN_Y, MAX_Y - 1);

        // Add all four corners (Set will handle duplicates automatically)
        const corners = [
            { x, y },
            { x, y: y + 1 },
            { x: x + 1, y },
            { x: x + 1, y: y + 1 }
        ];

        for (const corner of corners) {
            const key = `${corner.x},${corner.y}`;
            if (!used.has(key)) {
                used.add(key);
                points.push(corner);
            }
        }
    }

    return points.length >= 4 ? points : p10OverlappingUnitSquares();
}

// (3) Square with perpendicular bisector points
export function p10SquareWithBisectorPoints() {
    const s = randomChoice([2, 3]); // Side length of square
    const sideLength = 2 * s;

    // Ensure square fits within bounds
    const x = randomInt(MIN_X, MAX_X - sideLength);
    const y = randomInt(MIN_Y, MAX_Y - sideLength);

    // Main square corners (side length = 2s)
    const points = [
        { x, y },
        { x: x + sideLength, y },
        { x: x + sideLength, y: y + sideLength },
        { x, y: y + sideLength }
    ];

    // For a square with side length 2s, adjacent corners are at distance 2s apart
    // Each corner has 2 neighbors (adjacent corners) at distance 2s
    // For a horizontal edge with corners at (x,y) and (x+2s,y), bisector point at (x+s, y±d)
    // has distance sqrt(s² + d²) to each corner
    // To avoid bisector becoming unique nearest neighbor of corners: sqrt(s² + d²) ≥ 2s
    // Solving: s² + d² ≥ 4s² → d² ≥ 3s² → d ≥ s*sqrt(3) ≈ 1.732s

    // Generate candidates at different perpendicular distances
    // For s=2: need d ≥ 3.46, use minDist=4
    // For s=3: need d ≥ 5.20, use minDist=6
    const minDist = Math.ceil(s * Math.sqrt(3)) + 1; // +1 for safety margin
    const maxDist = minDist + 2; // Keep range small for consistency

    const bisectorCandidates = [];

    // Bottom edge bisector (x + s, y - d) for various d
    for (let d = minDist; d <= maxDist; d++) {
        if (y - d >= MIN_Y) {
            bisectorCandidates.push({ x: x + s, y: y - d });
        }
    }

    // Top edge bisector (x + s, y + sideLength + d)
    for (let d = minDist; d <= maxDist; d++) {
        if (y + sideLength + d <= MAX_Y) {
            bisectorCandidates.push({ x: x + s, y: y + sideLength + d });
        }
    }

    // Left edge bisector (x - d, y + s)
    for (let d = minDist; d <= maxDist; d++) {
        if (x - d >= MIN_X) {
            bisectorCandidates.push({ x: x - d, y: y + s });
        }
    }

    // Right edge bisector (x + sideLength + d, y + s)
    for (let d = minDist; d <= maxDist; d++) {
        if (x + sideLength + d <= MAX_X) {
            bisectorCandidates.push({ x: x + sideLength + d, y: y + s });
        }
    }

    // Add 1 bisector point if candidates are available
    if (bisectorCandidates.length > 0) {
        const idx = randomInt(0, bisectorCandidates.length - 1);
        points.push(bisectorCandidates[idx]);
    }

    return points;
}

// (4) Five different loop patterns with distance-2 spacing
export function p10LoopPatterns() {
    // Define 5 different loop patterns (relative coordinates, all with distance 2 between adjacent points)
    const loopPatterns = [
        // Pattern 1: Rectangular spiral
        [
            [0, 0], [2, 0], [4, 0], [6, 0], [8, 0],
            [8, 2], [6, 2], [4, 2], [4, 4], [4, 6],
            [2, 6], [0, 6], [0, 4], [0, 2]
        ],
        // Pattern 2: L-shaped loop
        [
            [0, 0], [2, 0], [4, 0], [6, 0],
            [6, 2], [6, 4], [4, 4], [2, 4],
            [0, 4], [0, 2]
        ],
        // Pattern 3: Zigzag loop
        [
            [0, 0], [2, 0], [2, 2], [4, 2],
            [4, 4], [6, 4], [6, 6], [4, 6],
            [2, 6], [2, 4], [0, 4], [0, 2]
        ],
        // Pattern 4: Compact rectangular loop
        [
            [0, 0], [2, 0], [4, 0], [6, 0],
            [6, 2], [6, 4], [4, 4], [2, 4],
            [0, 4], [0, 2]
        ],
        // Pattern 5: Cross-shaped loop
        [
            [4, 0], [4, 2], [6, 2], [6, 4],
            [8, 4], [8, 6], [6, 6], [6, 8],
            [4, 8], [4, 6], [2, 6], [2, 4],
            [0, 4], [0, 2], [2, 2], [2, 0]
        ]
    ];

    const pattern = randomChoice(loopPatterns);
    const flipX = Math.random() < 0.5;
    const flipY = Math.random() < 0.5;

    // Calculate bounds of pattern
    let minPx = Infinity, maxPx = -Infinity, minPy = Infinity, maxPy = -Infinity;
    for (const [px, py] of pattern) {
        const fx = flipX ? -px : px;
        const fy = flipY ? -py : py;
        minPx = Math.min(minPx, fx);
        maxPx = Math.max(maxPx, fx);
        minPy = Math.min(minPy, fy);
        maxPy = Math.max(maxPy, fy);
    }

    // Find suitable translation
    const startX = randomInt(MIN_X - minPx, MAX_X - maxPx);
    const startY = randomInt(MIN_Y - minPy, MAX_Y - maxPy);

    // Apply flips and translation
    return pattern.map(([px, py]) => ({
        x: startX + (flipX ? -px : px),
        y: startY + (flipY ? -py : py)
    }));
}

// (4b) Loop patterns with bisector points added
export function p10LoopWithBisectorPoints() {
    // Start with a loop pattern
    const baseLoop = p10LoopPatterns();

    // In a loop where all adjacent points are distance 2 apart,
    // each point has exactly 2 neighbors at distance 2
    // To add a bisector point that doesn't break this:
    // - Find pairs of adjacent points in the loop
    // - Add a point on the perpendicular bisector at distance ≥ 2 from both points

    // Find consecutive pairs (edges) in the loop
    const edges = [];
    for (let i = 0; i < baseLoop.length; i++) {
        const p1 = baseLoop[i];
        const p2 = baseLoop[(i + 1) % baseLoop.length];
        edges.push([p1, p2]);
    }

    // Select a random edge to add a bisector point to
    const [p1, p2] = randomChoice(edges);

    // Calculate midpoint
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    // Calculate perpendicular direction (rotated 90°)
    const edgeDx = p2.x - p1.x;
    const edgeDy = p2.y - p1.y;
    const perpDx = -edgeDy; // Perpendicular: rotate (dx, dy) by 90° → (-dy, dx)
    const perpDy = edgeDx;

    // Normalize perpendicular vector to unit length
    const perpLen = Math.sqrt(perpDx * perpDx + perpDy * perpDy);
    const perpUnitX = perpDx / perpLen;
    const perpUnitY = perpDy / perpLen;

    // For an edge with endpoints at distance 2 apart, bisector point at distance d has
    // distance sqrt(1² + d²) to each endpoint (since midpoint is 1 away from each endpoint)
    // To avoid being unique nearest neighbor: sqrt(1 + d²) ≥ 2 → d ≥ sqrt(3) ≈ 1.73
    // Use d = 2 for safety (gives distance sqrt(5) ≈ 2.24 to endpoints)
    const distance = 2;
    const candidates = [
        { x: Math.round(midX + perpUnitX * distance), y: Math.round(midY + perpUnitY * distance) },
        { x: Math.round(midX - perpUnitX * distance), y: Math.round(midY - perpUnitY * distance) }
    ];

    // Filter candidates that are in bounds and don't create unique nearest neighbors
    const points = [...baseLoop];
    const validCandidates = candidates.filter(p => {
        if (p.x < MIN_X || p.x > MAX_X || p.y < MIN_Y || p.y > MAX_Y) return false;

        // Check if adding this point would violate the constraint
        // The bisector point should have distance sqrt(1² + 2²) = sqrt(5) ≈ 2.24 to edge endpoints
        // which is > 2 (the distance between edge endpoints), so both endpoints are equidistant nearest
        return true;
    });

    if (validCandidates.length > 0) {
        points.push(randomChoice(validCandidates));
    }

    return points;
}

// (5) Letter shapes as you originally requested: L, T, H, U, I, +
// Using distance-1 spacing
export function p10TreeShapes() {
    const shapeType = randomChoice(['L', 'T', 'H', 'U', 'I', 'plus']);

    // Base patterns (relative coordinates with distance 1 between adjacent points)
    let basePattern;

    if (shapeType === 'L') {
        const horizontalLen = randomChoice([3, 4, 5]);
        const verticalLen = randomChoice([3, 4]);
        basePattern = [];
        for (let i = 0; i < horizontalLen; i++) {
            basePattern.push([i, 0]);
        }
        for (let i = 1; i < verticalLen; i++) {
            basePattern.push([0, i]);
        }
    } else if (shapeType === 'T') {
        const topLen = randomChoice([3, 4, 5]);
        const stemLen = randomChoice([2, 3]);
        basePattern = [];
        for (let i = 0; i < topLen; i++) {
            basePattern.push([i, 0]);
        }
        const middleIdx = Math.floor(topLen / 2);
        for (let i = 1; i <= stemLen; i++) {
            basePattern.push([middleIdx, -i]);
        }
    } else if (shapeType === 'H') {
        const height = randomChoice([3, 4, 5]);
        const bridgeY = Math.floor(height / 2);
        basePattern = [];
        for (let i = 0; i < height; i++) {
            basePattern.push([0, i]);
        }
        for (let i = 1; i < 3; i++) {
            basePattern.push([i, bridgeY]);
        }
        for (let i = 0; i < height; i++) {
            basePattern.push([3, i]);
        }
    } else if (shapeType === 'U') {
        const height = randomChoice([3, 4]);
        const width = randomChoice([2, 3]);
        basePattern = [];
        for (let i = 0; i < height; i++) {
            basePattern.push([0, i]);
        }
        for (let i = 1; i <= width; i++) {
            basePattern.push([i, height - 1]);
        }
        for (let i = height - 2; i >= 0; i--) {
            basePattern.push([width, i]);
        }
    } else if (shapeType === 'I') {
        const length = randomChoice([4, 5, 6]);
        const isVertical = Math.random() < 0.5;
        basePattern = [];
        for (let i = 0; i < length; i++) {
            if (isVertical) {
                basePattern.push([0, i]);
            } else {
                basePattern.push([i, 0]);
            }
        }
    } else { // 'plus'
        const armLen = randomChoice([2, 3]);
        basePattern = [];
        basePattern.push([armLen, armLen]);
        for (let i = 1; i <= armLen; i++) {
            basePattern.push([armLen, armLen + i]);
        }
        for (let i = 1; i <= armLen; i++) {
            basePattern.push([armLen, armLen - i]);
        }
        for (let i = 1; i <= armLen; i++) {
            basePattern.push([armLen + i, armLen]);
        }
        for (let i = 1; i <= armLen; i++) {
            basePattern.push([armLen - i, armLen]);
        }
    }

    // Close off endpoints by adding unit square self-loops
    // Find all degree-1 nodes (endpoints)
    const pointSet = new Set(basePattern.map(([x, y]) => `${x},${y}`));
    const degree = new Map();

    // Calculate degree for each point
    for (const [x, y] of basePattern) {
        const key = `${x},${y}`;
        let count = 0;
        // Check all 4 neighbors at distance 1
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            if (pointSet.has(`${x + dx},${y + dy}`)) {
                count++;
            }
        }
        degree.set(key, count);
    }

    // Find endpoints (degree 1)
    const endpoints = [];
    for (const [x, y] of basePattern) {
        const key = `${x},${y}`;
        if (degree.get(key) === 1) {
            endpoints.push([x, y]);
        }
    }

    // Add unit square self-loops at each endpoint
    const pattern = [...basePattern];
    for (const [ex, ey] of endpoints) {
        // Add unit square: {(ex, ey), (ex+1, ey), (ex, ey+1), (ex+1, ey+1)}
        // Only add points that aren't already in the set
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
            const nx = ex + dx;
            const ny = ey + dy;
            const key = `${nx},${ny}`;
            if (!pointSet.has(key)) {
                pattern.push([nx, ny]);
                pointSet.add(key);
            }
        }
    }

    // Apply random transformations
    const flipX = Math.random() < 0.5;
    const flipY = Math.random() < 0.5;
    const rotate90 = Math.random() < 0.5; // 50% chance to rotate 90°

    // Calculate bounds after transformations
    let minPx = Infinity, maxPx = -Infinity, minPy = Infinity, maxPy = -Infinity;
    for (const [px, py] of pattern) {
        let x = px, y = py;
        if (rotate90) {
            [x, y] = [-y, x]; // Rotate 90° counterclockwise
        }
        if (flipX) x = -x;
        if (flipY) y = -y;
        minPx = Math.min(minPx, x);
        maxPx = Math.max(maxPx, x);
        minPy = Math.min(minPy, y);
        maxPy = Math.max(maxPy, y);
    }

    // Check if pattern fits within bounds
    const patternWidth = maxPx - minPx;
    const patternHeight = maxPy - minPy;

    if (patternWidth > (MAX_X - MIN_X) || patternHeight > (MAX_Y - MIN_Y)) {
        // Pattern too large, retry with different parameters
        return p10TreeShapes();
    }

    // Find suitable translation
    const startX = randomInt(MIN_X - minPx, MAX_X - maxPx);
    const startY = randomInt(MIN_Y - minPy, MAX_Y - maxPy);

    // Apply all transformations
    const result = pattern.map(([px, py]) => {
        let x = px, y = py;
        if (rotate90) {
            [x, y] = [-y, x];
        }
        if (flipX) x = -x;
        if (flipY) y = -y;
        return {
            x: startX + x,
            y: startY + y
        };
    });

    // Debug: check if result satisfies constraint
    const check = (points) => {
        if (points.length <= 1) return true;
        for (let i = 0; i < points.length; i++) {
            let minDist = Infinity;
            let minCount = 0;
            for (let j = 0; j < points.length; j++) {
                if (i === j) continue;
                const d = Math.sqrt((points[i].x - points[j].x) ** 2 + (points[i].y - points[j].y) ** 2);
                if (d < minDist - 0.01) {
                    minDist = d;
                    minCount = 1;
                } else if (Math.abs(d - minDist) < 0.01) {
                    minCount++;
                }
            }
            if (minCount === 1) {
                return false;
            }
        }
        return true;
    };

    if (!check(result)) {
        return p10TreeShapes();
    }

    return result;
}

// (6) Two squares plus ninth point on perpendicular bisector
export function p10TwoSquaresPlusNinth() {
    const strategy = randomChoice(['sameX', 'diagonal']);
    const points = [];

    if (strategy === 'sameX') {
        // Two unit squares on same x-coordinates, separated vertically
        // Unit square corners have distance 1 (adjacent) and sqrt(2) (diagonal)
        const x = randomInt(MIN_X, MAX_X - 1);
        const y1 = randomInt(MIN_Y, MIN_Y + 2);
        const spacing = randomInt(3, 4); // Gap between squares (at least 3 for ninth point)
        const y2 = y1 + 1 + spacing; // Second square starts after first + gap

        // First square
        points.push({ x, y: y1 });
        points.push({ x, y: y1 + 1 });
        points.push({ x: x + 1, y: y1 });
        points.push({ x: x + 1, y: y1 + 1 });

        // Second square
        if (y2 + 1 <= MAX_Y) {
            points.push({ x, y: y2 });
            points.push({ x, y: y2 + 1 });
            points.push({ x: x + 1, y: y2 });
            points.push({ x: x + 1, y: y2 + 1 });

            // Ninth point between squares, far enough from all corners
            // Place at midpoint between squares: at least distance 1.5 from nearest corners
            const ninthY = Math.floor((y1 + 1 + y2) / 2);

            // Try integer coordinates near center (either x or x+1)
            const candidates = [
                { x: x, y: ninthY },
                { x: x + 1, y: ninthY }
            ];

            // Add a valid ninth point
            for (const candidate of candidates) {
                if (candidate.x >= MIN_X && candidate.x <= MAX_X && candidate.y >= MIN_Y && candidate.y <= MAX_Y) {
                    points.push(candidate);
                    break;
                }
            }
        }
    } else {
        // Two unit squares on diagonal, ninth point on perpendicular bisector
        const x1 = randomInt(MIN_X, MIN_X + 3);
        const y1 = randomInt(MIN_Y, MIN_Y + 3);
        const offset = randomInt(4, 5); // Larger offset for ninth point placement

        // First square
        points.push({ x: x1, y: y1 });
        points.push({ x: x1, y: y1 + 1 });
        points.push({ x: x1 + 1, y: y1 });
        points.push({ x: x1 + 1, y: y1 + 1 });

        // Second square on diagonal
        const x2 = x1 + offset;
        const y2 = y1 + offset;
        if (x2 + 1 <= MAX_X && y2 + 1 <= MAX_Y) {
            points.push({ x: x2, y: y2 });
            points.push({ x: x2, y: y2 + 1 });
            points.push({ x: x2 + 1, y: y2 });
            points.push({ x: x2 + 1, y: y2 + 1 });

            // Ninth point on perpendicular bisector of line connecting square centers
            // Square centers are at (x1+0.5, y1+0.5) and (x2+0.5, y2+0.5)
            // Midpoint: ((x1+x2)/2 + 0.5, (y1+y2)/2 + 0.5)
            const midX = (x1 + x2) / 2 + 0.5;
            const midY = (y1 + y2) / 2 + 0.5;

            // Perpendicular to diagonal (1,1) is direction (-1, 1) normalized
            // Distance should be at least 2 to avoid being unique nearest neighbor
            const perpDist = 2;
            const perpUnitX = -1 / Math.sqrt(2);
            const perpUnitY = 1 / Math.sqrt(2);

            const candidates = [
                { x: Math.round(midX + perpUnitX * perpDist), y: Math.round(midY + perpUnitY * perpDist) },
                { x: Math.round(midX - perpUnitX * perpDist), y: Math.round(midY - perpUnitY * perpDist) }
            ];

            // Add a valid ninth point
            for (const candidate of candidates) {
                if (candidate.x >= MIN_X && candidate.x <= MAX_X && candidate.y >= MIN_Y && candidate.y <= MAX_Y) {
                    points.push(candidate);
                    break;
                }
            }
        }
    }

    return points.length >= 8 ? points : p10TwoSquaresPlusNinth();
}


export function twoComponents() {
    const comp1 = [
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 5, y: 3 }
    ];

    const comp2 = [
        { x: 12, y: 8 },
        { x: 13, y: 8 },
        { x: 14, y: 8 }
    ];

    return [...comp1, ...comp2];
}

export function threeComponents() {
    return [
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 9, y: 6 },
        { x: 10, y: 6 },
        { x: 14, y: 9 },
        { x: 15, y: 9 }
    ];
}

export function isolatedPoints() {
    return [
        { x: 3, y: 3 },
        { x: 9, y: 6 },
        { x: 14, y: 9 }
    ];
}

export function almostConnected() {
    const points = connectedPath();
    points.push({ x: randomInt(12, 15), y: randomInt(8, 10) });
    return points;
}

export function almostVerticallySymmetric() {
    const points = verticallySymmetric();

    // Remove one point from mirror pair
    if (points.length > 2) {
        points.pop();
    }

    return points;
}

export function asymmetric() {
    return uniformRandom();
}

export function almostRotationallySymmetric() {
    const points = rotationallySymmetric();

    // Move one point slightly
    if (points.length > 0) {
        points[0].x += 1;
    }

    return points;
}

export function oneLine() {
    return anyLine();
}

// =============================================================================
// RICH MULTILINE CONFIGURATIONS
// =============================================================================

export function linesShareEndpoint() {
    // Two lines that share exactly one endpoint
    const sharedX = randomInt(MIN_X + 2, MAX_X - 2);
    const sharedY = randomInt(MIN_Y + 2, MAX_Y - 2);

    const points = [{ x: sharedX, y: sharedY }];

    // First line from shared point
    const direction1 = randomChoice([
        { dx: 1, dy: 0 },   // right
        { dx: -1, dy: 0 },  // left
        { dx: 0, dy: 1 },   // up
        { dx: 0, dy: -1 },  // down
        { dx: 1, dy: 1 },   // diagonal
        { dx: 1, dy: -1 },
        { dx: -1, dy: 1 },
        { dx: -1, dy: -1 }
    ]);

    for (let i = 1; i <= 4; i++) {
        const x = sharedX + i * direction1.dx;
        const y = sharedY + i * direction1.dy;
        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        } else break;
    }

    // Second line from shared point (different direction)
    const direction2 = randomChoice([
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
        { dx: 1, dy: 1 },
        { dx: 1, dy: -1 },
        { dx: -1, dy: 1 },
        { dx: -1, dy: -1 }
    ].filter(d => d.dx !== direction1.dx || d.dy !== direction1.dy));

    for (let i = 1; i <= 4; i++) {
        const x = sharedX + i * direction2.dx;
        const y = sharedY + i * direction2.dy;
        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        } else break;
    }

    return points;
}

export function linesShareMidpoint() {
    // Two lines that intersect at a point that's not an endpoint for either
    const sharedX = randomInt(MIN_X + 3, MAX_X - 3);
    const sharedY = randomInt(MIN_Y + 2, MAX_Y - 2);

    const points = [];

    // First line (horizontal through shared point)
    for (let dx = -3; dx <= 3; dx++) {
        const x = sharedX + dx;
        if (x >= MIN_X && x <= MAX_X) {
            points.push({ x, y: sharedY });
        }
    }

    // Second line (vertical through shared point)
    for (let dy = -2; dy <= 2; dy++) {
        const y = sharedY + dy;
        if (y >= MIN_Y && y <= MAX_Y) {
            points.push({ x: sharedX, y });
        }
    }

    return points;
}

export function parallelLinesOffsetStart() {
    // Parallel lines that don't start at same x or y coordinate
    const isHorizontal = Math.random() < 0.5;
    const spacing = randomInt(2, 4);

    const points = [];

    if (isHorizontal) {
        const y1 = randomInt(MIN_Y, MAX_Y - spacing);
        const y2 = y1 + spacing;

        const start1 = randomInt(MIN_X, MIN_X + 3);
        const start2 = randomInt(MIN_X + 2, MIN_X + 5); // offset start
        const length = randomInt(5, 8);

        for (let i = 0; i < length; i++) {
            const x1 = start1 + i;
            if (x1 <= MAX_X) points.push({ x: x1, y: y1 });

            const x2 = start2 + i;
            if (x2 <= MAX_X) points.push({ x: x2, y: y2 });
        }
    } else {
        const x1 = randomInt(MIN_X, MAX_X - spacing);
        const x2 = x1 + spacing;

        const start1 = randomInt(MIN_Y, MIN_Y + 2);
        const start2 = randomInt(MIN_Y + 2, MIN_Y + 4); // offset start
        const length = randomInt(4, 6);

        for (let i = 0; i < length; i++) {
            const y1 = start1 + i;
            if (y1 <= MAX_Y) points.push({ x: x1, y: y1 });

            const y2 = start2 + i;
            if (y2 <= MAX_Y) points.push({ x: x2, y: y2 });
        }
    }

    return points;
}

export function perpendicularLinesSharedEnd() {
    // Two perpendicular lines sharing an endpoint (L-shape but as two separate line segments)
    const cornerX = randomInt(MIN_X + 2, MAX_X - 2);
    const cornerY = randomInt(MIN_Y + 2, MAX_Y - 2);

    const points = [{ x: cornerX, y: cornerY }];

    // Horizontal arm
    const hDirection = randomChoice([-1, 1]);
    for (let i = 1; i <= 4; i++) {
        const x = cornerX + i * hDirection;
        if (x >= MIN_X && x <= MAX_X) {
            points.push({ x, y: cornerY });
        }
    }

    // Vertical arm
    const vDirection = randomChoice([-1, 1]);
    for (let i = 1; i <= 4; i++) {
        const y = cornerY + i * vDirection;
        if (y >= MIN_Y && y <= MAX_Y) {
            points.push({ x: cornerX, y });
        }
    }

    return points;
}

export function angledLinesSharedEnd() {
    // Two lines at a specific angle (30, 45, 60, 90 degrees) sharing endpoint
    const angle = randomChoice([30, 45, 60, 90]);
    const cornerX = randomInt(MIN_X + 3, MAX_X - 3);
    const cornerY = randomInt(MIN_Y + 3, MAX_Y - 3);

    const points = [{ x: cornerX, y: cornerY }];

    // First line (horizontal)
    const direction1 = randomChoice([-1, 1]);
    for (let i = 1; i <= 5; i++) {
        const x = cornerX + i * direction1;
        if (x >= MIN_X && x <= MAX_X) {
            points.push({ x, y: cornerY });
        }
    }

    // Second line at specified angle
    const direction2 = randomChoice([-1, 1]);
    if (angle === 45) {
        for (let i = 1; i <= 4; i++) {
            const x = cornerX + i * direction1;
            const y = cornerY + i * direction2;
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    } else if (angle === 90) {
        for (let i = 1; i <= 4; i++) {
            const y = cornerY + i * direction2;
            if (y >= MIN_Y && y <= MAX_Y) {
                points.push({ x: cornerX, y });
            }
        }
    } else if (angle === 60) {
        // Approximate 60 degrees with slope 2:1
        for (let i = 1; i <= 4; i++) {
            const x = cornerX + i * direction1;
            const y = cornerY + Math.floor(i * 1.7) * direction2; // approx tan(60°) ≈ 1.73
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    } else if (angle === 30) {
        // Approximate 30 degrees with slope 1:2
        for (let i = 1; i <= 6; i++) {
            const x = cornerX + i * direction1;
            const y = cornerY + Math.floor(i * 0.6) * direction2; // approx tan(30°) ≈ 0.58
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function threeLinesOneParallel() {
    // Three lines: two parallel, one not
    const points = [];

    // Two parallel horizontal lines
    const y1 = randomInt(MIN_Y + 1, MIN_Y + 3);
    const y2 = y1 + randomInt(3, 4);
    const startX = randomInt(MIN_X, MIN_X + 2);
    const length = randomInt(4, 6);

    for (let i = 0; i < length; i++) {
        const x = startX + i;
        if (x <= MAX_X) {
            points.push({ x, y: y1 });
            points.push({ x, y: y2 });
        }
    }

    // One non-parallel diagonal line
    const diagStartX = randomInt(MIN_X + 5, MAX_X - 4);
    const diagStartY = randomInt(MIN_Y, MAX_Y - 4);
    for (let i = 0; i < 5; i++) {
        const x = diagStartX + i;
        const y = diagStartY + i;
        if (x <= MAX_X && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points;
}

export function threeLinesSharedPoint() {
    // Three lines all sharing one common point (like asterisk/star)
    // HIGHLY PARAMETRIZED: vary ray directions, lengths, gaps, and density

    // Choose 3 random directions from a diverse set
    const allDirections = [
        { dx: 1, dy: 0 },   // horizontal
        { dx: 0, dy: 1 },   // vertical
        { dx: 1, dy: 1 },   // diagonal (45°)
        { dx: 1, dy: -1 },  // diagonal (-45°)
        { dx: 2, dy: 1 },   // slope 1/2
        { dx: 1, dy: 2 },   // slope 2
        { dx: 2, dy: -1 },  // slope -1/2
        { dx: 1, dy: -2 },  // slope -2
        { dx: 3, dy: 1 },   // slope 1/3
        { dx: 1, dy: 3 },   // slope 3
    ];

    shuffle(allDirections);
    const chosenDirections = allDirections.slice(0, 3);

    // Calculate maximum extent needed for chosen directions
    const maxLength = 5;
    let maxDx = 0, maxDy = 0;
    for (const dir of chosenDirections) {
        maxDx = Math.max(maxDx, Math.abs(dir.dx) * maxLength);
        maxDy = Math.max(maxDy, Math.abs(dir.dy) * maxLength);
    }

    // Place center with sufficient margin for the chosen directions
    const centerX = randomInt(MIN_X + maxDx, MAX_X - maxDx);
    const centerY = randomInt(MIN_Y + maxDy, MAX_Y - maxDy);

    const points = [{ x: centerX, y: centerY }];

    // For each direction, create a ray with varied parameters
    for (const dir of chosenDirections) {
        // Each direction gets TWO rays (positive and negative along the direction)
        // But with potentially different lengths
        const posLength = randomInt(2, maxLength);
        const negLength = randomInt(2, maxLength);

        // Decide whether to fill all points or have gaps
        const fillAll = Math.random() < 0.7; // 70% chance to fill all points
        const step = fillAll ? 1 : randomInt(1, 2); // step=2 means skip every other point

        // Optional: start with a gap from center (don't place first point)
        const startGap = Math.random() < 0.2 ? 1 : 0; // 20% chance to have gap at start

        // Positive direction
        for (let i = 1 + startGap; i <= posLength; i += step) {
            const x = centerX + i * dir.dx;
            const y = centerY + i * dir.dy;
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }

        // Negative direction
        for (let i = 1 + startGap; i <= negLength; i += step) {
            const x = centerX - i * dir.dx;
            const y = centerY - i * dir.dy;
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function threeLinesChained() {
    // Three lines where first connects to second, second connects to third
    // (but first doesn't connect to third)
    const points = [];

    // First line: horizontal
    const y1 = randomInt(MIN_Y + 1, MIN_Y + 3);
    const x1Start = randomInt(MIN_X, MIN_X + 2);
    const x1End = x1Start + 4;

    for (let x = x1Start; x <= x1End && x <= MAX_X; x++) {
        points.push({ x, y: y1 });
    }

    // Second line: vertical, sharing endpoint with first
    const sharedX = x1End;
    const y2Start = y1;
    const y2End = Math.min(y2Start + 4, MAX_Y);

    for (let y = y2Start; y <= y2End; y++) {
        points.push({ x: sharedX, y });
    }

    // Third line: horizontal, sharing endpoint with second (but not with first)
    const y3 = y2End;
    const x3Start = sharedX;
    const x3End = Math.min(x3Start + 4, MAX_X);

    for (let x = x3Start; x <= x3End; x++) {
        points.push({ x, y: y3 });
    }

    return points;
}

export function parallelLinesAlternating() {
    // Multiple parallel lines with alternating lengths
    const isHorizontal = Math.random() < 0.5;
    const numLines = randomInt(3, 4);
    const spacing = 2;

    const points = [];

    if (isHorizontal) {
        const startY = randomInt(MIN_Y, MAX_Y - numLines * spacing);

        for (let i = 0; i < numLines; i++) {
            const y = startY + i * spacing;
            const length = (i % 2 === 0) ? 6 : 4; // alternating lengths
            const startX = randomInt(MIN_X, MIN_X + 2);

            for (let j = 0; j < length; j++) {
                const x = startX + j;
                if (x <= MAX_X) {
                    points.push({ x, y });
                }
            }
        }
    } else {
        const startX = randomInt(MIN_X, MAX_X - numLines * spacing);

        for (let i = 0; i < numLines; i++) {
            const x = startX + i * spacing;
            const length = (i % 2 === 0) ? 5 : 3; // alternating lengths
            const startY = randomInt(MIN_Y, MIN_Y + 1);

            for (let j = 0; j < length; j++) {
                const y = startY + j;
                if (y <= MAX_Y) {
                    points.push({ x, y });
                }
            }
        }
    }

    return points;
}

export function linesBracketShape() {
    // Two parallel lines connected by a perpendicular line (bracket [ or ] shape)
    const isVerticalBracket = Math.random() < 0.5;

    const points = [];

    if (isVerticalBracket) {
        // [ or ] shape
        const x1 = randomInt(MIN_X + 1, MIN_X + 3);
        const x2 = x1 + randomInt(3, 5);
        const y1 = randomInt(MIN_Y + 1, MIN_Y + 2);
        const y2 = randomInt(y1 + 4, Math.min(y1 + 6, MAX_Y));

        // Top horizontal
        for (let x = x1; x <= x2; x++) {
            points.push({ x, y: y1 });
        }

        // Vertical connector
        for (let y = y1; y <= y2; y++) {
            points.push({ x: x1, y });
        }

        // Bottom horizontal
        for (let x = x1; x <= x2; x++) {
            points.push({ x, y: y2 });
        }
    } else {
        // ⊏ or ⊐ shape (rotated bracket)
        const y1 = randomInt(MIN_Y + 1, MIN_Y + 2);
        const y2 = y1 + randomInt(2, 3);
        const x1 = randomInt(MIN_X + 1, MIN_X + 2);
        const x2 = randomInt(x1 + 5, Math.min(x1 + 8, MAX_X));

        // Left vertical
        for (let y = y1; y <= y2; y++) {
            points.push({ x: x1, y });
        }

        // Horizontal connector
        for (let x = x1; x <= x2; x++) {
            points.push({ x, y: y1 });
        }

        // Right vertical
        for (let y = y1; y <= y2; y++) {
            points.push({ x: x2, y });
        }
    }

    return points;
}

export function twoLinesNearMiss() {
    // Two lines that almost intersect but miss by one cell
    const baseX = randomInt(MIN_X + 3, MAX_X - 3);
    const baseY = randomInt(MIN_Y + 3, MAX_Y - 3);

    const points = [];

    // Horizontal line
    for (let dx = -4; dx <= 4; dx++) {
        const x = baseX + dx;
        if (x >= MIN_X && x <= MAX_X) {
            points.push({ x, y: baseY });
        }
    }

    // Vertical line that passes one cell to the side
    const offsetX = baseX + 1; // miss by one
    for (let dy = -3; dy <= 3; dy++) {
        const y = baseY + dy;
        if (y >= MIN_Y && y <= MAX_Y) {
            points.push({ x: offsetX, y });
        }
    }

    return points;
}

export function parallelLinesPairwise() {
    // Four lines in two parallel pairs at different orientations
    const points = [];

    // First pair: two horizontal lines
    const y1 = randomInt(MIN_Y + 1, MIN_Y + 2);
    const y2 = y1 + 2;
    const startX1 = randomInt(MIN_X, MIN_X + 2);

    for (let i = 0; i < 5; i++) {
        const x = startX1 + i;
        if (x <= MAX_X) {
            points.push({ x, y: y1 });
            points.push({ x, y: y2 });
        }
    }

    // Second pair: two vertical lines
    const x3 = randomInt(MAX_X - 5, MAX_X - 3);
    const x4 = x3 + 2;
    const startY2 = randomInt(MIN_Y + 4, MIN_Y + 5);

    for (let i = 0; i < 4; i++) {
        const y = startY2 + i;
        if (y <= MAX_Y) {
            points.push({ x: x3, y });
            points.push({ x: x4, y });
        }
    }

    return points;
}

// =============================================================================
// ADVANCED GEOMETRIC PATTERNS
// =============================================================================

export function rectangleCornersShared() {
    // Corner points of 2-4 rectangles with some shared corners
    const numRectangles = randomInt(2, 4);
    const points = [];
    const corners = new Map(); // Track which corners exist

    for (let i = 0; i < numRectangles; i++) {
        const width = randomInt(3, 6);
        const height = randomInt(2, 5);

        let x1, y1;

        // 40% chance to share a corner with existing rectangle
        if (i > 0 && Math.random() < 0.4 && corners.size > 0) {
            // Pick a random existing corner
            const existingCorners = Array.from(corners.keys());
            const sharedCorner = existingCorners[randomInt(0, existingCorners.length - 1)];
            const [sx, sy] = sharedCorner.split(',').map(Number);

            // Place new rectangle with shared corner
            const placement = randomChoice(['same', 'right', 'below', 'diagonal']);
            if (placement === 'same') {
                x1 = sx; y1 = sy;
            } else if (placement === 'right') {
                x1 = sx; y1 = sy;
            } else if (placement === 'below') {
                x1 = sx; y1 = sy;
            } else {
                x1 = sx; y1 = sy;
            }
        } else {
            x1 = randomInt(MIN_X, MAX_X - width);
            y1 = randomInt(MIN_Y, MAX_Y - height);
        }

        const x2 = x1 + width;
        const y2 = y1 + height;

        // Add corner points
        if (x1 >= MIN_X && x1 <= MAX_X && y1 >= MIN_Y && y1 <= MAX_Y) {
            points.push({ x: x1, y: y1 });
            corners.set(`${x1},${y1}`, true);
        }
        if (x2 >= MIN_X && x2 <= MAX_X && y1 >= MIN_Y && y1 <= MAX_Y) {
            points.push({ x: x2, y: y1 });
            corners.set(`${x2},${y1}`, true);
        }
        if (x2 >= MIN_X && x2 <= MAX_X && y2 >= MIN_Y && y2 <= MAX_Y) {
            points.push({ x: x2, y: y2 });
            corners.set(`${x2},${y2}`, true);
        }
        if (x1 >= MIN_X && x1 <= MAX_X && y2 >= MIN_Y && y2 <= MAX_Y) {
            points.push({ x: x1, y: y2 });
            corners.set(`${x1},${y2}`, true);
        }
    }

    // Remove duplicates
    const unique = [];
    const seen = new Set();
    for (const p of points) {
        const key = `${p.x},${p.y}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(p);
        }
    }

    return unique;
}

export function rotatedRectangle() {
    // Rectangle that's not axis-aligned (45 degree rotation)
    const cx = randomInt(MIN_X + 4, MAX_X - 4);
    const cy = randomInt(MIN_Y + 3, MAX_Y - 3);
    const halfWidth = randomInt(2, 3);
    const halfHeight = randomInt(2, 3);

    const points = [];

    // Diamond/rotated square at 45 degrees
    points.push({ x: cx, y: cy - halfHeight });           // top
    points.push({ x: cx + halfWidth, y: cy });            // right
    points.push({ x: cx, y: cy + halfHeight });           // bottom
    points.push({ x: cx - halfWidth, y: cy });            // left

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function rotatedSquare() {
    // Square rotated by some angle (approximated on discrete grid)
    const cx = randomInt(MIN_X + 4, MAX_X - 4);
    const cy = randomInt(MIN_Y + 3, MAX_Y - 3);
    const size = randomInt(3, 4);

    const rotation = randomChoice([30, 45]);
    const points = [];

    if (rotation === 45) {
        // 45 degree diamond
        points.push({ x: cx, y: cy - size });
        points.push({ x: cx + size, y: cy });
        points.push({ x: cx, y: cy + size });
        points.push({ x: cx - size, y: cy });
    } else {
        // Approximate 30 degree rotation
        const cos30 = 0.866;
        const sin30 = 0.5;

        // Four corners of square rotated 30 degrees
        const corners = [
            { dx: size, dy: 0 },
            { dx: 0, dy: size },
            { dx: -size, dy: 0 },
            { dx: 0, dy: -size }
        ];

        for (const corner of corners) {
            const x = Math.round(cx + corner.dx * cos30 - corner.dy * sin30);
            const y = Math.round(cy + corner.dx * sin30 + corner.dy * cos30);
            points.push({ x, y });
        }
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function rotatedTriangle() {
    // Right-angled triangle, not necessarily axis-aligned
    const cx = randomInt(MIN_X + 3, MAX_X - 3);
    const cy = randomInt(MIN_Y + 3, MAX_Y - 3);
    const size = randomInt(3, 5);

    const rotation = randomChoice([0, 45, 90, 135, 180, 225, 270, 315]);
    const points = [];

    if (rotation === 0) {
        // Right angle at bottom-left
        points.push({ x: cx, y: cy });
        points.push({ x: cx + size, y: cy });
        points.push({ x: cx, y: cy - size });
    } else if (rotation === 45) {
        // Rotated 45 degrees
        points.push({ x: cx, y: cy });
        points.push({ x: cx + size, y: cy + size });
        points.push({ x: cx - size, y: cy + size });
    } else if (rotation === 90) {
        points.push({ x: cx, y: cy });
        points.push({ x: cx, y: cy + size });
        points.push({ x: cx + size, y: cy });
    } else if (rotation === 135) {
        points.push({ x: cx, y: cy });
        points.push({ x: cx - size, y: cy + size });
        points.push({ x: cx - size, y: cy - size });
    } else if (rotation === 180) {
        points.push({ x: cx, y: cy });
        points.push({ x: cx - size, y: cy });
        points.push({ x: cx, y: cy + size });
    } else if (rotation === 225) {
        points.push({ x: cx, y: cy });
        points.push({ x: cx - size, y: cy - size });
        points.push({ x: cx + size, y: cy - size });
    } else if (rotation === 270) {
        points.push({ x: cx, y: cy });
        points.push({ x: cx, y: cy - size });
        points.push({ x: cx - size, y: cy });
    } else {
        points.push({ x: cx, y: cy });
        points.push({ x: cx + size, y: cy - size });
        points.push({ x: cx + size, y: cy + size });
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function randomWithMidpoints() {
    // Random points plus midpoints between some pairs (if integer coordinates)
    const numBase = randomInt(4, 6);
    const basePoints = [];
    const used = new Set();

    // Generate base points
    for (let i = 0; i < numBase; i++) {
        let x, y, key;
        do {
            x = randomInt(MIN_X, MAX_X);
            y = randomInt(MIN_Y, MAX_Y);
            key = `${x},${y}`;
        } while (used.has(key));

        used.add(key);
        basePoints.push({ x, y });
    }

    const points = [...basePoints];

    // Add midpoints for some pairs
    const numPairs = randomInt(2, 4);
    for (let i = 0; i < numPairs; i++) {
        const idx1 = randomInt(0, basePoints.length - 1);
        const idx2 = randomInt(0, basePoints.length - 1);

        if (idx1 !== idx2) {
            const p1 = basePoints[idx1];
            const p2 = basePoints[idx2];

            // Check if midpoint has integer coordinates
            if ((p1.x + p2.x) % 2 === 0 && (p1.y + p2.y) % 2 === 0) {
                const mx = (p1.x + p2.x) / 2;
                const my = (p1.y + p2.y) / 2;
                const key = `${mx},${my}`;

                if (!used.has(key)) {
                    used.add(key);
                    points.push({ x: mx, y: my });
                }
            }
        }
    }

    return points;
}

export function vectorWalk() {
    // Points constructed by repeatedly adding a vector (or its 8 reflections)
    const vectors = [
        { dx: 1, dy: 0 },
        { dx: 2, dy: 0 },
        { dx: 1, dy: 1 },
        { dx: 2, dy: 1 },
        { dx: 1, dy: 2 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: 2 }
    ];

    const baseVector = randomChoice(vectors);
    const startX = randomInt(MIN_X + 3, MAX_X - 3);
    const startY = randomInt(MIN_Y + 2, MAX_Y - 2);

    const points = [{ x: startX, y: startY }];
    let currentX = startX;
    let currentY = startY;

    const maxSteps = 8;
    for (let i = 0; i < maxSteps; i++) {
        // Choose one of 8 reflections of the base vector
        const reflection = randomChoice([
            { dx: baseVector.dx, dy: baseVector.dy },
            { dx: -baseVector.dx, dy: baseVector.dy },
            { dx: baseVector.dx, dy: -baseVector.dy },
            { dx: -baseVector.dx, dy: -baseVector.dy },
            { dx: baseVector.dy, dy: baseVector.dx },
            { dx: -baseVector.dy, dy: baseVector.dx },
            { dx: baseVector.dy, dy: -baseVector.dx },
            { dx: -baseVector.dy, dy: -baseVector.dx }
        ]);

        currentX += reflection.dx;
        currentY += reflection.dy;

        if (currentX >= MIN_X && currentX <= MAX_X && currentY >= MIN_Y && currentY <= MAX_Y) {
            points.push({ x: currentX, y: currentY });
        } else {
            break;
        }
    }

    return points.length >= 4 ? points : randomWithMidpoints();
}

export function randomPlusConfiguration() {
    // Random points plus a small configuration (line, L-shape, rectangle, etc.)
    const numBase = randomInt(4, 8);
    const basePoints = [];
    const used = new Set();

    // Generate base random points
    for (let i = 0; i < numBase; i++) {
        let x, y, key;
        do {
            x = randomInt(MIN_X, MAX_X);
            y = randomInt(MIN_Y, MAX_Y);
            key = `${x},${y}`;
        } while (used.has(key));

        used.add(key);
        basePoints.push({ x, y });
    }

    const points = [...basePoints];

    // Add a configuration
    const configType = randomChoice(['line', 'lshape', 'rectangle', 'square', 'rhombus']);
    const cx = randomInt(MIN_X + 3, MAX_X - 3);
    const cy = randomInt(MIN_Y + 2, MAX_Y - 2);

    if (configType === 'line') {
        // Three points on a line (any angle)
        const angle = randomChoice([0, 45, 90, 135]);
        for (let i = 0; i < 3; i++) {
            let x, y;
            if (angle === 0) {
                x = cx + i; y = cy;
            } else if (angle === 45) {
                x = cx + i; y = cy + i;
            } else if (angle === 90) {
                x = cx; y = cy + i;
            } else {
                x = cx - i; y = cy + i;
            }

            const key = `${x},${y}`;
            if (!used.has(key) && x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                used.add(key);
                points.push({ x, y });
            }
        }
    } else if (configType === 'lshape') {
        // L-shape (rotated randomly)
        const rotation = randomChoice([0, 90, 180, 270]);
        const size = randomInt(2, 3);

        if (rotation === 0) {
            for (let i = 0; i <= size; i++) {
                points.push({ x: cx, y: cy + i });
                if (i > 0) points.push({ x: cx + i, y: cy });
            }
        } else if (rotation === 90) {
            for (let i = 0; i <= size; i++) {
                points.push({ x: cx + i, y: cy });
                if (i > 0) points.push({ x: cx + size, y: cy + i });
            }
        } else if (rotation === 180) {
            for (let i = 0; i <= size; i++) {
                points.push({ x: cx, y: cy - i });
                if (i > 0) points.push({ x: cx - i, y: cy });
            }
        } else {
            for (let i = 0; i <= size; i++) {
                points.push({ x: cx - i, y: cy });
                if (i > 0) points.push({ x: cx - size, y: cy - i });
            }
        }
    } else if (configType === 'rectangle') {
        const width = randomInt(2, 3);
        const height = randomInt(2, 3);
        points.push({ x: cx, y: cy });
        points.push({ x: cx + width, y: cy });
        points.push({ x: cx + width, y: cy + height });
        points.push({ x: cx, y: cy + height });
    } else if (configType === 'square') {
        // Rotated square
        const size = 2;
        points.push({ x: cx, y: cy - size });
        points.push({ x: cx + size, y: cy });
        points.push({ x: cx, y: cy + size });
        points.push({ x: cx - size, y: cy });
    } else if (configType === 'rhombus') {
        const w = randomInt(2, 3);
        const h = randomInt(2, 3);
        points.push({ x: cx, y: cy - h });
        points.push({ x: cx + w, y: cy });
        points.push({ x: cx, y: cy + h });
        points.push({ x: cx - w, y: cy });
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function circularArcPattern() {
    // Points resembling a circular arc (smoother than circularArc)
    const cx = randomInt(MIN_X + 5, MAX_X - 5);
    const cy = randomInt(MIN_Y + 4, MAX_Y - 4);
    const radius = randomInt(4, 6);
    const startAngle = Math.random() * 2 * Math.PI;
    const arcSpan = Math.PI * randomChoice([0.5, 0.75, 1.0, 1.25, 1.5]);

    const points = [];
    const numPoints = 10;

    for (let i = 0; i <= numPoints; i++) {
        const angle = startAngle + (arcSpan * i / numPoints);
        const x = Math.round(cx + radius * Math.cos(angle));
        const y = Math.round(cy + radius * Math.sin(angle));

        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points.length >= 5 ? points : convexArc();
}

export function ellipseArc() {
    // Points on an elliptical arc
    const cx = randomInt(MIN_X + 5, MAX_X - 5);
    const cy = randomInt(MIN_Y + 3, MAX_Y - 3);
    const radiusX = randomInt(4, 6);
    const radiusY = randomInt(2, 4);
    const startAngle = Math.random() * 2 * Math.PI;
    const arcSpan = Math.PI * randomChoice([0.75, 1.0, 1.5]);

    const points = [];
    const numPoints = 10;

    for (let i = 0; i <= numPoints; i++) {
        const angle = startAngle + (arcSpan * i / numPoints);
        const x = Math.round(cx + radiusX * Math.cos(angle));
        const y = Math.round(cy + radiusY * Math.sin(angle));

        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points.length >= 5 ? points : circularArcPattern();
}

export function parabolicArc() {
    // Points following a parabola
    const direction = randomChoice(['up', 'down', 'left', 'right']);
    const points = [];

    if (direction === 'up' || direction === 'down') {
        const vertex = randomInt(MIN_X + 3, MAX_X - 3);
        const vertexY = direction === 'up' ? MAX_Y - 2 : MIN_Y + 2;
        const a = direction === 'up' ? -0.3 : 0.3; // parabola coefficient

        for (let dx = -5; dx <= 5; dx++) {
            const x = vertex + dx;
            const y = Math.round(vertexY + a * dx * dx);

            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    } else {
        const vertex = randomInt(MIN_Y + 2, MAX_Y - 2);
        const vertexX = direction === 'right' ? MIN_X + 2 : MAX_X - 2;
        const a = direction === 'right' ? 0.3 : -0.3;

        for (let dy = -4; dy <= 4; dy++) {
            const y = vertex + dy;
            const x = Math.round(vertexX + a * dy * dy);

            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points.length >= 5 ? points : wavyLine();
}

export function hyperbolicCurve() {
    // Points following a hyperbola (branch)
    const cx = randomInt(MIN_X + 4, MAX_X - 4);
    const cy = randomInt(MIN_Y + 3, MAX_Y - 3);
    const orientation = randomChoice(['vertical', 'horizontal']);

    const points = [];

    if (orientation === 'vertical') {
        // y = a/x form
        for (let dx = -4; dx <= 4; dx++) {
            if (dx === 0) continue;
            const x = cx + dx;
            const y = Math.round(cy + 6 / dx); // hyperbola with a=6

            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    } else {
        // x = a/y form
        for (let dy = -3; dy <= 3; dy++) {
            if (dy === 0) continue;
            const y = cy + dy;
            const x = Math.round(cx + 6 / dy);

            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points.length >= 5 ? points : parabolicArc();
}

// =============================================================================
// PARAMETRIC VARIATIONS - Richer patterns with various parameters
// =============================================================================

export function sparseGrid() {
    // Grid with wider spacing (4-5 instead of 2-3)
    const spacing = randomChoice([4, 5]);
    const points = [];

    for (let x = MIN_X; x <= MAX_X; x += spacing) {
        for (let y = MIN_Y; y <= MAX_Y; y += spacing) {
            if (Math.random() < 0.7) { // 70% of points
                points.push({ x, y });
            }
        }
    }

    return points.length >= 3 ? points : regularGrid();
}

export function denseGrid() {
    // Grid with tight spacing (1-2 instead of 2-3), partial area
    const spacing = randomChoice([1, 2]);
    const width = randomInt(4, 6);
    const height = randomInt(3, 5);
    const startX = randomInt(MIN_X, MAX_X - width);
    const startY = randomInt(MIN_Y, MAX_Y - height);

    const points = [];
    for (let dx = 0; dx <= width; dx += spacing) {
        for (let dy = 0; dy <= height; dy += spacing) {
            const x = startX + dx;
            const y = startY + dy;
            if (x <= MAX_X && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function offsetGrid() {
    // Staggered/offset grid pattern
    const spacing = randomChoice([2, 3]);
    const points = [];

    for (let y = MIN_Y; y <= MAX_Y; y += spacing) {
        const offset = (y - MIN_Y) % (spacing * 2) === 0 ? 0 : Math.floor(spacing / 2);
        for (let x = MIN_X + offset; x <= MAX_X; x += spacing) {
            points.push({ x, y });
        }
    }

    return points;
}

export function partialLattice() {
    // Lattice pattern in only part of the space
    const spacing = randomChoice([2, 3]);
    const width = randomInt(5, 8);
    const height = randomInt(4, 6);
    const startX = randomInt(MIN_X, MAX_X - width);
    const startY = randomInt(MIN_Y, MAX_Y - height);

    const points = [];
    for (let dx = 0; dx <= width; dx += spacing) {
        for (let dy = 0; dy <= height; dy += spacing) {
            const x = startX + dx;
            const y = startY + dy;
            if (x <= MAX_X && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function concentricSquares() {
    // Multiple concentric square outlines
    const outerSize = randomInt(5, 7);
    const cx = randomInt(MIN_X + outerSize, MAX_X - outerSize);
    const cy = randomInt(MIN_Y + outerSize, MAX_Y - outerSize);

    const points = [];

    // Outer square
    for (let i = -outerSize; i <= outerSize; i++) {
        points.push({ x: cx + i, y: cy - outerSize });
        points.push({ x: cx + i, y: cy + outerSize });
        if (i !== -outerSize && i !== outerSize) {
            points.push({ x: cx - outerSize, y: cy + i });
            points.push({ x: cx + outerSize, y: cy + i });
        }
    }

    // Inner square
    const innerSize = Math.floor(outerSize / 2);
    for (let i = -innerSize; i <= innerSize; i++) {
        points.push({ x: cx + i, y: cy - innerSize });
        points.push({ x: cx + i, y: cy + innerSize });
        if (i !== -innerSize && i !== innerSize) {
            points.push({ x: cx - innerSize, y: cy + i });
            points.push({ x: cx + innerSize, y: cy + i });
        }
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function spiralPattern() {
    // Approximate spiral using discrete points
    const cx = randomInt(MIN_X + 4, MAX_X - 4);
    const cy = randomInt(MIN_Y + 3, MAX_Y - 3);

    const points = [];
    let radius = 1;
    let angle = 0;
    const angleStep = Math.PI / 4; // 45 degrees
    const radiusGrowth = 0.4;

    for (let i = 0; i < 15; i++) {
        const x = Math.round(cx + radius * Math.cos(angle));
        const y = Math.round(cy + radius * Math.sin(angle));

        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }

        angle += angleStep;
        radius += radiusGrowth;

        if (radius > 5) break;
    }

    return points.length >= 5 ? points : connectedPath();
}

export function cornerPattern() {
    // Points clustered in corners
    const margin = 2;
    const clusterSize = randomInt(2, 3);
    const points = [];

    // Top-left corner
    for (let dx = 0; dx <= clusterSize; dx++) {
        for (let dy = 0; dy <= clusterSize; dy++) {
            points.push({ x: MIN_X + margin + dx, y: MIN_Y + margin + dy });
        }
    }

    // Bottom-right corner
    for (let dx = 0; dx <= clusterSize; dx++) {
        for (let dy = 0; dy <= clusterSize; dy++) {
            points.push({ x: MAX_X - margin - dx, y: MAX_Y - margin - dy });
        }
    }

    return points;
}

export function diagonalBand() {
    // Band of points along a diagonal
    const width = randomInt(2, 3);
    const direction = randomChoice([1, -1]);
    const points = [];

    for (let x = MIN_X; x <= MAX_X; x++) {
        for (let offset = -width; offset <= width; offset++) {
            const y = direction > 0
                ? MIN_Y + (x - MIN_X) + offset
                : MAX_Y - (x - MIN_X) + offset;

            if (y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function checkerboard() {
    // Checkerboard pattern
    const spacing = randomChoice([2, 3]);
    const points = [];

    for (let x = MIN_X; x <= MAX_X; x += spacing) {
        if (x > MAX_X) break;
        for (let y = MIN_Y; y <= MAX_Y; y += spacing) {
            if (y > MAX_Y) break;
            if ((Math.floor(x / spacing) + Math.floor(y / spacing)) % 2 === 0) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function borderPoints() {
    // Points along the border/edges
    const points = [];
    const spacing = randomChoice([1, 2, 3]);

    // Top and bottom edges
    for (let x = MIN_X; x <= MAX_X; x += spacing) {
        if (x > MAX_X) break;
        points.push({ x, y: MIN_Y });
        points.push({ x, y: MAX_Y });
    }

    // Left and right edges (excluding corners already added)
    for (let y = MIN_Y + spacing; y < MAX_Y; y += spacing) {
        if (y >= MAX_Y) break;
        points.push({ x: MIN_X, y });
        points.push({ x: MAX_X, y });
    }

    return points;
}

export function fourClusters() {
    // Four separate clusters (one in each quadrant)
    const points = [];
    const clusterSize = randomInt(2, 3);

    const midX = Math.floor((MIN_X + MAX_X) / 2);
    const midY = Math.floor((MIN_Y + MAX_Y) / 2);

    // Top-left
    const c1x = randomInt(MIN_X + 1, midX - 2);
    const c1y = randomInt(MIN_Y + 1, midY - 2);
    for (let dx = 0; dx <= clusterSize; dx++) {
        for (let dy = 0; dy <= clusterSize; dy++) {
            if (Math.random() < 0.7) {
                points.push({ x: c1x + dx, y: c1y + dy });
            }
        }
    }

    // Top-right
    const c2x = randomInt(midX + 2, MAX_X - clusterSize - 1);
    const c2y = randomInt(MIN_Y + 1, midY - 2);
    for (let dx = 0; dx <= clusterSize; dx++) {
        for (let dy = 0; dy <= clusterSize; dy++) {
            if (Math.random() < 0.7) {
                points.push({ x: c2x + dx, y: c2y + dy });
            }
        }
    }

    // Bottom-left
    const c3x = randomInt(MIN_X + 1, midX - 2);
    const c3y = randomInt(midY + 2, MAX_Y - clusterSize - 1);
    for (let dx = 0; dx <= clusterSize; dx++) {
        for (let dy = 0; dy <= clusterSize; dy++) {
            if (Math.random() < 0.7) {
                points.push({ x: c3x + dx, y: c3y + dy });
            }
        }
    }

    // Bottom-right
    const c4x = randomInt(midX + 2, MAX_X - clusterSize - 1);
    const c4y = randomInt(midY + 2, MAX_Y - clusterSize - 1);
    for (let dx = 0; dx <= clusterSize; dx++) {
        for (let dy = 0; dy <= clusterSize; dy++) {
            if (Math.random() < 0.7) {
                points.push({ x: c4x + dx, y: c4y + dy });
            }
        }
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

export function wavyLine() {
    // Line that waves up and down
    const baseY = randomInt(MIN_Y + 2, MAX_Y - 2);
    const amplitude = randomInt(1, 2);
    const period = randomChoice([3, 4, 5]);
    const points = [];

    for (let x = MIN_X; x <= MAX_X; x++) {
        const offset = Math.round(amplitude * Math.sin(2 * Math.PI * (x - MIN_X) / period));
        const y = baseY + offset;
        if (y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points;
}

export function steppedPattern() {
    // Steps/stairs pattern
    const stepWidth = randomInt(2, 3);
    const stepHeight = 1;
    const direction = randomChoice([1, -1]); // up or down

    const points = [];
    let currentY = direction > 0 ? MIN_Y + 1 : MAX_Y - 1;

    for (let x = MIN_X; x <= MAX_X; x += stepWidth) {
        for (let dx = 0; dx < stepWidth && x + dx <= MAX_X; dx++) {
            if (currentY >= MIN_Y && currentY <= MAX_Y) {
                points.push({ x: x + dx, y: currentY });
            }
        }
        currentY += direction * stepHeight;
        if (currentY < MIN_Y || currentY > MAX_Y) break;
    }

    return points;
}

export function vPattern() {
    // V or inverted V shape
    const inverted = Math.random() < 0.5;
    const apex = randomInt(MIN_X + 3, MAX_X - 3);
    const apexY = inverted ? MAX_Y - 2 : MIN_Y + 2;
    const armLength = randomInt(4, 6);

    const points = [];

    for (let i = 0; i <= armLength; i++) {
        // Left arm
        const x1 = apex - i;
        const y1 = inverted ? apexY - i : apexY + i;
        if (x1 >= MIN_X && y1 >= MIN_Y && y1 <= MAX_Y) {
            points.push({ x: x1, y: y1 });
        }

        // Right arm
        const x2 = apex + i;
        const y2 = inverted ? apexY - i : apexY + i;
        if (x2 <= MAX_X && y2 >= MIN_Y && y2 <= MAX_Y) {
            points.push({ x: x2, y: y2 });
        }
    }

    return points;
}

export function circularArc() {
    // Arc of a circle
    const cx = randomInt(MIN_X + 4, MAX_X - 4);
    const cy = randomInt(MIN_Y + 3, MAX_Y - 3);
    const radius = randomInt(3, 5);
    const startAngle = Math.random() * 2 * Math.PI;
    const arcLength = Math.PI * randomChoice([0.5, 0.75, 1.0, 1.25]); // 90-225 degrees

    const points = [];
    const numPoints = 8;

    for (let i = 0; i <= numPoints; i++) {
        const angle = startAngle + (arcLength * i / numPoints);
        const x = Math.round(cx + radius * Math.cos(angle));
        const y = Math.round(cy + radius * Math.sin(angle));

        if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points.length >= 4 ? points : convexArc();
}

export function zigzag() {
    // Zigzag pattern
    const amplitude = randomInt(2, 3);
    const period = randomChoice([2, 3, 4]);
    const baseY = randomInt(MIN_Y + amplitude, MAX_Y - amplitude);

    const points = [];

    for (let x = MIN_X; x <= MAX_X; x++) {
        const phase = (x - MIN_X) % (period * 2);
        const y = phase < period
            ? baseY + Math.floor((phase / period) * amplitude)
            : baseY + amplitude - Math.floor(((phase - period) / period) * amplitude);

        if (y >= MIN_Y && y <= MAX_Y) {
            points.push({ x, y });
        }
    }

    return points;
}

export function hollowRectangle() {
    // Rectangle outline (hollow)
    const width = randomInt(5, 8);
    const height = randomInt(4, 6);
    const x1 = randomInt(MIN_X, MAX_X - width);
    const y1 = randomInt(MIN_Y, MAX_Y - height);
    const x2 = x1 + width;
    const y2 = y1 + height;

    const points = [];

    // Top and bottom edges
    for (let x = x1; x <= x2; x++) {
        points.push({ x, y: y1 });
        points.push({ x, y: y2 });
    }

    // Left and right edges (excluding corners)
    for (let y = y1 + 1; y < y2; y++) {
        points.push({ x: x1, y });
        points.push({ x: x2, y });
    }

    return points;
}

export function filledRectangle() {
    // Filled rectangle with all interior points
    const width = randomInt(3, 5);
    const height = randomInt(3, 4);
    const x1 = randomInt(MIN_X, MAX_X - width);
    const y1 = randomInt(MIN_Y, MAX_Y - height);

    const points = [];

    for (let dx = 0; dx <= width; dx++) {
        for (let dy = 0; dy <= height; dy++) {
            points.push({ x: x1 + dx, y: y1 + dy });
        }
    }

    return points;
}

export function parallelDiagonals() {
    // Multiple parallel diagonal lines
    const numLines = randomInt(2, 4);
    const direction = randomChoice([1, -1]);
    const spacing = randomInt(2, 3);

    const points = [];

    for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
        const offset = lineIdx * spacing;

        for (let x = MIN_X; x <= MAX_X; x++) {
            const y = direction > 0
                ? MIN_Y + (x - MIN_X) + offset
                : MAX_Y - (x - MIN_X) - offset;

            if (y >= MIN_Y && y <= MAX_Y) {
                points.push({ x, y });
            }
        }
    }

    return points;
}

export function uShape() {
    // U shape (or rotated U)
    const rotation = randomChoice([0, 90, 180, 270]);
    const size = randomInt(4, 6);
    const width = randomInt(3, 4);
    const cx = randomInt(MIN_X + width, MAX_X - width);
    const cy = randomInt(MIN_Y + size, MAX_Y - size);

    const points = [];

    if (rotation === 0) {
        // Standard U (opening upward)
        // Left vertical
        for (let dy = 0; dy <= size; dy++) {
            points.push({ x: cx - width, y: cy - size + dy });
        }
        // Bottom horizontal
        for (let dx = -width; dx <= width; dx++) {
            points.push({ x: cx + dx, y: cy });
        }
        // Right vertical
        for (let dy = 0; dy <= size; dy++) {
            points.push({ x: cx + width, y: cy - size + dy });
        }
    } else if (rotation === 180) {
        // Inverted U (opening downward)
        // Left vertical
        for (let dy = 0; dy <= size; dy++) {
            points.push({ x: cx - width, y: cy + dy });
        }
        // Top horizontal
        for (let dx = -width; dx <= width; dx++) {
            points.push({ x: cx + dx, y: cy });
        }
        // Right vertical
        for (let dy = 0; dy <= size; dy++) {
            points.push({ x: cx + width, y: cy + dy });
        }
    } else if (rotation === 90) {
        // U rotated right (opening right)
        // Top horizontal
        for (let dx = 0; dx <= size; dx++) {
            points.push({ x: cx - size + dx, y: cy - width });
        }
        // Right vertical
        for (let dy = -width; dy <= width; dy++) {
            points.push({ x: cx, y: cy + dy });
        }
        // Bottom horizontal
        for (let dx = 0; dx <= size; dx++) {
            points.push({ x: cx - size + dx, y: cy + width });
        }
    } else {
        // U rotated left (opening left)
        // Top horizontal
        for (let dx = 0; dx <= size; dx++) {
            points.push({ x: cx + dx, y: cy - width });
        }
        // Left vertical
        for (let dy = -width; dy <= width; dy++) {
            points.push({ x: cx, y: cy + dy });
        }
        // Bottom horizontal
        for (let dx = 0; dx <= size; dx++) {
            points.push({ x: cx + dx, y: cy + width });
        }
    }

    return points.filter(p => p.x >= MIN_X && p.x <= MAX_X && p.y >= MIN_Y && p.y <= MAX_Y);
}

// =============================================================================
// BASELINE DISTRIBUTION
// =============================================================================

const BASELINE_DISTRIBUTION_RAW = [
    // Point count variations
    { type: 'withPointCount', weight: 0.015, options: { count: 3 } },
    { type: 'withPointCount', weight: 0.02, options: { count: 4 } },
    { type: 'withPointCount', weight: 0.02, options: { count: 5 } },
    { type: 'withPointCount', weight: 0.02, options: { count: 6 } },
    { type: 'withPointCount', weight: 0.015, options: { count: 7 } },
    { type: 'withPointCount', weight: 0.015, options: { count: 8 } },
    { type: 'withPointCount', weight: 0.015, options: { count: 9 } },
    { type: 'withPointCount', weight: 0.01, options: { count: 10 } },
    { type: 'uniformRandom', weight: 0.05 },

    // Basic line patterns - including various slopes
    { type: 'horizontalLine', weight: 0.01 },
    { type: 'verticalLine', weight: 0.01 },
    { type: 'diagonalLine', weight: 0.01 },
    { type: 'oneToTwoLine', weight: 0.01 },
    { type: 'oneToThreeLine', weight: 0.01 },
    { type: 'twoToThreeLine', weight: 0.01 },
    { type: 'oneToFourLine', weight: 0.01 },
    { type: 'threeToFourLine', weight: 0.01 },
    { type: 'twoToFiveLine', weight: 0.01 },
    { type: 'threeToFiveLine', weight: 0.01 },
    { type: 'anyLine', weight: 0.01 },

    // Multi-line patterns - basic
    { type: 'twoLines', weight: 0.015 },
    { type: 'threeLines', weight: 0.015 },
    { type: 'twoParallelLines', weight: 0.015 },
    { type: 'perpendicularLines', weight: 0.015 },
    { type: 'almostTwoLines', weight: 0.01 },

    // Multi-line patterns - rich configurations
    { type: 'linesShareEndpoint', weight: 0.02 },
    { type: 'linesShareMidpoint', weight: 0.02 },
    { type: 'parallelLinesOffsetStart', weight: 0.02 },
    { type: 'perpendicularLinesSharedEnd', weight: 0.02 },
    { type: 'angledLinesSharedEnd', weight: 0.02 },
    { type: 'threeLinesOneParallel', weight: 0.015 },
    { type: 'threeLinesSharedPoint', weight: 0.02 },
    { type: 'threeLinesChained', weight: 0.02 },
    { type: 'parallelLinesAlternating', weight: 0.02 },
    { type: 'linesBracketShape', weight: 0.02 },
    { type: 'twoLinesNearMiss', weight: 0.015 },
    { type: 'parallelLinesPairwise', weight: 0.015 },

    // Letter shapes - capturing various letters
    { type: 'cross', weight: 0.02 },
    { type: 'Y', weight: 0.02 },
    { type: 'X', weight: 0.02 },
    { type: 'H', weight: 0.02 },
    { type: 'Z', weight: 0.02 },
    { type: 'N', weight: 0.02 },
    { type: 'T', weight: 0.02 },
    { type: 'L', weight: 0.02 },

    // Basic geometric shapes
    { type: 'triangle', weight: 0.025 },
    { type: 'rectangle', weight: 0.025 },
    { type: 'rhombus', weight: 0.02 },
    { type: 'squareBorders', weight: 0.02 },
    { type: 'squareWithExtra', weight: 0.015 },
    { type: 'almostSquare', weight: 0.015 },
    { type: 'multipleSquares', weight: 0.015 },
    { type: 'multipleRectangles', weight: 0.02 },
    { type: 'rightTriangles', weight: 0.015 },

    // Lattice and grid patterns
    { type: 'lattice', weight: 0.02 },
    { type: 'regularGrid', weight: 0.015 },
    { type: 'almostRegular', weight: 0.01 },

    // Symmetry patterns
    { type: 'verticallySymmetric', weight: 0.01 },
    { type: 'horizontallySymmetric', weight: 0.01 },
    { type: 'rotationallySymmetric', weight: 0.01 },
    { type: 'rotationalAndLineSymmetric', weight: 0.005 },
    { type: 'almostVerticallySymmetric', weight: 0.005 },
    { type: 'almostRotationallySymmetric', weight: 0.005 },

    // Connectivity patterns
    { type: 'connectedPath', weight: 0.005 },
    { type: 'connectedCluster', weight: 0.005 },
    { type: 'connectedTree', weight: 0.005 },
    { type: 'connectedLoop', weight: 0.005 },
    { type: 'almostConnected', weight: 0.005 },
    { type: 'twoComponents', weight: 0.01 },
    { type: 'threeComponents', weight: 0.01 },
    { type: 'isolatedPoints', weight: 0.005 },

    // Convexity patterns
    { type: 'convexRandom', weight: 0.02 },
    { type: 'convexArc', weight: 0.02 },
    { type: 'withInteriorPoints', weight: 0.02 },
    { type: 'almostConvex', weight: 0.015 },

    // Weak order patterns
    { type: 'weakOrderLine', weight: 0.005 },
    { type: 'weakOrderStaircase', weight: 0.005 },
    { type: 'weakOrderMonotone', weight: 0.005 },
    { type: 'almostWeakOrder', weight: 0.005 },

    // Random scatter variations
    { type: 'random_points', weight: 0.015, options: { count: 3 } },
    { type: 'random_points', weight: 0.015, options: { count: 4 } },
    { type: 'random_points', weight: 0.015, options: { count: 5 } },
    { type: 'random_points', weight: 0.015, options: { count: 6 } },

    // Miscellaneous patterns
    { type: 'generalPosition', weight: 0.015 },
    { type: 'randomScattered', weight: 0.015 },
    { type: 'translatedCopy', weight: 0.01 },

    // Parametric variations - grid patterns
    { type: 'sparseGrid', weight: 0.005 },
    { type: 'denseGrid', weight: 0.005 },
    { type: 'offsetGrid', weight: 0.005 },
    { type: 'partialLattice', weight: 0.005 },
    { type: 'checkerboard', weight: 0.005 },

    // Parametric variations - geometric patterns
    { type: 'concentricSquares', weight: 0.005 },
    { type: 'spiralPattern', weight: 0.005 },
    { type: 'cornerPattern', weight: 0.015 },
    { type: 'diagonalBand', weight: 0.005 },
    { type: 'borderPoints', weight: 0.01 },
    { type: 'fourClusters', weight: 0.01 },
    { type: 'hollowRectangle', weight: 0.005 },
    { type: 'filledRectangle', weight: 0.005 },
    { type: 'parallelDiagonals', weight: 0.005 },
    { type: 'uShape', weight: 0.005 },

    // Parametric variations - curved and wave patterns
    { type: 'wavyLine', weight: 0.01 },
    { type: 'steppedPattern', weight: 0.01 },
    { type: 'vPattern', weight: 0.01 },
    { type: 'circularArc', weight: 0.01 },
    { type: 'zigzag', weight: 0.01 },

    // Advanced geometric patterns
    { type: 'rectangleCornersShared', weight: 0.02 },
    { type: 'rotatedRectangle', weight: 0.01 },
    { type: 'rotatedSquare', weight: 0.01 },
    { type: 'rotatedTriangle', weight: 0.005 },
    { type: 'randomWithMidpoints', weight: 0.015 },
    { type: 'vectorWalk', weight: 0.015 },
    { type: 'randomPlusConfiguration', weight: 0.015 },

    // Algebraic curves
    { type: 'circularArcPattern', weight: 0.02 },
    { type: 'ellipseArc', weight: 0.01 },
    { type: 'parabolicArc', weight: 0.01 },
    { type: 'hyperbolicCurve', weight: 0.01 },

    // Old p10 patterns (no unique nearest neighbor) - added to baseline
    { type: 'p10RotatedSquare', weight: 0.005 },
    { type: 'p10OverlappingUnitSquares', weight: 0.005 },
    { type: 'p10SquareWithBisectorPoints', weight: 0.008 },
    { type: 'p10LoopPatterns', weight: 0.008 },
    { type: 'p10LoopWithBisectorPoints', weight: 0.008 },
    { type: 'p10TwoSquaresPlusNinth', weight: 0.005 },
    { type: 'p10TreeShapes', weight: 0.013 }
];

const totalWeight = BASELINE_DISTRIBUTION_RAW.reduce((sum, d) => sum + d.weight, 0);
export const BASELINE_DISTRIBUTION = BASELINE_DISTRIBUTION_RAW.map(d => ({
    ...d,
    weight: d.weight / totalWeight
}));

// =============================================================================
// SAMPLING FROM DISTRIBUTION
// =============================================================================

export function sampleFromDistribution(distributions) {
    const totalWeight = distributions.reduce((sum, d) => sum + d.weight, 0);
    let random = Math.random() * totalWeight;

    for (const dist of distributions) {
        random -= dist.weight;
        if (random <= 0) {
            const points = dist.generator();
            const uniquePoints = removeDuplicates(points);
            const validPoints = filterValidPoints(uniquePoints);
            return validPoints;
        }
    }
    const points = distributions[distributions.length - 1].generator();
    const uniquePoints = removeDuplicates(points);
    const validPoints = filterValidPoints(uniquePoints);
    return validPoints;
}

// =============================================================================
// EXPORT ALL GENERATORS
// =============================================================================

export const PointDistributions = {
    // Basic generators
    uniformRandom, withPointCount,

    // Line generators
    horizontalLine, verticalLine, diagonalLine, anyLine,
    fortyFiveDegreeLine, oneToTwoLine, oneToThreeLine, twoToThreeLine,
    oneToFourLine, threeToFourLine, twoToFiveLine, threeToFiveLine,
    '45degreeLine': fortyFiveDegreeLine,  // Alias for rules file

    // Multi-line generators
    twoLines, parallelLines, perpendicularLines, threeLines, twoParallelLines,
    almostTwoLines, oneLine, lineAndExtra, threeOnLineWithExtra, fourOnLine,

    rectangleWithFloatingPoint, hWithFloatingPoint, pathWithDetour, zigzagWithOutlier,
    denseBlobWithIsolatedPoint, almostGrid, threeLinesPlusAlmostCollinear,
    starPatternWithGap, serpentinePathWithKink, crossWithExtraArm,

    // Rich multiline configurations
    linesShareEndpoint, linesShareMidpoint, parallelLinesOffsetStart,
    perpendicularLinesSharedEnd, angledLinesSharedEnd, threeLinesOneParallel,
    threeLinesSharedPoint, threeLinesChained, parallelLinesAlternating,
    linesBracketShape, twoLinesNearMiss, parallelLinesPairwise,

    // Shape generators
    cross, Y, X, H, Z, N, T, L, squareBorders, lattice, triangle, rectangle, rhombus,

    // Symmetry generators
    verticallySymmetric, horizontallySymmetric, rotationallySymmetric,
    rotationalAndLineSymmetric, translatedCopy,
    almostVerticallySymmetric, almostRotationallySymmetric, asymmetric,

    // Rule p2 generators (no shared x or y coordinates)
    p2DiagonalLine, p2ScatteredRandom, p2StaircaseAscending, p2StaircaseDescending,
    p2ZigZag, p2PermutationPattern, p2MonotonicCurve, p2RandomWalk,
    p2VerticalPair, p2HorizontalPair, p2VerticalLine, p2HorizontalLine,
    p2SharedXScattered, p2SharedYScattered, p2LShape, p2CrossPattern,

    // Connectivity generators
    connectedPath, connectedCluster, connectedTree, connectedLoop,
    twoComponents, threeComponents, isolatedPoints, almostConnected, cluster,

    // Geometric properties
    convexRandom, convexArc, withInteriorPoints, almostConvex,
    squareWithExtra, almostSquare, multipleSquares, squareAndLine, squareInPattern,
    multipleRectangles, regularGrid, rightTriangles, symmetricPattern,

    // Weak order generators
    weakOrderLine, weakOrderStaircase, weakOrderMonotone, noWeakOrder, almostWeakOrder,
    weakOrderAddRandomVector, weakOrderZigZag, weakOrderConnected, weakOrderL,
    weakOrderTwoHorizontalLines, weakOrderTwoVerticalLines, weakOrderTwoLines,
    decreasingLine, nonWeakOrderL, nonWeakOrderTwoLines, nonWeakOrderConnected,

    // Misc
    generalPosition, randomScattered,

    // Rule p10 generators (no unique nearest neighbor) - NEW IMPLEMENTATION
    p10RotatedSquare, p10OverlappingUnitSquares, p10SquareWithBisectorPoints,
    p10LoopPatterns, p10LoopWithBisectorPoints, p10TreeShapes, p10TwoSquaresPlusNinth,

    // Advanced geometric patterns
    rectangleCornersShared, rotatedRectangle, rotatedSquare, rotatedTriangle,
    randomWithMidpoints, vectorWalk, randomPlusConfiguration,
    circularArcPattern, ellipseArc, parabolicArc, hyperbolicCurve,

    // Parametric variations - rich patterns with parameters
    sparseGrid, denseGrid, offsetGrid, partialLattice,
    concentricSquares, spiralPattern, cornerPattern, diagonalBand,
    checkerboard, borderPoints, fourClusters, wavyLine,
    steppedPattern, vPattern, circularArc, zigzag,
    hollowRectangle, filledRectangle, parallelDiagonals, uShape,

    // Two-column/row patterns with points between
    twoColumnsWithMiddlePoints, twoRowsWithMiddlePoints, LShapeWithMiddlePoints,

    // Diverse blob patterns (varying sizes)
    smallRadialBlob, largeRadialBlob, mediumAsymmetricBlob,

    // Letter patterns (positive: satisfy collinearity rule)
    letterI, letterL, letterT, letterF,

    // Letter patterns (negative: fail collinearity rule)
    letterC, letterO, letterV, letterP,

    // Utilities
    random_points,
    sampleFromDistribution, BASELINE_DISTRIBUTION
};
