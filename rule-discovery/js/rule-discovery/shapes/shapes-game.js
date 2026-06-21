/**
 * Shapes Game
 * Discover rules about colored shapes
 * Get 10 correct in a row to see answer field and reveal button
 */

import { BaseGame } from '../core/base-game.js';
import { ShapeDistributions, sampleFromDistribution } from './shapes-distributions.js';

export class ShapesGame extends BaseGame {
    constructor(appManager, currentRound) {
        super(appManager, 'shapes', currentRound);
        this.shapeGenerator = new ClientShapeGenerator(100, 100);
        this.colors = ['red', 'blue', 'green', 'purple', 'black'];
        this.shapeTypes = ['circle', 'square', 'triangle', 'star', 'heart', 'plus'];

        this.correctStreak = 0;
        this.currentExample = null;
        this.answerRevealed = false;
    }

    render() {
        const { historyColumn, historyContent } = this.getDisplayElements();
        historyColumn.classList.remove('hidden');

        // Remove max-height to allow natural flow
        const historyPanel = historyColumn.querySelector('.history-panel');
        if (historyPanel) {
            historyPanel.style.maxHeight = 'none';
            historyPanel.style.overflowY = 'visible';
        }

        // Add column headers if not already present
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

            const shapesHeader = document.createElement('div');
            shapesHeader.style.flex = '1';
            shapesHeader.textContent = 'Shapes';

            const answerHeader = document.createElement('div');
            answerHeader.style.minWidth = '35px';
            answerHeader.style.textAlign = 'center';
            answerHeader.textContent = 'Valid?';

            headersDiv.appendChild(shapesHeader);
            headersDiv.appendChild(answerHeader);

            historyContent.parentNode.insertBefore(headersDiv, historyContent);
        }

