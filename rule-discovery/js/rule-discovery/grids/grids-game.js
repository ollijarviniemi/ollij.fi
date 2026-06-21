/**
 * Grids Game
 * Discover rules about 6x6 grid patterns with black cells
 * Get 15 correct in a row to see answer field and reveal button
 *
 * Sampling strategy:
 * - 40% positive examples
 * - 25% baseline distribution (rule-agnostic)
 * - 35% round-specific negative examples
 * - Variance reduction: every 6 rounds guaranteed at least 2/1/1 from categories
 */

import { BaseGame } from '../core/base-game.js';
import { GridDistributions, sampleFromDistribution } from './grids-distributions.js';

export class GridsGame extends BaseGame {
    constructor(appManager, currentRound) {
        super(appManager, 'grids', currentRound);

        this.correctStreak = 0;
        this.currentExample = null;
        this.answerRevealed = false;

        // Sampling state for variance reduction
        this.samplingWindow = [];  // Tracks last 5 samples
        this.STREAK_TARGET = 15;
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

            const gridHeader = document.createElement('div');
            gridHeader.style.flex = '1';
            gridHeader.textContent = 'Grid';

            const answerHeader = document.createElement('div');
            answerHeader.style.minWidth = '35px';
            answerHeader.style.textAlign = 'center';
            answerHeader.textContent = 'Valid?';

            headersDiv.appendChild(gridHeader);
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

        // Generate grid based on category
        let grid, satisfiesRule;
        const maxAttempts = 100;
        let attempt = 0;

        do {
            grid = this.generateGridByCategory(category);
            satisfiesRule = this.currentRound.check(grid);

            const expectedSatisfies = (category === 'positive');

            if (satisfiesRule !== expectedSatisfies) {
            }

            attempt++;
        } while (satisfiesRule !== (category === 'positive') && attempt < maxAttempts);

        // FALLBACK
        if (satisfiesRule !== (category === 'positive')) {
            const shouldSatisfy = (category === 'positive');
            if (!shouldSatisfy && this.currentRound.generateNegative) {
                grid = this.currentRound.generateNegative();
                satisfiesRule = this.currentRound.check(grid);
            } else {
                grid = this.generateGridFallback(shouldSatisfy);
                satisfiesRule = this.currentRound.check(grid);
            }
        }

        // Track this sample for variance reduction
        this.samplingWindow.push(category);
        if (this.samplingWindow.length > 5) {
            this.samplingWindow.shift();
        }

        this.currentExample = grid;

        // Display grid
        const gridDiv = this.renderGrid(grid, 300);
        exampleDisplay.innerHTML = '';
        exampleDisplay.appendChild(gridDiv);

        // Progress indicator and controls
        controlsDiv.innerHTML = `
            <div style="text-align: center; margin-bottom: 15px;">
                <div id="grids-progress" style="display: flex; gap: 8px; justify-content: center;">
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

    renderGrid(grid, size = 300) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        canvas.style.display = 'block'; // Remove default inline spacing
        canvas.style.border = '2px solid #333';
        const ctx = canvas.getContext('2d');

        const cellSize = size / 6;

        // Draw grid
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 6; j++) {
                ctx.fillStyle = grid[i][j] ? '#000' : '#fff';
                ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);

                // Draw border
                ctx.strokeStyle = '#999';
                ctx.lineWidth = 1;
                ctx.strokeRect(j * cellSize, i * cellSize, cellSize, cellSize);
            }
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
     * Generate grid based on sampling category
     */
    generateGridByCategory(category) {
        if (category === 'positive') {
            return this.generatePositive();
        } else if (category === 'baseline') {
            return this.generateBaseline();
        } else {
            return this.generateRoundSpecific();
        }
    }

    /**
     * Generate positive example
     */
    generatePositive() {
        const rule = this.currentRound;
        if (!rule.distribution || !rule.distribution.positive) {
            return this.generateGridFallback(true);
        }

        const distributionSpec = rule.distribution.positive;
        const distributions = distributionSpec.map(spec => ({
            weight: spec.weight,
            generator: () => this.callGenerator(spec)
        }));

        return sampleFromDistribution(distributions);
    }

    /**
     * Generate from baseline distribution
     */
    generateBaseline() {
        const { BASELINE_DISTRIBUTION } = GridDistributions;
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
            // Fallback to old negative distribution
            if (!rule.distribution || !rule.distribution.negative) {
                return this.generateGridFallback(false);
            }

            const distributionSpec = rule.distribution.negative;
            const distributions = distributionSpec.map(spec => ({
                weight: spec.weight,
                generator: () => this.callGenerator(spec)
            }));

            return sampleFromDistribution(distributions);
        }

        const distributions = rule.roundSpecificNegative.map(spec => ({
            weight: spec.weight,
            generator: () => this.callGenerator(spec)
        }));

        return sampleFromDistribution(distributions);
    }

    /**
     * Helper to call generator with proper arguments
     */
    callGenerator(spec) {
        const generatorFn = GridDistributions[spec.type];
        if (!generatorFn) {
            return GridDistributions.uniformRandom();
        }

        // Debug logging

        if (spec.type === 'withBlackCount') {
            return generatorFn(spec.options.count);
        } else if (spec.type === 'blockResolution') {
            return generatorFn(spec.options.blockSize);
        } else if (spec.type === 'isolatedDots') {
            return generatorFn(spec.options.count);
        } else if (spec.type === 'connectedManyBlacks') {
            return generatorFn(spec.options.count);
        } else if (spec.options) {
            return generatorFn(spec.options);
        } else {
            return generatorFn();
        }
    }

    generateGridForRule(shouldSatisfy) {
        const rule = this.currentRound;

        if (!rule.distribution) {
            return this.generateGridFallback(shouldSatisfy);
        }

        const distributionSpec = shouldSatisfy ? rule.distribution.positive : rule.distribution.negative;

        // Convert distribution spec to generators
        const distributions = distributionSpec.map(spec => ({
            weight: spec.weight,
            generator: () => {
                const generatorFn = GridDistributions[spec.type];
                if (!generatorFn) {
                    return GridDistributions.uniformRandom();
                }

                // Handle different generator signatures
                if (spec.type === 'withBlackCount') {
                    return generatorFn(spec.options.count);
                } else if (spec.type === 'blockResolution') {
                    return generatorFn(spec.options.blockSize);
                } else {
                    return generatorFn();
                }
            }
        }));

        return sampleFromDistribution(distributions);
    }

    generateGridFallback(shouldSatisfy) {
        const rule = this.currentRound;
        let grid, satisfiesRule;
        const maxAttempts = 100;
        let attempt = 0;

        do {
            grid = GridDistributions.uniformRandom();
            satisfiesRule = rule.check(grid);
            attempt++;
        } while (satisfiesRule !== shouldSatisfy && attempt < maxAttempts);

        return grid;
    }

    addToHistory(grid, correctAnswer) {
        const { historyContent } = this.getDisplayElements();

        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.style.padding = '10px';
        historyItem.style.display = 'flex';
        historyItem.style.alignItems = 'center';
        historyItem.style.gap = '12px';

        // Grid container (flex: 1 to match header layout)
        const gridContainer = document.createElement('div');
        gridContainer.style.flex = '1';

        const miniGrid = this.renderGrid(grid, 240);
        gridContainer.appendChild(miniGrid);

        historyItem.appendChild(gridContainer);

        // Answer indicator (fixed width to match header)
        const answerDiv = document.createElement('div');
        answerDiv.style.fontSize = '24px';
        answerDiv.style.fontWeight = 'bold';
        answerDiv.style.width = '35px';
        answerDiv.style.minWidth = '35px';
        answerDiv.style.flexShrink = '0';
        answerDiv.style.textAlign = 'center';
        answerDiv.style.color = correctAnswer ? '#4caf50' : '#f44336';
        answerDiv.textContent = correctAnswer ? '✓' : '✗';

        historyItem.appendChild(answerDiv);

        historyContent.insertBefore(historyItem, historyContent.firstChild);
    }
}
