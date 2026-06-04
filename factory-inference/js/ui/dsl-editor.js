/**
 * DSL Editor with Syntax Highlighting and Hover Tooltips
 *
 * A simple code editor for the probabilistic DSL that provides:
 * - Live syntax highlighting
 * - Hover tooltips showing variable distributions
 * - Error display
 * - Live evaluation
 */

class DSLEditor {
  /**
   * @param {HTMLElement} container - Container element for the editor
   * @param {Object} options - Configuration options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      debounceMs: 500,
      showLineNumbers: true,
      readOnly: false,
      showResult: true,
      onCopyPrediction: null,  // Callback when user clicks "copy to prediction" button
      copyButtonLabel: 'Kopioi ennustukseksesi',
      onHighlightedVarChange: null,  // Callback when hovered variable changes
      ...options
    };

    this.interpreter = new DSLInterpreter();
    this.lastParsedAST = null;
    this.lastResult = null;
    this.debounceTimer = null;
    this.highlightedVar = null;  // Variable name to highlight on hover
    this.lastTokens = [];  // Cache tokens for hover detection

    this.createDOM();
    this.setupEventListeners();
  }

  /**
   * Create DOM structure for the editor
   */
  createDOM() {
    this.container.innerHTML = '';
    this.container.classList.add('dsl-editor-container');

    // Create editor wrapper (for relative positioning)
    this.editorWrapper = document.createElement('div');
    this.editorWrapper.className = 'dsl-editor-wrapper';

    // Create line numbers gutter
    if (this.options.showLineNumbers) {
      this.lineNumbers = document.createElement('div');
      this.lineNumbers.className = 'dsl-line-numbers';
      this.editorWrapper.appendChild(this.lineNumbers);
    }

    // Create textarea for actual editing
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'dsl-textarea';
    this.textarea.spellcheck = false;
    this.textarea.autocomplete = 'off';
    this.textarea.autocapitalize = 'off';
    if (this.options.readOnly) {
      this.textarea.readOnly = true;
      this.textarea.style.cursor = 'default';
    }

    // Create highlighted overlay (behind textarea)
    this.highlightLayer = document.createElement('pre');
    this.highlightLayer.className = 'dsl-highlight-layer';

    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'dsl-tooltip';
    this.tooltip.style.display = 'none';

    // Create error banner
    this.errorBanner = document.createElement('div');
    this.errorBanner.className = 'dsl-error-banner';
    this.errorBanner.style.display = 'none';

    // Create result display
    this.resultDisplay = document.createElement('div');
    this.resultDisplay.className = 'dsl-result-display';

    // Assemble DOM
    this.editorWrapper.appendChild(this.highlightLayer);
    this.editorWrapper.appendChild(this.textarea);

    this.container.appendChild(this.editorWrapper);
    if (!this.options.readOnly) {
      this.container.appendChild(this.errorBanner);
    }
    if (this.options.showResult) {
      this.container.appendChild(this.resultDisplay);
    }
    this.container.appendChild(this.tooltip);
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Text input (only for editable mode)
    if (!this.options.readOnly) {
      this.textarea.addEventListener('input', () => {
        this.onInput();
      });
    }

    // Scroll sync between textarea and highlight layer
    this.textarea.addEventListener('scroll', () => {
      this.highlightLayer.scrollTop = this.textarea.scrollTop;
      this.highlightLayer.scrollLeft = this.textarea.scrollLeft;
      if (this.lineNumbers) {
        this.lineNumbers.scrollTop = this.textarea.scrollTop;
      }
    });

    // Hover for tooltips
    this.textarea.addEventListener('mousemove', (e) => {
      this.onMouseMove(e);
    });

    this.textarea.addEventListener('mouseleave', () => {
      this.hideTooltip();
      // Clear variable highlighting
      if (this.highlightedVar !== null) {
        this.highlightedVar = null;
        this.updateHighlighting();
        // Notify external listeners
        if (this.options.onHighlightedVarChange) {
          this.options.onHighlightedVarChange(null);
        }
      }
    });

    // Tab and Enter key handling (only for editable mode)
    if (!this.options.readOnly) {
      this.textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && e.shiftKey) {
          // Shift+Tab: Unindent selected lines
          e.preventDefault();
          const start = this.textarea.selectionStart;
          const end = this.textarea.selectionEnd;
          const value = this.textarea.value;

          // Find the start of the first selected line
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          // Find the end of the last selected line
          let lineEnd = value.indexOf('\n', end);
          if (lineEnd === -1) lineEnd = value.length;

          // Get all selected lines
          const selectedText = value.substring(lineStart, lineEnd);
          const lines = selectedText.split('\n');

          // Remove up to 4 leading spaces from each line
          const unindentedLines = lines.map(line => {
            const match = line.match(/^( {1,4}|\t)/);
            if (match) {
              return line.substring(match[0].length);
            }
            return line;
          });

          const newText = unindentedLines.join('\n');
          const removedChars = selectedText.length - newText.length;

          this.textarea.value = value.substring(0, lineStart) + newText + value.substring(lineEnd);

          // Adjust selection
          const newStart = Math.max(lineStart, start - (lines[0].length - unindentedLines[0].length));
          const newEnd = end - removedChars;
          this.textarea.selectionStart = newStart;
          this.textarea.selectionEnd = Math.max(newStart, newEnd);
          this.onInput();
        } else if (e.key === 'Tab' && !e.shiftKey) {
          // Tab: Indent
          e.preventDefault();
          const start = this.textarea.selectionStart;
          const end = this.textarea.selectionEnd;
          const value = this.textarea.value;

          if (start === end) {
            // No selection: insert 4 spaces
            this.textarea.value = value.substring(0, start) + '    ' + value.substring(end);
            this.textarea.selectionStart = this.textarea.selectionEnd = start + 4;
          } else {
            // Selection: indent all selected lines
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            let lineEnd = value.indexOf('\n', end);
            if (lineEnd === -1) lineEnd = value.length;

            const selectedText = value.substring(lineStart, lineEnd);
            const lines = selectedText.split('\n');
            const indentedLines = lines.map(line => '    ' + line);
            const newText = indentedLines.join('\n');

            this.textarea.value = value.substring(0, lineStart) + newText + value.substring(lineEnd);

            // Adjust selection to cover indented text
            this.textarea.selectionStart = start + 4;
            this.textarea.selectionEnd = end + (lines.length * 4);
          }
          this.onInput();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const start = this.textarea.selectionStart;
          const value = this.textarea.value;

          // Find current line
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          const lineEnd = value.indexOf('\n', start);
          const currentLine = value.substring(lineStart, start);

          // Get current indentation
          const indentMatch = currentLine.match(/^(\s*)/);
          let indent = indentMatch ? indentMatch[1] : '';

          // Add extra indent if line ends with colon (after stripping comments)
          const lineWithoutComment = currentLine.replace(/#.*$/, '').trimEnd();
          if (lineWithoutComment.endsWith(':')) {
            indent += '    ';
          }

          // Insert newline + indentation
          const insertion = '\n' + indent;
          this.textarea.value = value.substring(0, start) + insertion + value.substring(start);
          this.textarea.selectionStart = this.textarea.selectionEnd = start + insertion.length;
          this.onInput();
        }
      });
    }
  }

  /**
   * Handle input changes
   */
  onInput() {
    // Update highlighting immediately
    this.updateHighlighting();
    this.updateLineNumbers();

    // Debounce evaluation
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.evaluate();
    }, this.options.debounceMs);
  }

  /**
   * Update syntax highlighting
   */
  updateHighlighting() {
    const code = this.textarea.value;
    const highlighted = this.highlight(code);
    this.highlightLayer.innerHTML = highlighted + '\n';  // Extra newline for scrolling
  }

  /**
   * Update line numbers
   */
  updateLineNumbers() {
    if (!this.lineNumbers) return;

    const lines = this.textarea.value.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
      html += `<div class="line-number">${i}</div>`;
    }
    this.lineNumbers.innerHTML = html;
  }

  /**
   * Syntax highlight the code using token-based approach
   */
  highlight(code) {
    // Tokenize the code first, then render tokens as HTML
    const tokens = this.tokenize(code);
    return this.renderTokens(tokens);
  }

  /**
   * Tokenize code into an array of {type, value} objects
   */
  tokenize(code) {
    const tokens = [];
    const keywords = new Set(['for', 'in', 'if', 'else', 'elif', 'return', 'and', 'or', 'not']);
    const builtins = new Set(['split', 'range', 'max', 'min']);

    let i = 0;
    while (i < code.length) {
      const ch = code[i];

      // Newline
      if (ch === '\n') {
        tokens.push({ type: 'newline', value: '\n' });
        i++;
        continue;
      }

      // Comment
      if (ch === '#') {
        let comment = '';
        while (i < code.length && code[i] !== '\n') {
          comment += code[i];
          i++;
        }
        tokens.push({ type: 'comment', value: comment });
        continue;
      }

      // String
      if (ch === '"' || ch === "'") {
        const quote = ch;
        let str = ch;
        i++;
        while (i < code.length && code[i] !== quote) {
          if (code[i] === '\\' && i + 1 < code.length) {
            str += code[i] + code[i + 1];
            i += 2;
          } else {
            str += code[i];
            i++;
          }
        }
        if (i < code.length) {
          str += code[i];
          i++;
        }
        tokens.push({ type: 'string', value: str });
        continue;
      }

      // Number
      if (/\d/.test(ch)) {
        let num = '';
        while (i < code.length && /[\d.]/.test(code[i])) {
          num += code[i];
          i++;
        }
        // Check for % suffix (percentage syntax, e.g., 70% -> 0.7)
        if (code[i] === '%') {
          num += code[i];
          i++;
        }
        tokens.push({ type: 'number', value: num });
        continue;
      }

      // Identifier or keyword
      if (/[a-zA-Z_]/.test(ch)) {
        let ident = '';
        while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
          ident += code[i];
          i++;
        }
        if (keywords.has(ident)) {
          tokens.push({ type: 'keyword', value: ident });
        } else if (builtins.has(ident)) {
          tokens.push({ type: 'builtin', value: ident });
        } else {
          tokens.push({ type: 'identifier', value: ident });
        }
        continue;
      }

      // Whitespace
      if (/\s/.test(ch)) {
        let ws = '';
        while (i < code.length && /\s/.test(code[i]) && code[i] !== '\n') {
          ws += code[i];
          i++;
        }
        tokens.push({ type: 'whitespace', value: ws });
        continue;
      }

      // Operators and punctuation
      tokens.push({ type: 'punctuation', value: ch });
      i++;
    }

    return tokens;
  }

  /**
   * Render tokens as HTML
   */
  renderTokens(tokens) {
    let html = '';
    for (const token of tokens) {
      const escaped = token.value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Check if this token should be highlighted (variable hover)
      const isHighlighted = this.highlightedVar &&
        token.type === 'identifier' &&
        token.value === this.highlightedVar;
      const highlightStyle = isHighlighted ? 'background:#464646;border-radius:2px;' : '';

      switch (token.type) {
        case 'keyword':
          html += '<b style="color:#569cd6;' + highlightStyle + '">' + escaped + '</b>';
          break;
        case 'builtin':
          html += '<b style="color:#dcdcaa;' + highlightStyle + '">' + escaped + '</b>';
          break;
        case 'number':
          html += '<b style="color:#b5cea8;' + highlightStyle + '">' + escaped + '</b>';
          break;
        case 'string':
          html += '<b style="color:#ce9178;' + highlightStyle + '">' + escaped + '</b>';
          break;
        case 'comment':
          html += '<i style="color:#6a9955;' + highlightStyle + '">' + escaped + '</i>';
          break;
        case 'identifier':
          if (isHighlighted) {
            html += '<b style="' + highlightStyle + '">' + escaped + '</b>';
          } else {
            html += escaped;
          }
          break;
        default:
          html += escaped;
      }
    }
    return html;
  }

  /**
   * Evaluate the code
   */
  evaluate() {
    const code = this.textarea.value.trim();

    if (!code) {
      this.clearError();
      this.clearResult();
      this.lastParsedAST = null;
      this.lastResult = null;
      return null;
    }

    try {
      // Parse
      const ast = parseDSL(code);
      this.lastParsedAST = ast;

      // Evaluate
      const result = this.interpreter.execute(ast);
      this.lastResult = result;

      if (result.errors.length > 0) {
        this.showError(result.errors[0].message, result.errors[0].line);
        return null;
      }

      this.clearError();

      // Show result if there's a return value
      if (result.returnValue) {
        this.showResult(result.returnValue);
      } else {
        this.clearResult();
      }

      return result.returnValue;

    } catch (error) {
      this.showError(error.message, error.line);
      this.lastParsedAST = null;
      this.lastResult = null;
      return null;
    }
  }

  /**
   * Show error message
   */
  showError(message, line = null) {
    this.errorBanner.style.display = 'block';
    const lineInfo = line ? `Rivi ${line}: ` : '';
    this.errorBanner.textContent = `❌ ${lineInfo}${message}`;
  }

  /**
   * Clear error message
   */
  clearError() {
    this.errorBanner.style.display = 'none';
    this.errorBanner.textContent = '';
  }

  /**
   * Format a value for display (handles arrays, objects, etc.)
   */
  formatValue(value) {
    if (Array.isArray(value)) {
      // Format array elements recursively
      const formatted = value.map(v => this.formatValue(v));
      return '[' + formatted.join(', ') + ']';
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    // Handle ProbabilisticValue or other objects - try to extract a meaningful value
    if (value && typeof value === 'object') {
      // Check if it's a ProbabilisticValue (has eval function and isConstant)
      if (typeof value.isConstant === 'function' && value.isConstant()) {
        return this.formatValue(value.getConstantValue());
      }
      // For other objects, try JSON or fall back to a placeholder
      try {
        return JSON.stringify(value);
      } catch (e) {
        return '?';
      }
    }
    return String(value);
  }

  /**
   * Show result distribution
   */
  showResult(distribution) {
    this.resultDisplay.style.display = 'block';
    this.lastDistribution = distribution;  // Store for copy button

    // Render distribution as bar chart
    const entries = distribution.entries();
    const maxProb = Math.max(...entries.map(([_, p]) => p));

    // Check if this is from Monte Carlo simulation
    const sampleCount = distribution._sampleCount;
    const mcNote = sampleCount ? ` <span class="mc-note">(${sampleCount} ajon perusteella)</span>` : '';

    // Format all values and find the longest one to size the value column
    const formattedEntries = entries.map(([value, prob]) => ({
      formatted: this.formatValue(value),
      prob
    }));
    const maxValueLength = Math.max(...formattedEntries.map(e => e.formatted.length));
    // Estimate width: ~7px per character, minimum 40px
    const valueWidth = Math.max(40, Math.min(200, maxValueLength * 7 + 10));

    let html = `<div class="result-title">Returned distribution:${mcNote}</div>`;
    html += '<div class="result-bars">';

    for (const { formatted, prob } of formattedEntries) {
      const widthPercent = (prob / maxProb) * 100;
      const probPercent = (prob * 100).toFixed(1);
      // Show ~ for rounded 0% or 100% that aren't exact
      const approxPrefix = (probPercent === '0.0' && prob > 0) || (probPercent === '100.0' && prob < 1) ? '~' : '';

      html += `
        <div class="result-bar-row">
          <span class="result-value" style="width: ${valueWidth}px">${formatted}</span>
          <div class="result-bar-container">
            <div class="result-bar" style="width: ${widthPercent}%"></div>
          </div>
          <span class="result-prob">${approxPrefix}${probPercent}%</span>
        </div>
      `;
    }

    html += '</div>';

    // Add copy button if callback is set
    if (this.options.onCopyPrediction) {
      html += `<button class="dsl-copy-prediction-btn">${this.options.copyButtonLabel}</button>`;
    }

    this.resultDisplay.innerHTML = html;

    // Attach click handler to the button
    if (this.options.onCopyPrediction) {
      const btn = this.resultDisplay.querySelector('.dsl-copy-prediction-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.lastDistribution) {
            this.options.onCopyPrediction(this.lastDistribution);
          }
        });
      }
    }
  }

  /**
   * Clear result display
   */
  clearResult() {
    this.resultDisplay.style.display = 'none';
    this.resultDisplay.innerHTML = '';
  }

  /**
   * Handle mouse movement for tooltips and variable highlighting
   */
  onMouseMove(e) {
    // Get word at cursor position
    const word = this.getWordAtPosition(e);

    // Update variable highlighting
    const newHighlightedVar = (word && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(word)) ? word : null;
    if (newHighlightedVar !== this.highlightedVar) {
      this.highlightedVar = newHighlightedVar;
      this.updateHighlighting();
      // Notify external listeners
      if (this.options.onHighlightedVarChange) {
        this.options.onHighlightedVarChange(this.highlightedVar);
      }
    }

    // Handle tooltips (only if we have evaluation results)
    if (!this.lastResult) {
      this.hideTooltip();
      return;
    }

    if (word && this.lastResult.variables[word]) {
      const dist = this.interpreter.getVariableDistribution(word);
      if (dist) {
        this.showTooltip(word, dist, e.clientX, e.clientY);
        return;
      }
    }

    this.hideTooltip();
  }

  /**
   * Get word at cursor position in textarea
   */
  getWordAtPosition(event) {
    // This is approximate - get character position from click
    const rect = this.textarea.getBoundingClientRect();
    const style = getComputedStyle(this.textarea);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    const charWidth = parseFloat(style.fontSize) * 0.6;  // Monospace approximation

    const paddingLeft = parseFloat(style.paddingLeft);
    const paddingTop = parseFloat(style.paddingTop);

    const x = event.clientX - rect.left - paddingLeft + this.textarea.scrollLeft;
    const y = event.clientY - rect.top - paddingTop + this.textarea.scrollTop;

    const lineIndex = Math.floor(y / lineHeight);
    const charIndex = Math.floor(x / charWidth);

    const lines = this.textarea.value.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return null;

    const line = lines[lineIndex];
    if (charIndex < 0 || charIndex >= line.length) return null;

    // Extract word at position
    let start = charIndex;
    let end = charIndex;

    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) {
      start--;
    }
    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) {
      end++;
    }

    if (start === end) return null;
    return line.slice(start, end);
  }

  /**
   * Show tooltip with variable distribution
   */
  showTooltip(varName, distribution, x, y) {
    const entries = distribution.entries();

    // Skip tooltips for uninformative values (arrays, objects, dicts, sets)
    // These display as "[object Object]" which is not helpful
    if (entries.length > 0) {
      const firstValue = entries[0][0];
      if (firstValue !== null && typeof firstValue === 'object') {
        // It's an array, dict, set, or other object - not useful to show
        this.hideTooltip();
        return;
      }
    }

    // Check if this is from Monte Carlo simulation
    const sampleCount = distribution._sampleCount;
    const mcNote = sampleCount ? ` <span class="mc-note">(${sampleCount} ajoa)</span>` : '';

    let html = `<div class="tooltip-var">${varName}${mcNote}</div>`;
    html += '<div class="tooltip-bars">';

    const maxProb = Math.max(...entries.map(([_, p]) => p));

    for (const [value, prob] of entries.slice(0, 10)) {  // Limit to 10 entries
      const widthPercent = (prob / maxProb) * 100;
      const probPercent = (prob * 100).toFixed(1);
      // Show ~ for rounded 0% or 100% that aren't exact
      const approxPrefix = (probPercent === '0.0' && prob > 0) || (probPercent === '100.0' && prob < 1) ? '~' : '';

      html += `
        <div class="tooltip-bar-row">
          <span class="tooltip-value">${value}</span>
          <div class="tooltip-bar-container">
            <div class="tooltip-bar" style="width: ${widthPercent}%"></div>
          </div>
          <span class="tooltip-prob">${approxPrefix}${probPercent}%</span>
        </div>
      `;
    }

    if (entries.length > 10) {
      html += `<div class="tooltip-more">... ja ${entries.length - 10} muuta</div>`;
    }

    html += '</div>';

    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = (x + 15) + 'px';
    this.tooltip.style.top = (y + 15) + 'px';

    // Keep tooltip on screen
    const rect = this.tooltip.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.tooltip.style.left = (x - rect.width - 15) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      this.tooltip.style.top = (y - rect.height - 15) + 'px';
    }
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    this.tooltip.style.display = 'none';
  }

  /**
   * Get the current code
   */
  getCode() {
    return this.textarea.value;
  }

  /**
   * Set the code
   */
  setCode(code) {
    this.textarea.value = code;
    this.onInput();
  }

  /**
   * Get the evaluated distribution
   */
  getDistribution() {
    if (!this.lastResult) {
      this.evaluate();
    }
    return this.lastResult?.returnValue || null;
  }

  /**
   * Check if there are any errors
   */
  hasErrors() {
    return this.lastResult?.errors?.length > 0 || this.errorBanner.style.display !== 'none';
  }
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DSLEditor };
}