        this.generateExample();
    }

    generateExample() {
        // Prevent calling generateExample while processing an answer
        if (this.isProcessingAnswer) return;

        const { exampleDisplay, controlsDiv } = this.getDisplayElements();

        // Generate shapes that satisfy or don't satisfy the rule
        let shapes, satisfiesRule;
        const maxAttempts = 100;
        let attempt = 0;
        const shouldSatisfy = Math.random() < 0.5;

        do {
            shapes = this.generateShapesForRule(shouldSatisfy);
            satisfiesRule = this.currentRound.check(shapes);

            // Validation warnings
            if (satisfiesRule !== shouldSatisfy) {
                if (shouldSatisfy) {
                } else {
                }
            }

            attempt++;
        } while (satisfiesRule !== shouldSatisfy && attempt < maxAttempts);

        // FALLBACK: If distribution generators failed after 100 attempts, use the guaranteed fallback
        if (satisfiesRule !== shouldSatisfy) {
            if (!shouldSatisfy && this.currentRound.generateNegative) {
                // Use the guaranteed negative generator
                shapes = this.currentRound.generateNegative();
                satisfiesRule = this.currentRound.check(shapes);

                // If fallback also failed, that's a serious bug
                if (satisfiesRule !== shouldSatisfy) {
                }
            } else {
                // No fallback available - use generic fallback
                shapes = this.generateShapesFallback(shouldSatisfy);
                satisfiesRule = this.currentRound.check(shapes);
            }
        }

        this.currentExample = shapes;

        // Display shapes
        const shapesRow = document.createElement('div');
        shapesRow.className = 'shapes-row';

        shapes.forEach(shape => {
            const shapeBox = document.createElement('div');
            shapeBox.className = 'shape-box';

            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 100, 100);

            this.shapeGenerator.drawShape(ctx, shape.shape, [50, 50], 35, shape.color);

            shapeBox.appendChild(canvas);
            shapesRow.appendChild(shapeBox);
        });

        exampleDisplay.innerHTML = '';
        exampleDisplay.appendChild(shapesRow);

        // Progress indicator and controls
        controlsDiv.innerHTML = `
            <div style="text-align: center; margin-bottom: 15px;">
                <div id="shapes-progress" style="display: flex; gap: 8px; justify-content: center;">
                    ${this.createProgressDots(10)}
                </div>
            </div>
            <div class="button-group">
                <button class="btn btn-yes" id="btn-yes">Yes</button>
                <button class="btn btn-no" id="btn-no">No</button>
            </div>
            ${this.correctStreak >= 10 && !this.answerRevealed ? `
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

        if (this.correctStreak >= 10 && !this.answerRevealed) {
            document.getElementById('btn-reveal').addEventListener('click', () => this.revealAnswer());
        }

        document.getElementById('btn-yes').addEventListener('click', () => this.handleAnswer(true));
        document.getElementById('btn-no').addEventListener('click', () => this.handleAnswer(false));
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
            setTimeout(() => {
                this.isProcessingAnswer = false;
                this.generateExample();
            }, 800);
        }
    }

    revealAnswer() {
        this.answerRevealed = true;

        // Complete the round immediately - the success screen will show
        this.completeRound({ showSuccessScreen: true });
    }

    generateShapesForRule(shouldSatisfy) {
        const rule = this.currentRound;

        // Check if rule has custom distribution
        if (!rule.distribution) {
            return this.generateShapesFallback(shouldSatisfy);
        }

        const distributionSpec = shouldSatisfy ? rule.distribution.positive : rule.distribution.negative;

        // Convert distribution spec to generators
        const distributions = distributionSpec.map(spec => ({
            weight: spec.weight,
            generator: () => {
                const generatorFn = ShapeDistributions[spec.type];
                if (!generatorFn) {
                    return ShapeDistributions.uniformRandom();
                }

                // Handle different generator signatures
                if (spec.type === 'atLeastK' || spec.type === 'exactlyK') {
                    return generatorFn(spec.options.attribute, spec.options.value, spec.options.k);
                } else if (spec.type === 'specificAtPosition') {
                    return generatorFn(spec.options.position, spec.options.color, spec.options.type);
                } else if (spec.type === 'firstAndLastSame') {
                    return generatorFn(spec.options.attribute);
                } else if (spec.type === 'colorPattern' || spec.type === 'typePattern') {
                    return generatorFn(spec.options.pattern);
                } else if (spec.type === 'exactlyKColors' || spec.type === 'exactlyKTypes') {
                    return generatorFn(spec.options.k);
                } else if (spec.type === 'allSameColor') {
                    return generatorFn(spec.options?.color);
                } else if (spec.type === 'allSameType') {
                    return generatorFn(spec.options?.type);
                } else if (spec.type === 'withGreenCount' || spec.type === 'withTriangleCount' || spec.type === 'withCircleCount') {
                    return generatorFn(spec.options?.numGreen ?? spec.options?.numTriangles ?? spec.options?.numCircles ?? 1);
                } else {
                    // No options or simple call
                    return generatorFn();
                }
            }
        }));

        // Sample from weighted distribution
        return sampleFromDistribution(distributions);
    }

    generateShapesFallback(shouldSatisfy) {
        // Generic fallback: try random generation until we get correct satisfaction
        // This ensures 50/50 balance even when generators fail
        const rule = this.currentRound;
        let shapes, satisfiesRule;
        const maxAttempts = 100;
        let attempt = 0;

        do {
            shapes = ShapeDistributions.uniformRandom();
            satisfiesRule = rule.check(shapes);
            attempt++;
        } while (satisfiesRule !== shouldSatisfy && attempt < maxAttempts);

        return shapes;
    }

    addToHistory(example, correctAnswer) {
        const { historyContent } = this.getDisplayElements();

        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.style.padding = '10px';
        historyItem.style.display = 'flex';
        historyItem.style.alignItems = 'center';
        historyItem.style.gap = '12px';

        // Draw mini shapes - larger size
        const shapesDiv = document.createElement('div');
        shapesDiv.style.display = 'flex';
        shapesDiv.style.gap = '6px';
        shapesDiv.style.flex = '1';

        example.forEach(shape => {
            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 45;
            miniCanvas.height = 45;
            const ctx = miniCanvas.getContext('2d');

            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 45, 45);

            this.shapeGenerator.drawShape(ctx, shape.shape, [22.5, 22.5], 16, shape.color);
            shapesDiv.appendChild(miniCanvas);
        });

        historyItem.appendChild(shapesDiv);

        // Simple answer indicator
        const answerDiv = document.createElement('div');
        answerDiv.style.fontSize = '24px';
        answerDiv.style.fontWeight = 'bold';
        answerDiv.style.minWidth = '35px';
        answerDiv.style.textAlign = 'center';
        answerDiv.style.color = correctAnswer ? '#4caf50' : '#f44336';
        answerDiv.textContent = correctAnswer ? '✓' : '✗';

        historyItem.appendChild(answerDiv);

        historyContent.insertBefore(historyItem, historyContent.firstChild);
    }
}
