/**
 * App Manager
 * Main application orchestration for Rule Discovery games
 */

import { SHAPES_RULES } from '../shapes/shapes-rules.js';
import { GRIDS_RULES } from '../grids/grids-rules.js';
import { SEQUENCES_RULES } from '../sequences/sequences-rules.js';
import { FUNCTIONS_RULES } from '../functions/functions-rules.js';
import { FUNCTIONS2_RULES } from '../functions2/functions2-rules.js';
import { FUNCTIONS5_RULES } from '../functions5/functions5-rules.js';
import { THREE_NUMBERS_RULES } from '../threeNumbers/three-numbers-rules.js';
import { POINTS_RULES } from '../points/points-rules.js';

import { ShapesGame } from '../shapes/shapes-game.js';
import { GridsGame } from '../grids/grids-game.js';
import { FunctionsGame } from '../functions/functions-game.js';
import { Functions2Game } from '../functions2/functions2-game.js';
import { Functions5Game } from '../functions5/functions5-game.js';
import { SequencesGame } from '../sequences/sequences-game.js';
import { ThreeNumbersGame } from '../threeNumbers/three-numbers-game.js';
import { PointsGame } from '../points/points-game.js';

// Reconstruct GAME_RULES from individual imports
const GAME_RULES = {
    shapes: SHAPES_RULES,
    sequences: SEQUENCES_RULES,
    functions: FUNCTIONS_RULES,
    functions2: FUNCTIONS2_RULES,
    functions5: FUNCTIONS5_RULES,
    threeNumbers: THREE_NUMBERS_RULES,
    grids: GRIDS_RULES,
    points: POINTS_RULES
};

export class RuleDiscoveryApp {
    constructor() {
        this.currentGame = null;
        this.currentGameInstance = null;
        this.currentRound = null;
        this.progress = this.loadProgress();

        this.initializeApp();
    }

    initializeApp() {
        // Initialize DOM elements
        this.mainMenu = document.getElementById('main-menu');
        this.gameScreen = document.getElementById('game-screen');
        this.exampleDisplay = document.getElementById('example-display');
        this.controlsDiv = document.getElementById('controls');
        this.historyColumn = document.getElementById('history-column');
        this.historyContent = document.getElementById('history-content');
        this.feedback = document.getElementById('feedback');

        // Render progress for all games
        this.renderAllProgress();

        // Set up event listeners
        this.setupEventListeners();

        // Help tooltip
        this.setupHelpTooltip();

    }

    setupEventListeners() {
        // Round boxes are made clickable in renderProgress() method
        // No game-level click handlers needed

        // Back button
        document.getElementById('back-to-menu').addEventListener('click', () => {
            this.backToMenu();
        });

        // Reset button
        document.getElementById('reset-all').addEventListener('click', () => this.resetAllData());
    }

    setupHelpTooltip() {
        const helpIcon = document.getElementById('help-icon');
        const helpTooltip = document.getElementById('help-tooltip');

        if (helpIcon && helpTooltip) {
            helpIcon.addEventListener('mouseenter', () => {
                helpTooltip.style.display = 'block';
            });

            helpIcon.addEventListener('mouseleave', () => {
                helpTooltip.style.display = 'none';
            });
        }
    }

    // ========================================================================
    // PROGRESS MANAGEMENT
    // ========================================================================

    loadProgress() {
        try {
            const saved = localStorage.getItem('ruleDiscoveryProgress');
            if (saved) {
                const progress = JSON.parse(saved);

                // Add any missing games to existing progress
                for (const game in GAME_RULES) {
                    if (!progress[game]) {
                        progress[game] = GAME_RULES[game].map(rule => ({
                            ruleId: rule.id,
                            completed: false,
                            attempts: 0,
                            firstSuccessAttempt: null
                        }));
                    }
                }

                return progress;
            }
        } catch (error) {
        }

        // Initialize empty progress
        const progress = {};
        for (const game in GAME_RULES) {
            progress[game] = GAME_RULES[game].map(rule => ({
                ruleId: rule.id,
                completed: false,
                attempts: 0,
                firstSuccessAttempt: null
            }));
        }
        return progress;
    }

    saveProgress() {
        try {
            localStorage.setItem('ruleDiscoveryProgress', JSON.stringify(this.progress));
        } catch (error) {
        }
    }

    markRoundComplete(game, ruleId) {
        const roundProgress = this.progress[game].find(p => p.ruleId === ruleId);
        if (roundProgress) {
            roundProgress.completed = true;
            roundProgress.attempts++;
            this.saveProgress();
            this.renderProgress(game);
        } else {
        }
    }

