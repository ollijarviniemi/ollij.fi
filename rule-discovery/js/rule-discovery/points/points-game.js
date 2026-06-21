/**
 * Points Game
 * Discover rules about points on discrete 18×13 grid
 * Get 15 correct in a row to see answer field and reveal button
 *
 * Sampling strategy:
 * - 40% positive examples
 * - 25% baseline distribution (rule-agnostic)
 * - 35% round-specific negative examples
 * - Variance reduction: every 6 rounds guaranteed at least 2/1/1 from categories
 */

import { BaseGame } from '../core/base-game.js';
import { PointDistributions, sampleFromDistribution } from './points-distributions.js';

export class PointsGame extends BaseGame {
    constructor(appManager, currentRound) {
        super(appManager, 'points', currentRound);

        this.correctStreak = 0;
        this.currentExample = null;
        this.answerRevealed = false;

        // Sampling state for variance reduction
        this.samplingWindow = [];  // Tracks last 5 samples
        this.STREAK_TARGET = 15;

        // Grid configuration
        this.GRID_WIDTH = 16;   // Number of horizontal cells (was 18)
        this.GRID_HEIGHT = 11;  // Number of vertical cells (was 13)
        this.MARGIN = 1;        // Margin (in cells) at the edges
    }

    render() {
        const { historyColumn, historyContent } = this.getDisplayElements();
        historyColumn.classList.remove('hidden');

        const historyPanel = historyColumn.querySelector('.history-panel');
        if (historyPanel) {
            historyPanel.style.maxHeight = 'none';
            historyPanel.style.overflowY = 'visible';
        }

        // Add column headers
        if (!historyContent.previousElementSibling || !historyContent.previousElementSibling.classList.contains('history-column-headers')) {
            const headersDiv = document.createElement('div');
            headersDiv.className = 'history-column-headers';
            headersDiv.style.display = 'flex';
            headersDiv.style.alignItems = 'center';
            headersDiv.style.gap = '12px';
            headersDiv.style.padding = '8px 10px';
            headersDiv.style.borderBottom = '2px solid #ddd';
            headersDiv.style.marginBottom = '10px';
            headersDiv.style.fontWeight = 'bold';
            headersDiv.style.fontSize = '14px';
            headersDiv.style.color = '#333';

            const pointsHeader = document.createElement('div');
            pointsHeader.style.flex = '1';
            pointsHeader.textContent = 'Points';

            const answerHeader = document.createElement('div');
            answerHeader.style.minWidth = '35px';
            answerHeader.style.textAlign = 'center';
            answerHeader.textContent = 'Valid?';

            headersDiv.appendChild(pointsHeader);
            headersDiv.appendChild(answerHeader);

            historyContent.parentNode.insertBefore(headersDiv, historyContent);
        }

        this.generateExample();
    }

