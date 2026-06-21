/**
 * Three Numbers Game
 * Test triples of numbers against a rule, then prove understanding via unit tests
 */

import { BaseGame } from '../core/base-game.js';
import { ThreeNumberDistributions, sampleFromDistribution } from './three-numbers-distributions.js';

export class ThreeNumbersGame extends BaseGame {
    constructor(appManager, currentRound) {
        super(appManager, 'threeNumbers', currentRound);
        this.tests = [];
        this.unitTests = null;
        this.unitTestIndex = 0;
        this.unitTestResults = [];
    }

    render() {
        const { exampleDisplay, controlsDiv } = this.getDisplayElements();

        // Show initial positive example from the rule
        const { positiveExample } = this.currentRound;
        if (positiveExample) {
            const [a, b, c] = positiveExample;
            this.tests.push({ a, b, c, result: true });
        }

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
        mainLayout.style.paddingTop = '120px'; // Space for absolutely positioned controls

        // Left side: inputs and history
        const leftSide = document.createElement('div');
        leftSide.style.display = 'flex';
        leftSide.style.flexDirection = 'column';
        leftSide.style.alignItems = 'flex-start';
        leftSide.style.flex = '0 0 auto';
        leftSide.style.minWidth = '320px';

        // Create wrapper with relative positioning
        const inputWrapper = document.createElement('div');
        inputWrapper.style.position = 'relative';
        inputWrapper.style.marginBottom = '20px';

        // Create input row container (just the three number inputs)
        const inputRow = document.createElement('div');
        inputRow.style.display = 'flex';
        inputRow.style.gap = '20px';
        inputRow.style.alignItems = 'center';

        const input1 = this.createNumberInput('num1');
        const input2 = this.createNumberInput('num2');
        const input3 = this.createNumberInput('num3');

        inputRow.appendChild(input1);
        inputRow.appendChild(input2);
        inputRow.appendChild(input3);

        // Create button with absolute positioning
        const testBtn = document.createElement('button');
        testBtn.className = 'btn btn-primary';
        testBtn.id = 'btn-test-triple';
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
        historyDiv.id = 'triple-history';
        historyDiv.style.display = 'flex';
        historyDiv.style.flexDirection = 'column-reverse';
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
        submitBtn.id = 'btn-know-triple-rule';
        submitBtn.textContent = 'I know the rule';
        submitBtn.style.alignSelf = 'flex-end';

        rightSide.appendChild(ruleInput);
        rightSide.appendChild(submitBtn);

        mainLayout.appendChild(leftSide);
        mainLayout.appendChild(rightSide);

        exampleDisplay.innerHTML = '';
        exampleDisplay.style.position = 'relative'; // Enable absolute positioning for controls
        exampleDisplay.appendChild(mainLayout);
        controlsDiv.innerHTML = '';

        // Render initial positive example in history
        if (positiveExample) {
            const [a, b, c] = positiveExample;
            this.addHistoryRow(a, b, c, true);
        }

        // Event listeners
        testBtn.addEventListener('click', () => this.testTriple());
        submitBtn.addEventListener('click', () => this.startUnitTests());

        // Enter key on any input
        [input1, input2, input3].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.testTriple();
            });
        });

        input1.focus();
    }

    createNumberInput(id) {
        const input = document.createElement('input');
        input.type = 'number';
        input.id = id;
        input.className = 'number-input';
        input.min = '0';
        input.max = '999';
        input.step = '1';
        this.sanitizeNumberInput(input);
        return input;
    }

    testTriple() {
        const a = parseInt(document.getElementById('num1').value, 10);
        const b = parseInt(document.getElementById('num2').value, 10);
        const c = parseInt(document.getElementById('num3').value, 10);

        if (isNaN(a) || isNaN(b) || isNaN(c)) {
            return;
        }

        const result = this.currentRound.check(a, b, c);

        // Add visual history row
        this.addHistoryRow(a, b, c, result);
        this.tests.push({ a, b, c, result });

        // Clear inputs
        document.getElementById('num1').value = '';
        document.getElementById('num2').value = '';
        document.getElementById('num3').value = '';
        document.getElementById('num1').focus();

        this.clearFeedback();
    }

    addHistoryRow(a, b, c, result) {
        const historyDiv = document.getElementById('triple-history');
        const historyRow = document.createElement('div');
        historyRow.style.display = 'flex';
        historyRow.style.gap = '20px';
        historyRow.style.alignItems = 'center';
        historyRow.style.justifyContent = 'center';
        historyRow.style.marginBottom = '8px';

        [a, b, c].forEach(num => {
            const numBox = document.createElement('div');
            numBox.style.width = '150px';
            numBox.style.height = '60px';
            numBox.style.fontSize = '32px';
            numBox.style.textAlign = 'center';
            numBox.style.display = 'flex';
            numBox.style.alignItems = 'center';
            numBox.style.justifyContent = 'center';
            numBox.style.border = '2px solid #ddd';
            numBox.style.borderRadius = '6px';
            numBox.style.fontWeight = 'bold';

            if (result) {
                numBox.style.backgroundColor = '#c8e6c9';
                numBox.style.borderColor = '#c8e6c9';
                numBox.style.color = '#2e7d32';
            } else {
                numBox.style.backgroundColor = '#ffcdd2';
                numBox.style.borderColor = '#ffcdd2';
                numBox.style.color = '#c62828';
            }

            numBox.textContent = num;
            historyRow.appendChild(numBox);
        });

        historyDiv.appendChild(historyRow);
    }

    startUnitTests() {
        this.unitTests = this.generateUnitTests();
        this.unitTestIndex = 0;
        this.unitTestResults = [];
        this.showNextUnitTest();
    }

    generateUnitTests() {
        const rule = this.currentRound;
        const positiveTests = [];
        const negativeTests = [];

        // Generate positive examples (5 tests)
        let attempts = 0;
        const maxAttempts = 100;

        while (positiveTests.length < 5 && attempts < maxAttempts) {
            attempts++;
            const [a, b, c] = this.generateTripleForRule(true);

            // Validate it actually satisfies the rule
            if (!rule.check(a, b, c)) {
                continue;
            }

            // Check for duplicates
            const exists = positiveTests.some(t => t.a === a && t.b === b && t.c === c);
            if (!exists) {
                positiveTests.push({ a, b, c, expected: true });
            }
        }

        // Generate negative examples (5 tests)
        attempts = 0;
        while (negativeTests.length < 5 && attempts < maxAttempts) {
            attempts++;
            const [a, b, c] = this.generateTripleForRule(false);

            // Validate it does NOT satisfy the rule
            if (rule.check(a, b, c)) {
                continue;
            }

            // Check for duplicates
            const exists = negativeTests.some(t => t.a === a && t.b === b && t.c === c);
            if (!exists) {
                negativeTests.push({ a, b, c, expected: false });
            }
        }

        // Shuffle positive and negative together
        const shuffled = [...positiveTests, ...negativeTests].sort(() => Math.random() - 0.5);
        return shuffled;
    }

    generateTripleForRule(shouldSatisfy) {
        // NEW: Three-category sampling system
        // For negative examples: 25% baseline, 75% round-specific
        // For positive examples: use rule's positive distribution

        if (shouldSatisfy) {
            // Positive examples: use rule's positive distribution
            return this.generatePositive();
        } else {
            // Negative examples: mix of baseline (25%) and round-specific (75%)
            const useBaseline = Math.random() < 0.25;

            if (useBaseline) {
                return this.generateBaseline();
            } else {
                return this.generateRoundSpecific();
            }
        }
    }

    /**
     * Generate positive example from rule's distribution
     */
    generatePositive() {
        const rule = this.currentRound;

        if (!rule.distribution || !rule.distribution.positive) {
            return this.generateTripleFallback(true);
        }

        const distributionSpec = rule.distribution.positive;
        const distributions = distributionSpec.map(spec => ({
            weight: spec.weight,
            generator: () => this.callGenerator(spec)
        }));

        return sampleFromDistribution(distributions);
    }

    /**
     * Generate from baseline distribution (rule-agnostic)
     */
    generateBaseline() {
        const { BASELINE_DISTRIBUTION } = ThreeNumberDistributions;

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

        if (!rule.distribution || !rule.distribution.negative) {
            return this.generateTripleFallback(false);
        }

        const distributionSpec = rule.distribution.negative;
        const distributions = distributionSpec.map(spec => ({
            weight: spec.weight,
            generator: () => this.callGenerator(spec)
        }));

        return sampleFromDistribution(distributions);
    }

    /**
     * Helper to call generator with proper arguments
     */
    callGenerator(spec) {
        const generatorFn = ThreeNumberDistributions[spec.type];
        if (!generatorFn) {
            return ThreeNumberDistributions.uniformRandom(20);
        }

        // All new generators accept (options) parameter
        // But maintain backward compatibility for old signatures
        if (spec.options) {
            // Handle old API where some functions took single number parameter
            if (spec.type === 'uniformRandom' && typeof spec.options.maxElement === 'number' && Object.keys(spec.options).length === 1) {
                return generatorFn(spec.options.maxElement);
            } else if (spec.type === 'constantSequence' && typeof spec.options.maxElement === 'number' && Object.keys(spec.options).length === 1) {
                return generatorFn(spec.options.maxElement);
            } else if (spec.type === 'linearMultiples' && typeof spec.options.maxElement === 'number' && Object.keys(spec.options).length === 1) {
                return generatorFn(spec.options.maxElement);
            } else if (spec.type === 'exponentialMultiples' && typeof spec.options.maxElement === 'number' && Object.keys(spec.options).length === 1) {
                return generatorFn(spec.options.maxElement);
            } else {
                // All other generators accept (options) object
                return generatorFn(spec.options);
            }
        } else {
            // No options provided, use defaults
            return generatorFn();
        }
    }

    generateTripleFallback(shouldSatisfy) {
        // Fallback generation with retry logic
        const rule = this.currentRound;
        let a, b, c, satisfiesRule;
        const maxAttempts = 100;
        let attempt = 0;

        do {
            a = 1 + Math.floor(Math.random() * 20);
            b = 1 + Math.floor(Math.random() * 20);
            c = 1 + Math.floor(Math.random() * 20);
            satisfiesRule = rule.check(a, b, c);
            attempt++;
        } while (satisfiesRule !== shouldSatisfy && attempt < maxAttempts);

        return [a, b, c];
    }

    showNextUnitTest() {
        if (this.unitTestIndex >= this.unitTests.length) {
            this.finishUnitTests();
            return;
        }

        const test = this.unitTests[this.unitTestIndex];

        // Update UI to show the test triple
        document.getElementById('num1').value = test.a;
        document.getElementById('num2').value = test.b;
        document.getElementById('num3').value = test.c;
        document.getElementById('num1').disabled = true;
        document.getElementById('num2').disabled = true;
        document.getElementById('num3').disabled = true;

        // Hide Testaa button and rule input area
        document.getElementById('btn-test-triple').style.display = 'none';
        document.getElementById('rule-answer-input').disabled = true;
        document.getElementById('btn-know-triple-rule').disabled = true;

        // Show unit test controls
        const { exampleDisplay } = this.getDisplayElements();
        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'unit-test-controls';
        controlsContainer.style.position = 'absolute';
        controlsContainer.style.top = '0';
        controlsContainer.style.left = '50%';
        controlsContainer.style.transform = 'translateX(-50%)';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.flexDirection = 'column';
        controlsContainer.style.alignItems = 'center';
        controlsContainer.style.gap = '15px';
        controlsContainer.style.marginBottom = '30px';
        controlsContainer.style.zIndex = '10';

        const progressText = document.createElement('div');
        progressText.style.fontSize = '20px';
        progressText.style.fontWeight = '500';
        progressText.style.color = '#333';
        progressText.textContent = `Test ${this.unitTestIndex + 1}/10`;

        const buttonRow = document.createElement('div');
        buttonRow.style.display = 'flex';
        buttonRow.style.gap = '20px';

        const yesBtn = document.createElement('button');
        yesBtn.className = 'btn btn-yes';
        yesBtn.textContent = 'Yes';
        yesBtn.style.width = '150px';
        yesBtn.style.height = '60px';
        yesBtn.style.fontSize = '20px';
        yesBtn.addEventListener('click', () => this.answerUnitTest(true));

        const noBtn = document.createElement('button');
        noBtn.className = 'btn btn-no';
        noBtn.textContent = 'No';
        noBtn.style.width = '150px';
        noBtn.style.height = '60px';
        noBtn.style.fontSize = '20px';
        noBtn.addEventListener('click', () => this.answerUnitTest(false));

        buttonRow.appendChild(yesBtn);
        buttonRow.appendChild(noBtn);

        controlsContainer.appendChild(progressText);
        controlsContainer.appendChild(buttonRow);

        // Insert as absolutely positioned element in exampleDisplay
        const existing = document.getElementById('unit-test-controls');

        if (existing) {
            existing.replaceWith(controlsContainer);
        } else {
            exampleDisplay.appendChild(controlsContainer);
        }

        this.clearFeedback();
    }

    answerUnitTest(userAnswer) {
        const test = this.unitTests[this.unitTestIndex];
        const correct = userAnswer === test.expected;

        this.unitTestResults.push({
            test: test,
            userAnswer: userAnswer,
            correct: correct
        });

        // Add to history
        this.addHistoryRow(test.a, test.b, test.c, test.expected);

        if (!correct) {
            this.finishUnitTests();
            return;
        }

        this.unitTestIndex++;
        this.showNextUnitTest();
    }

    finishUnitTests() {
        const allCorrect = this.unitTestResults.every(r => r.correct);
        const numCorrect = this.unitTestResults.filter(r => r.correct).length;

        const controls = document.getElementById('unit-test-controls');
        if (controls) controls.remove();

        // Re-enable inputs
        document.getElementById('num1').disabled = false;
        document.getElementById('num2').disabled = false;
        document.getElementById('num3').disabled = false;
        document.getElementById('num1').value = '';
        document.getElementById('num2').value = '';
        document.getElementById('num3').value = '';

        document.getElementById('btn-test-triple').style.display = 'block';
        document.getElementById('rule-answer-input').disabled = false;
        document.getElementById('btn-know-triple-rule').disabled = false;

        if (allCorrect) {
            this.completeRound({ showSuccessScreen: true });
        } else {
            // Just silently reset, no feedback message
            document.getElementById('rule-answer-input').value = '';
            document.getElementById('num1').focus();
        }
    }
}
