/**
 * Functions2 Game - Bivariate Functions
 * Test two inputs against function, then prove understanding via unit tests
 * Flow: Exploration → "Tiedän" → 10 unit tests
 */

import { BaseGame } from '../core/base-game.js';

export class Functions2Game extends BaseGame {
    constructor(appManager, currentRound) {
        super(appManager, 'functions2', currentRound);
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
        mainLayout.style.maxWidth = '1000px';
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
        leftSide.style.minWidth = '400px';

        // Create wrapper with relative positioning
        const inputWrapper = document.createElement('div');
        inputWrapper.style.position = 'relative';
        inputWrapper.style.marginBottom = '20px';

        // Create input row (x y → f(x, y)) - no comma, just spacing
        const inputRow = document.createElement('div');
        inputRow.style.display = 'flex';
        inputRow.style.gap = '15px';
        inputRow.style.alignItems = 'center';
        inputRow.style.fontSize = '32px';

        const inputX = this.createNumberInput('input-x');
        const inputY = this.createNumberInput('input-y');
        const arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.style.color = '#999';
        arrow.style.fontWeight = 'bold';

        const outputDisplay = document.createElement('div');
        outputDisplay.id = 'output-display';
        outputDisplay.style.width = '120px';
        outputDisplay.style.height = '60px';
        outputDisplay.style.fontSize = '32px';
        outputDisplay.style.textAlign = 'center';
        outputDisplay.style.display = 'flex';
        outputDisplay.style.alignItems = 'center';
        outputDisplay.style.justifyContent = 'center';
        outputDisplay.style.border = '2px solid #ddd';
        outputDisplay.style.borderRadius = '6px';
        outputDisplay.style.fontWeight = 'bold';
        outputDisplay.style.color = '#666';
        outputDisplay.textContent = '?';

        inputRow.appendChild(inputX);
        inputRow.appendChild(inputY);
        inputRow.appendChild(arrow);
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
        rightSide.style.width = '500px';
        rightSide.style.position = 'relative';
        rightSide.style.marginLeft = '100px';

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
            this.addHistoryRow(test.x, test.y, test.result);
        });

        // Event listeners
        testBtn.addEventListener('click', () => this.testInput());
        submitBtn.addEventListener('click', () => this.startUnitTests());

        // Enter key on inputs
        [inputX, inputY].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.testInput();
            });
        });

        inputX.focus();
    }

    createNumberInput(id) {
        const input = document.createElement('input');
        input.type = 'number';
        input.id = id;
        input.className = 'number-input';
        input.step = '1';
        input.style.width = '100px';
        input.style.height = '60px';
        this.sanitizeNumberInput(input);
        return input;
    }

    testInput() {
        const inputX = document.getElementById('input-x');
        const inputY = document.getElementById('input-y');
        const x = parseInt(inputX.value, 10);
        const y = parseInt(inputY.value, 10);

        if (isNaN(x) || isNaN(y)) {
            return;
        }

        const result = this.currentRound.check(x, y);

        // Disable inputs during display period
        inputX.disabled = true;
        inputY.disabled = true;
        inputX.style.opacity = '0.6';
        inputY.style.opacity = '0.6';

        // Show result in output display
        const outputDisplay = document.getElementById('output-display');
        outputDisplay.textContent = result;
        outputDisplay.style.backgroundColor = '#e3f2fd';
        outputDisplay.style.borderColor = '#2196F3';
        outputDisplay.style.color = '#1565c0';

        // Add to history
        this.addHistoryRow(x, y, result);
        this.tests.push({ x, y, result });

        // Clear input and reset after brief delay
        setTimeout(() => {
            inputX.value = '';
            inputY.value = '';
            inputX.disabled = false;
            inputY.disabled = false;
            inputX.style.opacity = '1';
            inputY.style.opacity = '1';
            outputDisplay.textContent = '?';
            outputDisplay.style.backgroundColor = '';
            outputDisplay.style.borderColor = '#ddd';
            outputDisplay.style.color = '#666';
            inputX.focus();
        }, 800);

        this.clearFeedback();
    }

    addHistoryRow(x, y, result) {
        const historyDiv = document.getElementById('function-history');
        const historyRow = document.createElement('div');
        historyRow.style.display = 'flex';
        historyRow.style.gap = '15px';
        historyRow.style.alignItems = 'center';
        historyRow.style.marginBottom = '8px';
        historyRow.style.fontSize = '20px';

        const xBox = document.createElement('div');
        xBox.style.width = '80px';
        xBox.style.height = '45px';
        xBox.style.fontSize = '20px';
        xBox.style.textAlign = 'center';
        xBox.style.display = 'flex';
        xBox.style.alignItems = 'center';
        xBox.style.justifyContent = 'center';
        xBox.style.border = '2px solid #ddd';
        xBox.style.borderRadius = '6px';
        xBox.style.fontWeight = 'bold';
        xBox.textContent = x;

        const yBox = xBox.cloneNode(true);
        yBox.textContent = y;

        const arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.style.color = '#999';
        arrow.style.fontWeight = 'bold';

        const resultBox = xBox.cloneNode(true);
        resultBox.textContent = result;

        historyRow.appendChild(xBox);
        historyRow.appendChild(yBox);
        historyRow.appendChild(arrow);
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

        // Shuffle and pick 6 random test cases
        const shuffled = [...allTestInputs];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const testPairs = shuffled.slice(0, 6);

        for (const [x, y] of testPairs) {
            const expected = rule.check(x, y);
            tests.push({ x, y, expected });
        }

        return tests;
    }

    generateTestInputs() {
        // Fallback: Generate diverse test inputs
        const pairs = [];
        const nums = [-5, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 20, 24];

        // Generate pairs
        for (let i = 0; i < 20; i++) {
            const x = nums[Math.floor(Math.random() * nums.length)];
            const y = nums[Math.floor(Math.random() * nums.length)];
            pairs.push([x, y]);
        }

        return pairs;
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
        mainLayout.style.maxWidth = '1000px';
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
        leftSide.style.minWidth = '400px';

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
        inputRow.style.gap = '15px';
        inputRow.style.alignItems = 'center';
        inputRow.style.fontSize = '32px';

        // Fixed input displays (not editable)
        const xDisplay = document.createElement('div');
        xDisplay.style.width = '100px';
        xDisplay.style.height = '60px';
        xDisplay.style.fontSize = '32px';
        xDisplay.style.textAlign = 'center';
        xDisplay.style.display = 'flex';
        xDisplay.style.alignItems = 'center';
        xDisplay.style.justifyContent = 'center';
        xDisplay.style.border = '2px solid #ddd';
        xDisplay.style.borderRadius = '6px';
        xDisplay.style.fontWeight = 'bold';
        xDisplay.style.backgroundColor = '#f9f9f9';
        xDisplay.style.color = '#333';
        xDisplay.textContent = test.x;

        const yDisplay = xDisplay.cloneNode(true);
        yDisplay.textContent = test.y;

        const arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.style.color = '#999';
        arrow.style.fontWeight = 'bold';

        // Output prediction input
        const predictionInput = document.createElement('input');
        predictionInput.type = 'number';
        predictionInput.id = 'unit-test-prediction';
        predictionInput.style.width = '120px';
        predictionInput.style.height = '60px';
        predictionInput.style.fontSize = '32px';
        predictionInput.style.textAlign = 'center';
        predictionInput.style.border = '2px solid #2196F3';
        predictionInput.style.borderRadius = '6px';
        predictionInput.style.fontWeight = 'bold';
        this.sanitizeNumberInput(predictionInput);

        inputRow.appendChild(xDisplay);
        inputRow.appendChild(yDisplay);
        inputRow.appendChild(arrow);
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
        this.unitTestHistory.forEach(({ x, y, prediction, correct }) => {
            const historyRow = document.createElement('div');
            historyRow.style.display = 'flex';
            historyRow.style.gap = '8px';
            historyRow.style.alignItems = 'center';
            historyRow.style.marginBottom = '8px';

            const xBox = document.createElement('div');
            xBox.style.width = '80px';
            xBox.style.height = '45px';
            xBox.style.fontSize = '20px';
            xBox.style.textAlign = 'center';
            xBox.style.display = 'flex';
            xBox.style.alignItems = 'center';
            xBox.style.justifyContent = 'center';
            xBox.style.border = '2px solid #ddd';
            xBox.style.borderRadius = '6px';
            xBox.style.fontWeight = 'bold';
            xBox.style.backgroundColor = '#f9f9f9';
            xBox.textContent = x;

            const yBox = xBox.cloneNode(true);
            yBox.textContent = y;

            const arrowSpan = document.createElement('span');
            arrowSpan.textContent = '→';
            arrowSpan.style.color = '#999';
            arrowSpan.style.fontWeight = 'bold';

            const resultBox = xBox.cloneNode(true);
            resultBox.textContent = prediction;
            resultBox.style.backgroundColor = correct ? '#e8f5e9' : '#ffebee';
            resultBox.style.borderColor = correct ? '#4caf50' : '#f44336';

            historyRow.appendChild(xBox);
            historyRow.appendChild(yBox);
            historyRow.appendChild(arrowSpan);
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
        rightSide.style.width = '500px';
        rightSide.style.marginLeft = '100px';

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
            x: test.x,
            y: test.y,
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
