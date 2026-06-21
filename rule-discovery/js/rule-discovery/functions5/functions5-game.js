/**
 * Functions5 Game - 5-variate Functions
 * Test five inputs against function, then prove understanding via unit tests
 * Flow: Exploration → "Tiedän" → 10 unit tests
 */

import { BaseGame } from '../core/base-game.js';

export class Functions5Game extends BaseGame {
    constructor(appManager, currentRound) {
        super(appManager, 'functions5', currentRound);
        this.tests = [];
        this.unitTests = null;
        this.unitTestIndex = 0;
        this.unitTestResults = [];
    }

    render() {
        const { exampleDisplay, controlsDiv } = this.getDisplayElements();

        // Create main layout container
        const mainLayout = document.createElement('div');
        mainLayout.style.display = 'flex';
        mainLayout.style.gap = '40px';
        mainLayout.style.alignItems = 'flex-start';
        mainLayout.style.justifyContent = 'flex-start';
        mainLayout.style.maxWidth = '1200px';
        mainLayout.style.marginBottom = '20px';
        mainLayout.style.marginLeft = 'auto';
        mainLayout.style.marginRight = 'auto';
        mainLayout.style.paddingLeft = '40px';

        // Left side: input and history
        const leftSide = document.createElement('div');
        leftSide.style.display = 'flex';
        leftSide.style.flexDirection = 'column';
        leftSide.style.alignItems = 'flex-start';
        leftSide.style.flex = '0 0 auto';
        leftSide.style.minWidth = '600px';

        // Create wrapper with relative positioning
        const inputWrapper = document.createElement('div');
        inputWrapper.style.position = 'relative';
        inputWrapper.style.marginBottom = '20px';

        // Create input row (a b c d e → f(a,b,c,d,e)) - no commas, just spacing
        const inputRow = document.createElement('div');
        inputRow.style.display = 'flex';
        inputRow.style.gap = '10px';
        inputRow.style.alignItems = 'center';
        inputRow.style.fontSize = '24px';

        const inputs = [];
        for (let i = 0; i < 5; i++) {
            const input = this.createNumberInput(`input-${i}`);
            inputs.push(input);
            inputRow.appendChild(input);
        }

        const arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.style.color = '#999';
        arrow.style.fontWeight = 'bold';
        arrow.style.marginLeft = '5px';
        inputRow.appendChild(arrow);

        const outputDisplay = document.createElement('div');
        outputDisplay.id = 'output-display';
        outputDisplay.style.width = '100px';
        outputDisplay.style.height = '50px';
        outputDisplay.style.fontSize = '28px';
        outputDisplay.style.textAlign = 'center';
        outputDisplay.style.display = 'flex';
        outputDisplay.style.alignItems = 'center';
        outputDisplay.style.justifyContent = 'center';
        outputDisplay.style.border = '2px solid #ddd';
        outputDisplay.style.borderRadius = '6px';
        outputDisplay.style.fontWeight = 'bold';
        outputDisplay.style.color = '#666';
        outputDisplay.style.marginLeft = '5px';
        outputDisplay.textContent = '?';

        inputRow.appendChild(outputDisplay);

        // Create button with absolute positioning
        const testBtn = document.createElement('button');
        testBtn.className = 'btn btn-primary';
        testBtn.id = 'btn-test-input';
        testBtn.textContent = 'Test';
        testBtn.style.position = 'absolute';
        testBtn.style.left = '100%';
        testBtn.style.marginLeft = '20px';
        testBtn.style.top = '50%';
        testBtn.style.transform = 'translateY(-50%)';

        inputWrapper.appendChild(inputRow);
        inputWrapper.appendChild(testBtn);

        // Create history container
        const historyDiv = document.createElement('div');
        historyDiv.id = 'function-history';
        historyDiv.style.display = 'flex';
        historyDiv.style.flexDirection = 'column';
        historyDiv.style.alignItems = 'flex-start';

        leftSide.appendChild(inputWrapper);
        leftSide.appendChild(historyDiv);

        // Right side: rule input and button
        const rightSide = document.createElement('div');
        rightSide.style.display = 'flex';
        rightSide.style.flexDirection = 'column';
        rightSide.style.gap = '10px';
        rightSide.style.flex = '0 0 auto';
        rightSide.style.width = '450px';
        rightSide.style.position = 'relative';
        rightSide.style.marginLeft = '80px';

        const ruleInput = document.createElement('textarea');
        ruleInput.id = 'rule-answer-input';
        ruleInput.placeholder = 'The rule is...';
        ruleInput.style.width = '100%';
        ruleInput.style.height = '100px';
        ruleInput.style.padding = '12px';
        ruleInput.style.fontSize = '16px';
        ruleInput.style.border = '2px solid #ddd';
        ruleInput.style.borderRadius = '6px';
        ruleInput.style.resize = 'vertical';
        ruleInput.style.fontFamily = 'Arial, sans-serif';

        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-secondary';
        submitBtn.id = 'btn-know-function';
        submitBtn.textContent = 'I know the rule';
        submitBtn.style.alignSelf = 'flex-end';

        rightSide.appendChild(ruleInput);
        rightSide.appendChild(submitBtn);

        mainLayout.appendChild(leftSide);
        mainLayout.appendChild(rightSide);

        exampleDisplay.innerHTML = '';
        exampleDisplay.appendChild(mainLayout);
        controlsDiv.innerHTML = '';

        // Rebuild history from this.tests array (after DOM is attached)
        this.tests.slice().reverse().forEach(test => {
            this.addHistoryRow(test.vals, test.result);
        });

        // Event listeners
        testBtn.addEventListener('click', () => this.testInput());
        submitBtn.addEventListener('click', () => this.startUnitTests());

        // Enter key on inputs
        inputs.forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.testInput();
            });
        });

        inputs[0].focus();
    }

    createNumberInput(id) {
        const input = document.createElement('input');
        input.type = 'number';
        input.id = id;
        input.className = 'number-input';
        input.step = '1';
        input.style.width = '70px';
        input.style.height = '50px';
        input.style.fontSize = '20px';
        this.sanitizeNumberInput(input);
        return input;
    }

    testInput() {
        const vals = [];
        const inputs = [];
        for (let i = 0; i < 5; i++) {
            const input = document.getElementById(`input-${i}`);
            inputs.push(input);
            const val = parseInt(input.value, 10);
            if (isNaN(val)) return;
            vals.push(val);
        }

        const result = this.currentRound.check(...vals);

        // Disable inputs during display period
        inputs.forEach(input => {
            input.disabled = true;
            input.style.opacity = '0.6';
        });

        // Show result in output display
        const outputDisplay = document.getElementById('output-display');
        outputDisplay.textContent = result;
        outputDisplay.style.backgroundColor = '#e3f2fd';
        outputDisplay.style.borderColor = '#2196F3';
        outputDisplay.style.color = '#1565c0';

        // Add to history
        this.addHistoryRow(vals, result);
        this.tests.push({ vals, result });

        // Clear input and reset after brief delay
        setTimeout(() => {
            inputs.forEach(input => {
                input.value = '';
                input.disabled = false;
                input.style.opacity = '1';
            });
            outputDisplay.textContent = '?';
            outputDisplay.style.backgroundColor = '';
            outputDisplay.style.borderColor = '#ddd';
            outputDisplay.style.color = '#666';
            inputs[0].focus();
        }, 800);

        this.clearFeedback();
    }

    addHistoryRow(vals, result) {
        const historyDiv = document.getElementById('function-history');
        const historyRow = document.createElement('div');
        historyRow.style.display = 'flex';
        historyRow.style.gap = '8px';
        historyRow.style.alignItems = 'center';
        historyRow.style.marginBottom = '8px';
        historyRow.style.fontSize = '16px';

        vals.forEach((val, i) => {
            const box = document.createElement('div');
            box.style.width = '55px';
            box.style.height = '38px';
            box.style.fontSize = '16px';
            box.style.textAlign = 'center';
            box.style.display = 'flex';
            box.style.alignItems = 'center';
            box.style.justifyContent = 'center';
            box.style.border = '2px solid #ddd';
            box.style.borderRadius = '6px';
            box.style.fontWeight = 'bold';
            box.textContent = val;
            historyRow.appendChild(box);
        });

        const arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.style.color = '#999';
        arrow.style.fontWeight = 'bold';
        arrow.style.marginLeft = '3px';
        historyRow.appendChild(arrow);

        const resultBox = document.createElement('div');
        resultBox.style.width = '65px';
        resultBox.style.height = '38px';
        resultBox.style.fontSize = '16px';
        resultBox.style.textAlign = 'center';
        resultBox.style.display = 'flex';
        resultBox.style.alignItems = 'center';
        resultBox.style.justifyContent = 'center';
        resultBox.style.border = '2px solid #ddd';
        resultBox.style.borderRadius = '6px';
        resultBox.style.fontWeight = 'bold';
        resultBox.style.marginLeft = '3px';
        resultBox.textContent = result;

        historyRow.appendChild(resultBox);

        historyDiv.insertBefore(historyRow, historyDiv.firstChild);
    }

    startUnitTests() {
        // Store the user's written answer
        this.userAnswer = document.getElementById('rule-answer-input').value;

        this.unitTests = this.generateUnitTests();
        this.unitTestIndex = 0;
        this.unitTestResults = [];
        this.unitTestHistory = [];
        this.showNextUnitTest();
    }

    generateUnitTests() {
        const tests = [];
        const rule = this.currentRound;

        // Use predefined test inputs from rule, or generate if not available
        const allTestInputs = rule.testInputs || this.generateTestInputs();

        // Shuffle and pick 4 random test cases
        const shuffled = [...allTestInputs];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const testQuintuples = shuffled.slice(0, 4);

        for (const vals of testQuintuples) {
            const expected = rule.check(...vals);
            tests.push({ vals, expected });
        }

        return tests;
    }

    generateTestInputs() {
        // Fallback: Generate diverse test inputs
        const quintuples = [];
        const nums = [-5, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];

        // Generate 20 quintuples for variety
        for (let i = 0; i < 20; i++) {
            const vals = [];
            for (let j = 0; j < 5; j++) {
                vals.push(nums[Math.floor(Math.random() * nums.length)]);
            }
            quintuples.push(vals);
        }

        return quintuples;
    }

    showNextUnitTest() {
        if (this.unitTestIndex >= this.unitTests.length) {
            this.completeUnitTests();
            return;
        }

        const test = this.unitTests[this.unitTestIndex];
        this.renderUnitTestUI(test);
    }

    renderUnitTestUI(test) {
        const { exampleDisplay, controlsDiv } = this.getDisplayElements();

        // Create main layout matching training stage
        const mainLayout = document.createElement('div');
        mainLayout.style.display = 'flex';
        mainLayout.style.gap = '40px';
        mainLayout.style.alignItems = 'flex-start';
        mainLayout.style.justifyContent = 'flex-start';
        mainLayout.style.maxWidth = '1200px';
        mainLayout.style.marginBottom = '20px';
        mainLayout.style.marginLeft = 'auto';
        mainLayout.style.marginRight = 'auto';
        mainLayout.style.paddingLeft = '40px';

        // Left side: current test and history
        const leftSide = document.createElement('div');
        leftSide.style.display = 'flex';
        leftSide.style.flexDirection = 'column';
        leftSide.style.alignItems = 'flex-start';
        leftSide.style.flex = '0 0 auto';
        leftSide.style.minWidth = '600px';

        // Progress indicator
        const progress = document.createElement('div');
        progress.style.fontSize = '16px';
        progress.style.color = '#666';
        progress.style.marginBottom = '15px';
        progress.textContent = `Test ${this.unitTestIndex + 1} / ${this.unitTests.length}`;

        // Create input wrapper
        const inputWrapper = document.createElement('div');
        inputWrapper.style.position = 'relative';
        inputWrapper.style.marginBottom = '20px';

        // Create input row with fixed values and prediction input
        const inputRow = document.createElement('div');
        inputRow.style.display = 'flex';
        inputRow.style.gap = '10px';
        inputRow.style.alignItems = 'center';
        inputRow.style.fontSize = '24px';

        // Fixed input displays (not editable)
        test.vals.forEach((val, i) => {
            const valDisplay = document.createElement('div');
            valDisplay.style.width = '70px';
            valDisplay.style.height = '50px';
            valDisplay.style.fontSize = '20px';
            valDisplay.style.textAlign = 'center';
            valDisplay.style.display = 'flex';
            valDisplay.style.alignItems = 'center';
            valDisplay.style.justifyContent = 'center';
            valDisplay.style.border = '2px solid #ddd';
            valDisplay.style.borderRadius = '6px';
            valDisplay.style.fontWeight = 'bold';
            valDisplay.style.backgroundColor = '#f9f9f9';
            valDisplay.style.color = '#333';
            valDisplay.textContent = val;
            inputRow.appendChild(valDisplay);
        });

        const arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.style.color = '#999';
        arrow.style.fontWeight = 'bold';
        arrow.style.marginLeft = '5px';
        inputRow.appendChild(arrow);

        // Output prediction input
        const predictionInput = document.createElement('input');
        predictionInput.type = 'number';
        predictionInput.id = 'unit-test-prediction';
        predictionInput.style.width = '100px';
        predictionInput.style.height = '50px';
        predictionInput.style.fontSize = '28px';
        predictionInput.style.textAlign = 'center';
        predictionInput.style.border = '2px solid #2196F3';
        predictionInput.style.borderRadius = '6px';
        predictionInput.style.fontWeight = 'bold';
        predictionInput.style.marginLeft = '5px';
        this.sanitizeNumberInput(predictionInput);
        inputRow.appendChild(predictionInput);

        // Submit button
        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-primary';
        submitBtn.textContent = 'Answer';
        submitBtn.style.position = 'absolute';
        submitBtn.style.left = '100%';
        submitBtn.style.marginLeft = '20px';
        submitBtn.style.top = '50%';
        submitBtn.style.transform = 'translateY(-50%)';

        inputWrapper.appendChild(inputRow);
        inputWrapper.appendChild(submitBtn);

        // History of unit tests
        const historyDiv = document.createElement('div');
        historyDiv.id = 'unit-test-history';
        historyDiv.style.display = 'flex';
        historyDiv.style.flexDirection = 'column';
        historyDiv.style.alignItems = 'flex-start';

        // Add previous test results to history
        this.unitTestHistory.forEach(({ vals, prediction, correct }) => {
            const historyRow = document.createElement('div');
            historyRow.style.display = 'flex';
            historyRow.style.gap = '5px';
            historyRow.style.alignItems = 'center';
            historyRow.style.marginBottom = '8px';

            vals.forEach(val => {
                const box = document.createElement('div');
                box.style.width = '55px';
                box.style.height = '38px';
                box.style.fontSize = '16px';
                box.style.textAlign = 'center';
                box.style.display = 'flex';
                box.style.alignItems = 'center';
                box.style.justifyContent = 'center';
                box.style.border = '2px solid #ddd';
                box.style.borderRadius = '6px';
                box.style.fontWeight = 'bold';
                box.style.backgroundColor = '#f9f9f9';
                box.textContent = val;
                historyRow.appendChild(box);
            });

            const arrowSpan = document.createElement('span');
            arrowSpan.textContent = '→';
            arrowSpan.style.color = '#999';
            arrowSpan.style.fontWeight = 'bold';
            arrowSpan.style.marginLeft = '3px';
            historyRow.appendChild(arrowSpan);

            const resultBox = document.createElement('div');
            resultBox.style.width = '65px';
            resultBox.style.height = '38px';
            resultBox.style.fontSize = '16px';
            resultBox.style.textAlign = 'center';
            resultBox.style.display = 'flex';
            resultBox.style.alignItems = 'center';
            resultBox.style.justifyContent = 'center';
            resultBox.style.border = '2px solid #ddd';
            resultBox.style.borderRadius = '6px';
            resultBox.style.fontWeight = 'bold';
            resultBox.style.marginLeft = '3px';
            resultBox.textContent = prediction;
            resultBox.style.backgroundColor = correct ? '#e8f5e9' : '#ffebee';
            resultBox.style.borderColor = correct ? '#4caf50' : '#f44336';

            historyRow.appendChild(resultBox);
            historyDiv.appendChild(historyRow);
        });

        leftSide.appendChild(progress);
        leftSide.appendChild(inputWrapper);
        leftSide.appendChild(historyDiv);

        // Right side: User's written answer (read-only)
        const rightSide = document.createElement('div');
        rightSide.style.display = 'flex';
        rightSide.style.flexDirection = 'column';
        rightSide.style.gap = '10px';
        rightSide.style.flex = '0 0 auto';
        rightSide.style.width = '450px';
        rightSide.style.marginLeft = '80px';

        const answerLabel = document.createElement('div');
        answerLabel.style.fontSize = '14px';
        answerLabel.style.color = '#666';
        answerLabel.style.marginBottom = '5px';
        answerLabel.textContent = 'Your answer:';

        const answerDisplay = document.createElement('div');
        answerDisplay.style.width = '100%';
        answerDisplay.style.minHeight = '100px';
        answerDisplay.style.padding = '12px';
        answerDisplay.style.fontSize = '16px';
        answerDisplay.style.border = '2px solid #ddd';
        answerDisplay.style.borderRadius = '6px';
        answerDisplay.style.backgroundColor = '#f9f9f9';
        answerDisplay.style.fontFamily = 'Arial, sans-serif';
        answerDisplay.style.whiteSpace = 'pre-wrap';
        answerDisplay.style.wordWrap = 'break-word';
        answerDisplay.textContent = this.userAnswer || '(no answer)';

        rightSide.appendChild(answerLabel);
        rightSide.appendChild(answerDisplay);

        mainLayout.appendChild(leftSide);
        mainLayout.appendChild(rightSide);

        exampleDisplay.innerHTML = '';
        exampleDisplay.appendChild(mainLayout);
        controlsDiv.innerHTML = '';

        // Event listeners
        submitBtn.addEventListener('click', () => this.checkUnitTest(test));
        predictionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.checkUnitTest(test);
        });

        predictionInput.focus();
    }

    checkUnitTest(test) {
        const predictionInput = document.getElementById('unit-test-prediction');
        const prediction = parseInt(predictionInput.value, 10);

        if (isNaN(prediction)) {
            return;
        }

        const correct = (prediction === test.expected);
        this.unitTestResults.push(correct);

        // Add to history
        this.unitTestHistory.push({
            vals: test.vals,
            prediction: prediction,
            correct: correct
        });

        if (!correct) {
            // Failed unit test - show failure and restart
            this.showUnitTestFailure(test, prediction);
            return;
        }

        // Correct - move to next test
        this.unitTestIndex++;
        this.showNextUnitTest();
    }

    showUnitTestFailure(test, prediction) {
        // Show error message in feedback area
        this.showFeedback('✗ Wrong answer!', 'incorrect');

        // Return to training phase after a short delay
        setTimeout(() => {
            this.clearFeedback();
            this.render(); // Return to training with history preserved
        }, 2000);
    }

    completeUnitTests() {
        // All tests passed!
        this.completeRound({ showSuccessScreen: true });
    }
}