    generateExample() {
        // Prevent calling generateExample while processing an answer
        if (this.isProcessingAnswer) return;

        const { exampleDisplay, controlsDiv } = this.getDisplayElements();

        // Determine sample category with variance reduction
        const category = this.selectSampleCategory();

        // Generate points based on category
        let points, satisfiesRule;
        const maxAttempts = 100;
        let attempt = 0;

        do {
            points = this.generatePointsByCategory(category);
            satisfiesRule = this.currentRound.check(points);

            const expectedSatisfies = (category === 'positive');

            if (satisfiesRule !== expectedSatisfies) {
                console.warn(`[MISMATCH] Category: ${category}, Expected: ${expectedSatisfies}, Got: ${satisfiesRule}, Attempt: ${attempt}`);
            }

            attempt++;
        } while (satisfiesRule !== (category === 'positive') && attempt < maxAttempts);

        // FALLBACK
        if (satisfiesRule !== (category === 'positive')) {
            const shouldSatisfy = (category === 'positive');
            if (!shouldSatisfy && this.currentRound.generateNegative) {
                points = this.currentRound.generateNegative();
                satisfiesRule = this.currentRound.check(points);
            } else {
                points = this.generatePointsFallback(shouldSatisfy);
                satisfiesRule = this.currentRound.check(points);
            }
        }

        // Track this sample for variance reduction
        this.samplingWindow.push(category);
        if (this.samplingWindow.length > 5) {
            this.samplingWindow.shift();
        }

        this.currentExample = points;

        // Display points
        const pointsCanvas = this.renderPoints(points, 600, 450);
        exampleDisplay.innerHTML = '';
        exampleDisplay.appendChild(pointsCanvas);

        // Progress indicator and controls
        controlsDiv.innerHTML = `
            <div style="text-align: center; margin-bottom: 15px;">
                <div id="points-progress" style="display: flex; gap: 8px; justify-content: center;">
                    ${this.createProgressDots(15)}
                </div>
            </div>
            <div class="button-group">
                <button class="btn btn-yes" id="btn-yes">Yes</button>
                <button class="btn btn-no" id="btn-no">No</button>
            </div>
            ${this.correctStreak >= 15 && !this.answerRevealed ? `
                <div style="margin-top: 20px; text-align: center;">
                    <textarea id="rule-answer-input" placeholder="The rule is..."
                              style="width: 100%; max-width: 500px; height: 80px; padding: 10px;
                                     font-size: 14px; border: 2px solid #ddd; border-radius: 6px;
                                     resize: vertical; font-family: Arial, sans-serif; display: block; margin: 0 auto;"></textarea>
                </div>
                <div style="text-align: center; margin-top: 15px;">
                    <button class="btn btn-primary" id="btn-reveal">Reveal answer</button>
                </div>
            ` : ''}
        `;

        if (this.correctStreak >= 15 && !this.answerRevealed) {
            document.getElementById('btn-reveal').addEventListener('click', () => this.revealAnswer());
        }

        document.getElementById('btn-yes').addEventListener('click', () => this.handleAnswer(true));
        document.getElementById('btn-no').addEventListener('click', () => this.handleAnswer(false));
    }

    renderPoints(points, width = 720, height = 540) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.style.display = 'block';
        canvas.style.backgroundColor = '#fff';
        const ctx = canvas.getContext('2d');

        // Use grid configuration parameters
        const cellWidth = width / this.GRID_WIDTH;
        const cellHeight = height / this.GRID_HEIGHT;

        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;