    renderAllProgress() {
        for (const game in GAME_RULES) {
            this.renderProgress(game);
        }
    }

    renderProgress(game) {
        const container = document.getElementById(`${game}-rounds`);
        if (!container) return;

        container.innerHTML = '';
        const rules = GAME_RULES[game];
        const progress = this.progress[game];

        rules.forEach((rule, index) => {
            const box = document.createElement('div');
            box.className = 'round-box';
            box.textContent = index + 1;
            box.style.cursor = 'pointer';

            const roundProgress = progress.find(p => p.ruleId === rule.id);
            if (roundProgress && roundProgress.completed) {
                box.classList.add('completed');
            }

            // Add tooltip ONLY for completed rounds
            if (roundProgress && roundProgress.completed) {
                box.title = rule.name;
                box.style.position = 'relative';
            }

            // Make each round box clickable
            box.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startGame(game, index);
            });

            container.appendChild(box);
        });
    }

    resetAllData() {
        if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
            localStorage.removeItem('ruleDiscoveryProgress');
            this.progress = this.loadProgress();
            this.renderAllProgress();
            this.backToMenu();
            alert('All data has been reset.');
        }
    }

    // ========================================================================
    // GAME FLOW
    // ========================================================================

    startGame(game, roundIndex = null) {
        this.currentGame = game;
        const rules = GAME_RULES[game];

        // If no roundIndex specified, find next incomplete round
        if (roundIndex === null) {
            const incompletedRound = this.progress[game].findIndex(p => !p.completed);
            roundIndex = incompletedRound !== -1 ? incompletedRound : 0;
        }

        this.currentRound = rules[roundIndex];

        // Show game screen
        this.mainMenu.style.display = 'none';
        this.gameScreen.classList.add('active');

        // Update game info
        document.getElementById('game-title').textContent = this.getGameTitle(game);
        document.getElementById('round-info').textContent = `Round ${roundIndex + 1} / ${rules.length}`;

        // Hide history by default (games will show if needed)
        this.historyColumn.classList.add('hidden');
        this.historyContent.innerHTML = '';

        // Create game instance
        this.createGameInstance(game);
    }

    createGameInstance(game) {
        // Clean up previous game
        if (this.currentGameInstance) {
            this.currentGameInstance.cleanup();
        }

        // Create new game instance
        switch (game) {
            case 'shapes':
                this.currentGameInstance = new ShapesGame(this, this.currentRound);
                break;
            case 'grids':
                this.currentGameInstance = new GridsGame(this, this.currentRound);
                break;
            case 'functions':
                this.currentGameInstance = new FunctionsGame(this, this.currentRound);
                break;
            case 'functions2':
                this.currentGameInstance = new Functions2Game(this, this.currentRound);
                break;
            case 'functions5':
                this.currentGameInstance = new Functions5Game(this, this.currentRound);
                break;
            case 'sequences':
                this.currentGameInstance = new SequencesGame(this, this.currentRound);
                break;
            case 'threeNumbers':
                this.currentGameInstance = new ThreeNumbersGame(this, this.currentRound);
                break;
            case 'points':
                this.currentGameInstance = new PointsGame(this, this.currentRound);
                break;
            default:
                return;
        }

        // Render the game
        this.currentGameInstance.render();
    }

    getGameTitle(game) {
        const titles = {
            shapes: 'Colorful Shapes',
            grids: 'Grids',
            functions: 'Function Machines',
            functions2: 'Function Machines, Part 2',
            functions5: 'Function Machines, Part 3',
            sequences: 'Number Sequences',
            threeNumbers: 'The Three-Number Game',
            points: 'Points in the Plane'
        };
        return titles[game] || game;
    }

    backToMenu() {
        // Cleanup current game
        if (this.currentGameInstance) {
            this.currentGameInstance.cleanup();
        }

        this.currentGame = null;
        this.currentGameInstance = null;
        this.currentRound = null;

        this.gameScreen.classList.remove('active');
        this.mainMenu.style.display = 'block';

        // Refresh progress display to show any newly completed rounds
        this.renderAllProgress();

        this.clearFeedback();
    }

    // ========================================================================
    // ROUND COMPLETION
    // ========================================================================

    completeRound(options = {}) {
        const { showSuccessScreen = false } = options;

        this.markRoundComplete(this.currentGame, this.currentRound.id);

        const rules = GAME_RULES[this.currentGame];

        if (showSuccessScreen) {
            // Show success screen with rule name and manual advance button
            this.showSuccessScreen();
        } else {
            // Auto-advance after delay (old behavior for backward compatibility)
            this.showFeedback(`✓ "${this.currentRound.name}"`, 'correct');

            setTimeout(() => {
                this.advanceToNextRound();
            }, 2500);
        }
    }

    showSuccessScreen() {
        const { exampleDisplay, controlsDiv } = this;

        // For sequences game, keep the sequence visible; otherwise clear display
        if (this.currentGame !== 'sequences') {
            exampleDisplay.innerHTML = '';
            controlsDiv.innerHTML = '';
        } else {
            // For sequences, only clear controls (keep the sequence in exampleDisplay)
            controlsDiv.innerHTML = '';
        }

        this.clearFeedback(); // Clear the feedback message at the bottom

        // Create success message container
        const successContainer = document.createElement('div');
        successContainer.style.display = 'flex';
        successContainer.style.flexDirection = 'column';
        successContainer.style.alignItems = 'center';
        successContainer.style.gap = '30px';
        successContainer.style.padding = '60px 40px';

        // Success icon and title
        const successTitle = document.createElement('div');
        successTitle.style.fontSize = '32px';
        successTitle.style.fontWeight = 'bold';
        successTitle.style.color = '#2e7d32';
        successTitle.style.textAlign = 'center';
        successTitle.textContent = 'Level cleared!';

        // Rule description and button row
        const ruleRow = document.createElement('div');
        ruleRow.style.display = 'flex';
        ruleRow.style.alignItems = 'center';
        ruleRow.style.gap = '30px';
        ruleRow.style.justifyContent = 'center';

        const ruleDescription = document.createElement('div');
        ruleDescription.style.fontSize = '22px';
        ruleDescription.style.color = '#333';
        ruleDescription.innerHTML = `The rule was: <strong>${this.currentRound.name}</strong>`;

        // Check if there's a next round
        const rules = GAME_RULES[this.currentGame];
        const currentIndex = rules.findIndex(r => r.id === this.currentRound.id);
        const hasNextRound = currentIndex < rules.length - 1;

        // Next round button (if available)
        if (hasNextRound) {
            const nextButton = document.createElement('button');
            nextButton.className = 'btn btn-primary';
            nextButton.textContent = `To round ${currentIndex + 2} →`;
            nextButton.style.fontSize = '20px';
            nextButton.style.padding = '15px 40px';
            nextButton.addEventListener('click', () => {
                // Mark current as completed and advance
                this.progress[this.currentGame][currentIndex].completed = true;
                this.advanceToNextRound();
            });
            ruleRow.appendChild(ruleDescription);
            ruleRow.appendChild(nextButton);
        }

        // Back to menu button
        const backButton = document.createElement('button');
        backButton.className = 'btn btn-primary';
        backButton.textContent = 'Back to main menu';
        backButton.style.fontSize = '20px';
        backButton.style.padding = '15px 40px';
        backButton.addEventListener('click', () => this.backToMenu());

        if (!hasNextRound) {
            ruleRow.appendChild(ruleDescription);
        }
        ruleRow.appendChild(backButton);

        successContainer.appendChild(successTitle);
        successContainer.appendChild(ruleRow);

        // For sequences, append to controlsDiv instead of replacing exampleDisplay
        if (this.currentGame === 'sequences') {
            controlsDiv.appendChild(successContainer);
        } else {
            exampleDisplay.appendChild(successContainer);
        }

        // Focus the button for keyboard navigation
        backButton.focus();
    }

    advanceToNextRound() {
        const rules = GAME_RULES[this.currentGame];
        const currentIndex = rules.findIndex(r => r.id === this.currentRound.id);
        const nextIndex = currentIndex + 1;

        // If there's a next round, advance to it (regardless of completion status)
        if (nextIndex < rules.length) {
            // Clear history content
            if (this.historyContent) {
                this.historyContent.innerHTML = '';
            }

            // Start next round
            this.currentRound = rules[nextIndex];

            document.getElementById('round-info').textContent = `Round ${nextIndex + 1} / ${rules.length}`;

            // Create new game instance for next round
            this.createGameInstance(this.currentGame);
        } else {
            // No more rounds - just return to menu
            this.backToMenu();
        }
    }

    // ========================================================================
    // UI HELPERS
    // ========================================================================

    showFeedback(message, type) {
        this.feedback.textContent = message;
        this.feedback.className = `feedback ${type}`;
    }

    clearFeedback() {
        this.feedback.className = 'feedback';
        this.feedback.textContent = '';
    }
}
