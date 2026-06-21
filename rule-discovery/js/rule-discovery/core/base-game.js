/**
 * Base Game Class
 * Abstract base class for all rule discovery games
 * Provides common functionality and interface
 */

export class BaseGame {
    constructor(appManager, gameType, currentRound) {
        this.app = appManager;
        this.gameType = gameType;
        this.currentRound = currentRound;
        this.history = [];
        this.isProcessingAnswer = false;  // Prevent double-click

        // Inject CSS to remove number input spinners (only once)
        if (!document.getElementById('remove-number-spinners')) {
            const style = document.createElement('style');
            style.id = 'remove-number-spinners';
            style.textContent = `
                input[type="number"]::-webkit-outer-spin-button,
                input[type="number"]::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                input[type="number"] {
                    -moz-appearance: textfield;
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Initialize and render the game UI
     * Must be implemented by subclasses
     */
    render() {
        throw new Error('render() must be implemented by subclass');
    }

    /**
     * Clean up game resources
     */
    cleanup() {
        // Override if needed
    }

    /**
     * Show feedback message
     */
    showFeedback(message, type) {
        this.app.showFeedback(message, type);
    }

    /**
     * Clear feedback message
     */
    clearFeedback() {
        this.app.clearFeedback();
    }

    /**
     * Complete the current round
     */
    completeRound(options) {
        this.app.completeRound(options);
    }

    /**
     * Get DOM elements for display and controls
     */
    getDisplayElements() {
        return {
            exampleDisplay: this.app.exampleDisplay,
            controlsDiv: this.app.controlsDiv,
            historyColumn: this.app.historyColumn,
            historyContent: this.app.historyContent
        };
    }

    /**
     * Sanitize number input to only allow digits and minus sign
     * Prevents any character that isn't 0-9 or minus from being entered
     */
    sanitizeNumberInput(input) {
        // Prevent invalid key presses (keydown fires before the character is entered)
        input.addEventListener('keydown', (e) => {
            // Allow: backspace, delete, tab, escape, enter, arrows, home, end
            const specialKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                                'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                                'Home', 'End'];

            if (specialKeys.includes(e.key)) {
                return; // Allow these keys
            }

            // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            if (e.ctrlKey || e.metaKey) {
                return; // Allow Ctrl/Cmd shortcuts
            }

            // Check if the key is 0-9 or minus
            const char = e.key;
            const isDigit = char >= '0' && char <= '9';
            const isMinus = char === '-';

            if (!isDigit && !isMinus) {
                e.preventDefault(); // Block this key
                return;
            }
        });

        // Sanitize on paste (in case user pastes invalid content)
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            // Keep only 0-9 and minus
            const cleaned = pastedText.replace(/[^-0-9]/g, '');

            // Insert cleaned text at cursor position
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const currentValue = input.value;
            const newValue = currentValue.substring(0, start) + cleaned + currentValue.substring(end);
            input.value = newValue;

            // Set cursor position after inserted text
            const newCursorPos = start + cleaned.length;
            input.setSelectionRange(newCursorPos, newCursorPos);

            // Trigger input event so any listeners are notified
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Fallback: sanitize on input event (catches any edge cases)
        input.addEventListener('input', (e) => {
            const oldValue = input.value;
            // Keep only 0-9 and minus
            const newValue = oldValue.replace(/[^-0-9]/g, '');
            if (oldValue !== newValue) {
                input.value = newValue;
            }
        });
    }
}
