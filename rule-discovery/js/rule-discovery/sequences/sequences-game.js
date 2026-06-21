/**
 * Sequences Game
 * Continue number sequences by discovering the pattern
 * Flow: Show 5 numbers, get 4 correct in a row → textarea + reveal
 * Includes "Paljasta seuraava" button to reveal next number when stuck
 */

import { BaseGame } from '../core/base-game.js';

export class SequencesGame extends BaseGame {
    constructor(appManager, currentRound) {
        super(appManager, 'sequences', currentRound);
        this.sequenceValues = [];
        this.currentIndex = 0;
        this.correctStreak = 0;
        this.maxStreakAchieved = 0; // Track the highest streak ever achieved
        this.answerRevealed = false;
    }

    render() {
        // Generate enough initial values (show 5 + need space for reveals/predictions)
        this.sequenceValues = this.currentRound.generate(20); // Generate 20 terms initially
        this.currentIndex = 5; // Show first 5 numbers
        this.correctStreak = 0;
        this.maxStreakAchieved = 0; // Track the highest streak ever achieved
        this.answerRevealed = false;
        this.playerFilledIndices = []; // Track which indices were filled by player

        // Create the persistent DOM structure
        const { exampleDisplay } = this.getDisplayElements();
        exampleDisplay.innerHTML = '';

        // Override parent centering to prevent repositioning as sequence grows
        exampleDisplay.style.justifyContent = 'flex-start';
        exampleDisplay.style.alignItems = 'flex-start';

        const container = document.createElement('div');
        container.className = 'sequence-container';
        container.style.display = 'flex';
        container.style.justifyContent = 'flex-start';
        container.style.padding = '20px';

        const sequenceRow = document.createElement('div');
        sequenceRow.className = 'sequence-input-row';
        sequenceRow.id = 'sequence-row';
        // Enable wrapping to multiple lines
        sequenceRow.style.flexWrap = 'wrap';
        sequenceRow.style.maxWidth = '900px';

        // Add initial 5 numbers
        for (let i = 0; i < this.currentIndex; i++) {
            const numSpan = document.createElement('div');
            numSpan.className = 'sequence-number';
            numSpan.textContent = this.sequenceValues[i];
            sequenceRow.appendChild(numSpan);
        }

        // Add input box
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'sequence-input';
        input.id = 'sequence-input';
        sequenceRow.appendChild(input);

        container.appendChild(sequenceRow);
        exampleDisplay.appendChild(container);

        this.renderControls();
        this.attachEventListeners();
    }

    renderSequence() {
        // Just update the display incrementally - don't recreate everything
        const sequenceRow = document.getElementById('sequence-row');
        if (!sequenceRow) return;

        // Count how many number boxes already exist
        const existingNumbers = sequenceRow.querySelectorAll('.sequence-number').length;

        // Add any new numbers that should be visible
        for (let i = existingNumbers; i < this.currentIndex; i++) {
            const numSpan = document.createElement('div');
            numSpan.className = 'sequence-number';
            numSpan.textContent = this.sequenceValues[i];

            // Insert before the input box
            const input = sequenceRow.querySelector('#sequence-input');
            sequenceRow.insertBefore(numSpan, input);
        }

        // Update controls to show new progress
        this.renderControls();

        // Refocus input
        const input = document.getElementById('sequence-input');
        if (input) input.focus();
    }

    renderControls() {
        const { controlsDiv } = this.getDisplayElements();

        // Get required streak for this round (default 2, but 6 for primes)
        const requiredStreak = this.currentRound.required || 2;

        // Show textarea if maxStreakAchieved is high enough, even if current streak dropped
        const canSubmit = this.maxStreakAchieved >= requiredStreak && !this.answerRevealed;

        controlsDiv.innerHTML = `
            <div style="text-align: center; margin-bottom: 15px; margin-top: 20px;">
                <div id="sequence-progress" style="display: flex; gap: 8px; justify-content: center;">
                    ${this.createProgressDots(requiredStreak)}
                </div>
            </div>
            ${canSubmit ? `
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

        if (canSubmit) {
            const revealBtn = document.getElementById('btn-reveal');
            if (revealBtn) {
                revealBtn.addEventListener('click', () => this.revealAnswer());
            }
        }

        // Auto-focus the input field after any control update
        setTimeout(() => {
            const input = document.getElementById('sequence-input');
            if (input && input.style.display !== 'none') {
                input.focus();
            }
        }, 0);
    }

    attachEventListeners() {
        const input = document.getElementById('sequence-input');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.checkNumber();
            });
            input.focus();
        }
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

    checkNumber() {
        const input = document.getElementById('sequence-input');
        const userValue = parseInt(input.value, 10);

        if (isNaN(userValue)) {
            return;
        }

        // Ensure we have enough values generated
        this.ensureSequenceLength(this.currentIndex + 1);

        const correctValue = this.sequenceValues[this.currentIndex];
        const isCorrect = userValue === correctValue;

        if (isCorrect) {
            this.correctStreak++;

            // Update max streak achieved
            if (this.correctStreak > this.maxStreakAchieved) {
                this.maxStreakAchieved = this.correctStreak;
            }

            // Track that player filled this index
            this.playerFilledIndices.push(this.currentIndex);

            // Flash green background
            input.style.backgroundColor = '#c8e6c9';
            input.style.borderColor = '#4caf50';

            // Convert input to a permanent number box after brief delay
            setTimeout(() => {
                // Add the new number box
                const sequenceRow = document.getElementById('sequence-row');
                if (sequenceRow && input.parentNode === sequenceRow) {
                    const numSpan = document.createElement('div');
                    numSpan.className = 'sequence-number';
                    numSpan.textContent = userValue;

                    // Insert the new number before the input
                    sequenceRow.insertBefore(numSpan, input);
                }

                this.currentIndex++;

                // Reset input
                input.value = '';
                input.style.backgroundColor = '';
                input.style.borderColor = '';
                input.focus();

                // Update progress dots
                this.renderControls();
            }, 400);
        } else {
            // Reset current streak but keep maxStreakAchieved
            this.correctStreak = 0;

            // Flash red background
            input.style.backgroundColor = '#ffcdd2';
            input.style.borderColor = '#f44336';

            // Reset after delay
            setTimeout(() => {
                input.value = '';
                input.style.backgroundColor = '';
                input.style.borderColor = '';
                input.focus();

                // Update progress dots (this may now show the submit button if maxStreakAchieved is high enough)
                this.renderControls();
            }, 800);
        }
    }


    ensureSequenceLength(minLength) {
        // If we need more values, regenerate with a larger count
        if (this.sequenceValues.length < minLength) {
            // Regenerate with double the needed length to avoid frequent regeneration
            const newLength = Math.max(minLength * 2, this.sequenceValues.length * 2);
            this.sequenceValues = this.currentRound.generate(newLength);
        }
    }

    revealAnswer() {
        this.answerRevealed = true;

        // Hide the input box since the game is complete
        const input = document.getElementById('sequence-input');
        if (input) {
            input.style.display = 'none';
        }

        this.completeRound({ showSuccessScreen: true });
    }
}