        // Vertical grid lines
        for (let x = 0; x <= this.GRID_WIDTH; x++) {
            const screenX = x * cellWidth;
            ctx.beginPath();
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, height);
            ctx.stroke();
        }

        // Horizontal grid lines
        for (let y = 0; y <= this.GRID_HEIGHT; y++) {
            const screenY = y * cellHeight;
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(width, screenY);
            ctx.stroke();
        }

        // Draw points
        ctx.fillStyle = '#000';
        for (const point of points) {
            // Convert point coordinates to screen coordinates
            // Point (x, y) maps to grid cell x from left, y from bottom
            const screenX = point.x * cellWidth;
            const screenY = height - point.y * cellHeight;

            ctx.beginPath();
            ctx.arc(screenX, screenY, 6, 0, 2 * Math.PI);
            ctx.fill();
        }

        return canvas;
    }

    createProgressDots(total) {
        let html = '';
        for (let i = 0; i < total; i++) {
            html += `<div class="progress-dot" style="width: 14px; height: 14px; border-radius: 50%;
                     background: ${i < this.correctStreak ? '#4caf50' : '#ddd'};
                     border: 2px solid ${i < this.correctStreak ? '#4caf50' : '#999'};"></div>`;
        }
        return html;
    }

    handleAnswer(userAnswer) {
        // Prevent double-click
        if (this.isProcessingAnswer) return;
        this.isProcessingAnswer = true;

        const correctAnswer = this.currentRound.check(this.currentExample);
        const isCorrect = userAnswer === correctAnswer;

        // Add to history
        this.addToHistory(this.currentExample, correctAnswer);

        if (isCorrect) {
            this.correctStreak++;

            setTimeout(() => {
                this.isProcessingAnswer = false;
                this.generateExample();
            }, 500);
        } else {
            this.correctStreak = 0;
            this.samplingWindow = [];  // Reset sampling window on streak break
            setTimeout(() => {
                this.isProcessingAnswer = false;
                this.generateExample();
            }, 800);
        }
    }

    revealAnswer() {
        this.answerRevealed = true;
        this.completeRound({ showSuccessScreen: true });
    }

    /**
     * Select sample category with variance reduction
     * Ensures at least 2/1/1 samples from positive/baseline/roundSpecific in every 6-round window
     */
    selectSampleCategory() {
        const counts = {
            positive: this.samplingWindow.filter(c => c === 'positive').length,
            baseline: this.samplingWindow.filter(c => c === 'baseline').length,
            roundSpecific: this.samplingWindow.filter(c => c === 'roundSpecific').length
        };

        // If window is full (5 samples), enforce minimum constraints for next sample
        if (this.samplingWindow.length === 5) {
            // Next sample completes a 6-window
            // Check which categories are below minimum (2 for positive, 1 for others)
            const needsPositive = counts.positive < 2;
            const needsBaseline = counts.baseline < 1;
            const needsRoundSpecific = counts.roundSpecific < 1;

            // Force-sample from deficient categories
            if (needsPositive && !needsBaseline && !needsRoundSpecific) return 'positive';
            if (!needsPositive && needsBaseline && !needsRoundSpecific) return 'baseline';
            if (!needsPositive && !needsBaseline && needsRoundSpecific) return 'roundSpecific';

            // If multiple categories need samples, distribute by weights
            const needy = [];
            if (needsPositive) needy.push({ category: 'positive', weight: 2 });
            if (needsBaseline) needy.push({ category: 'baseline', weight: 1 });
            if (needsRoundSpecific) needy.push({ category: 'roundSpecific', weight: 1 });

            if (needy.length > 0) {
                const totalWeight = needy.reduce((sum, n) => sum + n.weight, 0);
                let rand = Math.random() * totalWeight;
                for (const n of needy) {
                    rand -= n.weight;
                    if (rand <= 0) return n.category;
                }
                return needy[needy.length - 1].category;
            }
        }

        // Normal sampling: 40/25/35
        const rand = Math.random();
        if (rand < 0.40) return 'positive';
        if (rand < 0.65) return 'baseline';
        return 'roundSpecific';
    }

    /**
     * Generate points based on sampling category
     */
    generatePointsByCategory(category) {
        // Special handling for Rule p10 (collinearity rule)
        // These generators naturally produce both positive and negative examples,
        // so we sample from combined pool and accept based on category
        if (this.currentRound.id === 'p10') {
            return this.generateForP10(category);
        }

        if (category === 'positive') {
            return this.generatePositive();
        } else if (category === 'baseline') {
            return this.generateBaseline();
        } else {
            return this.generateRoundSpecific();
        }
    }

    /**
     * Special generator for Rule p10
     * Combines all round-specific generators into one pool and rejection-samples
     */
    generateForP10(category) {
        const rule = this.currentRound;
        const wantPositive = (category === 'positive');

        // Compile all round-specific generators (both positive and negative lists)
        const allGenerators = [];

        // Add positive generators
        if (rule.distribution && rule.distribution.positive) {
            for (const spec of rule.distribution.positive) {
                allGenerators.push({ ...spec });
            }
        }

        // Add round-specific negative generators
        if (rule.roundSpecificNegative) {
            for (const spec of rule.roundSpecificNegative) {
                allGenerators.push({ ...spec });
            }
        }

        // Rejection sampling: keep sampling until we get the desired category
        const maxAttempts = 100;
        let attempt = 0;
        let points, satisfies;

        do {
            // Sample one generator from the combined pool
            const distributions = allGenerators.map(spec => ({
                type: spec.type,  // Pass through type for error logging
                weight: spec.weight,
                generator: () => this.callGenerator(spec)
            }));

            points = sampleFromDistribution(distributions);
            satisfies = rule.check(points);
            attempt++;
        } while (satisfies !== wantPositive && attempt < maxAttempts);

        if (satisfies !== wantPositive) {
            console.warn(`[P10 FALLBACK] Failed to generate ${wantPositive ? 'positive' : 'negative'} after ${maxAttempts} attempts`);
        }

        return points;
    }

    /**
     * Generate positive example
     */
    generatePositive() {
        const rule = this.currentRound;
        if (!rule.distribution || !rule.distribution.positive) {
            return this.generatePointsFallback(true);
        }

        const distributionSpec = rule.distribution.positive;
        const distributions = distributionSpec.map(spec => ({
            weight: spec.weight,
            generator: () => {
                const points = this.callGenerator(spec);
                const satisfies = rule.check(points);
                if (!satisfies) {
                    console.error(`[POSITIVE GENERATOR FAIL] Rule: ${rule.id}, Type: ${spec.type}, Generator produced negative example!`);
                }
                return points;
            }
        }));

        return sampleFromDistribution(distributions);
    }

    /**
     * Generate from baseline distribution
     */
    generateBaseline() {
        const { BASELINE_DISTRIBUTION } = PointDistributions;
        const distributions = BASELINE_DISTRIBUTION.map(spec => ({
            weight: spec.weight,
            generator: () => this.callGenerator(spec)
        }));

        return sampleFromDistribution(distributions);
    }

    /**
     * Generate from round-specific negative distribution
     */
    generateRoundSpecific() {
        const rule = this.currentRound;
        if (!rule.roundSpecificNegative) {
            return this.generatePointsFallback(false);
        }

        const distributions = rule.roundSpecificNegative.map(spec => ({
            weight: spec.weight,
            generator: () => {
                const points = this.callGenerator(spec);
                const satisfies = rule.check(points);
                if (satisfies) {
                    console.error(`[NEGATIVE GENERATOR FAIL] Rule: ${rule.id}, Type: ${spec.type}, Generator produced positive example!`);
                }
                return points;
            }
        }));

        return sampleFromDistribution(distributions);
    }

    /**
     * Helper to call generator with proper arguments
     */
    callGenerator(spec) {
        const generatorFn = PointDistributions[spec.type];
        if (!generatorFn) {
            return PointDistributions.uniformRandom();
        }

        // Debug logging
        let points;
        try {
            if (spec.options) {
                points = generatorFn(spec.options);
            } else if (spec.generator) {
                points = spec.generator();
            } else {
                points = generatorFn();
            }
        } catch (error) {
            console.error(`[GENERATOR ERROR] Type: ${spec.type}, Error: ${error.message}`);
            throw error;
        }

        return points;
    }

    generatePointsFallback(shouldSatisfy) {
        const rule = this.currentRound;
        let points, satisfiesRule;
        const maxAttempts = 100;
        let attempt = 0;

        do {
            points = PointDistributions.uniformRandom();
            satisfiesRule = rule.check(points);
            attempt++;
        } while (satisfiesRule !== shouldSatisfy && attempt < maxAttempts);

        return points;
    }

    addToHistory(points, correctAnswer) {
        const { historyContent } = this.getDisplayElements();

        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.style.padding = '10px';
        historyItem.style.display = 'flex';
        historyItem.style.alignItems = 'center';
        historyItem.style.gap = '12px';

        // Points container (flex: 1 to match header layout)
        const pointsContainer = document.createElement('div');
        pointsContainer.style.flex = '1';

        const miniCanvas = this.renderPoints(points, 288, 216);
        pointsContainer.appendChild(miniCanvas);

        historyItem.appendChild(pointsContainer);

        // Answer indicator (fixed width to match header)
        const answerDiv = document.createElement('div');
        answerDiv.style.fontSize = '24px';
        answerDiv.style.fontWeight = 'bold';
        answerDiv.style.width = '35px';
        answerDiv.style.minWidth = '35px';
        answerDiv.style.flexShrink = '0';
        answerDiv.style.textAlign = 'center';
        answerDiv.textContent = correctAnswer ? '✓' : '✗';
        answerDiv.style.color = correctAnswer ? '#4caf50' : '#f44336';

        historyItem.appendChild(answerDiv);

        // Add to top of history
        historyContent.insertBefore(historyItem, historyContent.firstChild);
    }
}
