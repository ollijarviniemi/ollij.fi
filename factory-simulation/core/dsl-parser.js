/**
 * DSL Parser for Probabilistic Prediction Language
 *
 * Parses a Python-like syntax into an AST for the probabilistic interpreter.
 *
 * Supported syntax:
 *   - Assignment: X = expr
 *   - Tuple assignment: B, C = split(A, p)
 *   - Augmented assignment: X += expr, X -= expr, X *= expr
 *   - For loops: for i in range(n):
 *   - Return: return expr
 *   - Expressions: literals, variables, binary ops, function calls
 *   - Comments: # ...
 */

class DSLTokenizer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.tokens = [];
    this.indentStack = [0];
  }

  tokenize() {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      // Handle newline and indentation
      if (ch === '\n') {
        this.tokens.push({ type: 'NEWLINE', line: this.line, col: this.col });
        this.advance();
        this.handleIndentation();
        continue;
      }

      // Skip inline whitespace
      if (ch === ' ' || ch === '\t') {
        this.advance();
        continue;
      }

      // Number
      if (this.isDigit(ch) || (ch === '.' && this.isDigit(this.peek(1)))) {
        this.readNumber();
        continue;
      }

      // Identifier or keyword
      if (this.isAlpha(ch) || ch === '_') {
        this.readIdentifier();
        continue;
      }

      // String
      if (ch === '"' || ch === "'") {
        this.readString(ch);
        continue;
      }

      // Operators and punctuation
      if (this.readOperator()) continue;

      throw this.error(`Unexpected character: ${ch}`);
    }

    // Handle final dedents
    while (this.indentStack.length > 1) {
      this.tokens.push({ type: 'DEDENT', line: this.line, col: this.col });
      this.indentStack.pop();
    }

    this.tokens.push({ type: 'EOF', line: this.line, col: this.col });
    return this.tokens;
  }

  skipWhitespaceAndComments() {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];

      // Skip inline spaces (but not newlines)
      if (ch === ' ' || ch === '\t') {
        this.advance();
        continue;
      }

      // Skip comments
      if (ch === '#') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          this.advance();
        }
        continue;
      }

      break;
    }
  }

  handleIndentation() {
    // Count leading spaces at start of line
    let indent = 0;
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === ' ') {
        indent++;
        this.advance();
      } else if (ch === '\t') {
        indent += 4;  // Treat tab as 4 spaces
        this.advance();
      } else if (ch === '\n') {
        // Blank line, emit NEWLINE and continue
        this.tokens.push({ type: 'NEWLINE', line: this.line, col: this.col });
        this.advance();
        indent = 0;
      } else if (ch === '#') {
        // Comment line, skip to end
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          this.advance();
        }
        if (this.pos < this.source.length) {
          this.advance();  // Skip the newline
        }
        indent = 0;
      } else {
        break;
      }
    }

    if (this.pos >= this.source.length) return;

    const currentIndent = this.indentStack[this.indentStack.length - 1];

    if (indent > currentIndent) {
      this.indentStack.push(indent);
      this.tokens.push({ type: 'INDENT', line: this.line, col: this.col });
    } else if (indent < currentIndent) {
      while (this.indentStack.length > 1 && indent < this.indentStack[this.indentStack.length - 1]) {
        this.indentStack.pop();
        this.tokens.push({ type: 'DEDENT', line: this.line, col: this.col });
      }
      if (indent !== this.indentStack[this.indentStack.length - 1]) {
        throw this.error('Inconsistent indentation');
      }
    }
  }

  readNumber() {
    const startPos = this.pos;
    const startLine = this.line;
    const startCol = this.col;

    // Integer or float
    while (this.isDigit(this.source[this.pos])) {
      this.advance();
    }

    if (this.source[this.pos] === '.' && this.isDigit(this.peek(1))) {
      this.advance();  // Skip '.'
      while (this.isDigit(this.source[this.pos])) {
        this.advance();
      }
    }

    let value = parseFloat(this.source.slice(startPos, this.pos));

    // Check for percentage suffix (e.g., 70% -> 0.7)
    if (this.source[this.pos] === '%') {
      this.advance();  // Skip '%'
      value = value / 100;
    }

    this.tokens.push({ type: 'NUMBER', value, line: startLine, col: startCol });
  }

  readIdentifier() {
    const startPos = this.pos;
    const startLine = this.line;
    const startCol = this.col;

    while (this.isAlphaNum(this.source[this.pos]) || this.source[this.pos] === '_') {
      this.advance();
    }

    const name = this.source.slice(startPos, this.pos);

    // Check for keywords
    const keywords = ['for', 'in', 'if', 'else', 'elif', 'return', 'and', 'or', 'not',
                      'while', 'break', 'continue', 'def', 'lambda', 'pass'];
    if (keywords.includes(name)) {
      this.tokens.push({ type: name.toUpperCase(), line: startLine, col: startCol });
    } else if (name === 'True') {
      this.tokens.push({ type: 'BOOLEAN', value: true, line: startLine, col: startCol });
    } else if (name === 'False') {
      this.tokens.push({ type: 'BOOLEAN', value: false, line: startLine, col: startCol });
    } else if (name === 'None') {
      this.tokens.push({ type: 'NONE', value: null, line: startLine, col: startCol });
    } else {
      this.tokens.push({ type: 'IDENTIFIER', value: name, line: startLine, col: startCol });
    }
  }

  readString(quote) {
    const startLine = this.line;
    const startCol = this.col;
    this.advance();  // Skip opening quote

    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== quote) {
      if (this.source[this.pos] === '\\') {
        this.advance();
        const escaped = this.source[this.pos];
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          case "'": value += "'"; break;
          default: value += escaped;
        }
      } else {
        value += this.source[this.pos];
      }
      this.advance();
    }

    if (this.pos >= this.source.length) {
      throw this.error('Unterminated string');
    }

    this.advance();  // Skip closing quote
    this.tokens.push({ type: 'STRING', value, line: startLine, col: startCol });
  }

  readOperator() {
    const startLine = this.line;
    const startCol = this.col;

    // Three-character operators (check first)
    const threeChar = this.source.slice(this.pos, this.pos + 3);
    const threeCharOps = ['//=', '**='];
    if (threeCharOps.includes(threeChar)) {
      this.advance();
      this.advance();
      this.advance();
      this.tokens.push({ type: threeChar, line: startLine, col: startCol });
      return true;
    }

    // Two-character operators (check ** and // before single-char * and /)
    const twoChar = this.source.slice(this.pos, this.pos + 2);
    const twoCharOps = ['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%='];
    if (twoCharOps.includes(twoChar)) {
      this.advance();
      this.advance();
      this.tokens.push({ type: twoChar, line: startLine, col: startCol });
      return true;
    }

    // Single-character operators and punctuation
    const singleOps = {
      '+': 'PLUS',
      '-': 'MINUS',
      '*': 'STAR',
      '/': 'SLASH',
      '%': 'PERCENT',
      '=': 'EQUALS',
      '<': 'LT',
      '>': 'GT',
      '(': 'LPAREN',
      ')': 'RPAREN',
      '[': 'LBRACKET',
      ']': 'RBRACKET',
      '{': 'LBRACE',
      '}': 'RBRACE',
      ',': 'COMMA',
      ':': 'COLON',
      '.': 'DOT'
    };

    const ch = this.source[this.pos];
    if (singleOps[ch]) {
      this.advance();
      this.tokens.push({ type: singleOps[ch], line: startLine, col: startCol });
      return true;
    }

    return false;
  }

  advance() {
    if (this.source[this.pos] === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    this.pos++;
  }

  peek(offset = 0) {
    return this.source[this.pos + offset] || '';
  }

  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  isAlphaNum(ch) {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  error(message) {
    const err = new Error(`Line ${this.line}, col ${this.col}: ${message}`);
    err.line = this.line;
    err.col = this.col;
    return err;
  }
}

/**
 * DSL Parser
 *
 * Converts tokens into an AST.
 */
class DSLParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  parse() {
    const statements = [];

    while (!this.isAtEnd()) {
      // Skip newlines at top level
      while (this.check('NEWLINE')) {
        this.advance();
      }

      if (this.isAtEnd()) break;

      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
    }

    return statements;
  }

  parseStatement() {
    // Skip leading newlines
    while (this.check('NEWLINE')) {
      this.advance();
    }

    if (this.isAtEnd()) return null;

    // For loop
    if (this.check('FOR')) {
      return this.parseForLoop();
    }

    // While loop
    if (this.check('WHILE')) {
      return this.parseWhileLoop();
    }

    // If statement
    if (this.check('IF')) {
      return this.parseIfStatement();
    }

    // Break statement
    if (this.check('BREAK')) {
      const line = this.current().line;
      this.advance();
      if (this.check('NEWLINE')) this.advance();
      return { type: 'break', line };
    }

    // Continue statement
    if (this.check('CONTINUE')) {
      const line = this.current().line;
      this.advance();
      if (this.check('NEWLINE')) this.advance();
      return { type: 'continue', line };
    }

    // Pass statement
    if (this.check('PASS')) {
      const line = this.current().line;
      this.advance();
      if (this.check('NEWLINE')) this.advance();
      return { type: 'pass', line };
    }

    // Function definition
    if (this.check('DEF')) {
      return this.parseFunctionDef();
    }

    // Return statement
    if (this.check('RETURN')) {
      return this.parseReturn();
    }

    // Assignment or expression statement
    return this.parseAssignmentOrExpression();
  }

  parseWhileLoop() {
    const line = this.current().line;
    this.expect('WHILE');

    const condition = this.parseExpression();

    this.expect('COLON');
    this.expectNewlineAndIndent();

    const body = this.parseBlock();

    return {
      type: 'whileLoop',
      condition,
      body,
      line
    };
  }

  parseIfStatement() {
    const line = this.current().line;
    this.expect('IF');

    const condition = this.parseExpression();

    this.expect('COLON');
    this.expectNewlineAndIndent();

    const thenBody = this.parseBlock();

    // Check for elif/else
    const branches = [{ condition, body: thenBody }];
    let elseBody = null;

    while (this.check('ELIF')) {
      this.advance();
      const elifCondition = this.parseExpression();
      this.expect('COLON');
      this.expectNewlineAndIndent();
      const elifBody = this.parseBlock();
      branches.push({ condition: elifCondition, body: elifBody });
    }

    if (this.check('ELSE')) {
      this.advance();
      this.expect('COLON');
      this.expectNewlineAndIndent();
      elseBody = this.parseBlock();
    }

    return {
      type: 'ifStatement',
      branches,
      elseBody,
      line
    };
  }

  parseFunctionDef() {
    const line = this.current().line;
    this.expect('DEF');

    const name = this.expect('IDENTIFIER').value;

    this.expect('LPAREN');
    const params = [];
    const defaults = [];

    if (!this.check('RPAREN')) {
      // Parse first parameter
      let param = this.expect('IDENTIFIER').value;
      let defaultVal = null;
      if (this.check('EQUALS')) {
        this.advance();
        defaultVal = this.parseExpression();
      }
      params.push(param);
      defaults.push(defaultVal);

      while (this.check('COMMA')) {
        this.advance();
        if (this.check('RPAREN')) break;  // Trailing comma
        param = this.expect('IDENTIFIER').value;
        defaultVal = null;
        if (this.check('EQUALS')) {
          this.advance();
          defaultVal = this.parseExpression();
        }
        params.push(param);
        defaults.push(defaultVal);
      }
    }

    this.expect('RPAREN');
    this.expect('COLON');
    this.expectNewlineAndIndent();

    const body = this.parseBlock();

    return {
      type: 'functionDef',
      name,
      params,
      defaults,
      body,
      line
    };
  }

  parseForLoop() {
    const line = this.current().line;
    this.expect('FOR');

    const variable = this.expect('IDENTIFIER').value;

    this.expect('IN');

    const range = this.parseExpression();

    this.expect('COLON');
    this.expectNewlineAndIndent();

    const body = this.parseBlock();

    return {
      type: 'forLoop',
      variable,
      range,
      body,
      line
    };
  }

  parseReturn() {
    const line = this.current().line;
    this.expect('RETURN');

    const value = this.parseExpression();

    // Skip trailing newline
    if (this.check('NEWLINE')) {
      this.advance();
    }

    return {
      type: 'return',
      value,
      line
    };
  }

  parseAssignmentOrExpression() {
    const line = this.current().line;

    // Check for tuple assignment: A, B = ...
    if (this.check('IDENTIFIER') && this.checkAhead('COMMA', 1)) {
      return this.parseTupleAssignment();
    }

    // Check for subscript assignment: arr[i] = ... or arr[i] += ...
    if (this.check('IDENTIFIER') && this.checkAhead('LBRACKET', 1)) {
      const arrayName = this.advance().value;
      this.advance();  // consume LBRACKET
      const indexExpr = this.parseExpression();
      this.expect('RBRACKET');

      if (this.check('EQUALS') || this.check('+=') || this.check('-=') || this.check('*=') ||
          this.check('/=') || this.check('//=') || this.check('%=') || this.check('**=')) {
        const op = this.advance().type;
        const value = this.parseExpression();

        if (this.check('NEWLINE')) {
          this.advance();
        }

        if (op === 'EQUALS') {
          return {
            type: 'subscriptAssignment',
            array: arrayName,
            index: indexExpr,
            value,
            line
          };
        } else {
          return {
            type: 'subscriptAugmentedAssignment',
            array: arrayName,
            index: indexExpr,
            operator: op,
            value,
            line
          };
        }
      } else {
        // Not an assignment - backtrack by creating a subscript expression
        // This is tricky... we've already consumed tokens.
        // Actually, let's just throw an error for now - subscripts should be assigned
        throw this.error('Expected assignment after subscript');
      }
    }

    // Check for simple assignment or augmented assignment: X = ... or X += ...
    if (this.check('IDENTIFIER') && (
      this.checkAhead('EQUALS', 1) ||
      this.checkAhead('+=', 1) ||
      this.checkAhead('-=', 1) ||
      this.checkAhead('*=', 1) ||
      this.checkAhead('/=', 1) ||
      this.checkAhead('//=', 1) ||
      this.checkAhead('%=', 1) ||
      this.checkAhead('**=', 1)
    )) {
      const target = this.advance().value;
      const op = this.advance().type;

      const value = this.parseExpression();

      // Skip trailing newline
      if (this.check('NEWLINE')) {
        this.advance();
      }

      if (op === 'EQUALS') {
        return {
          type: 'assignment',
          target,
          value,
          line
        };
      } else {
        return {
          type: 'augmentedAssignment',
          target,
          operator: op,
          value,
          line
        };
      }
    }

    // Expression statement
    const expr = this.parseExpression();

    // Skip trailing newline
    if (this.check('NEWLINE')) {
      this.advance();
    }

    return {
      type: 'expression',
      expression: expr,
      line
    };
  }

  parseTupleAssignment() {
    const line = this.current().line;
    const targets = [];

    // Parse comma-separated identifiers
    targets.push(this.expect('IDENTIFIER').value);
    while (this.check('COMMA')) {
      this.advance();
      targets.push(this.expect('IDENTIFIER').value);
    }

    this.expect('EQUALS');

    // Parse the right-hand side as a tuple of expressions (comma-separated)
    const values = [];
    values.push(this.parseOr());  // Use parseOr to avoid ternary issues
    while (this.check('COMMA')) {
      this.advance();
      values.push(this.parseOr());
    }

    // Skip trailing newline
    if (this.check('NEWLINE')) {
      this.advance();
    }

    return {
      type: 'tupleAssignment',
      targets,
      values,  // Now an array of values
      line
    };
  }

  parseBlock() {
    const statements = [];

    this.expect('INDENT');

    while (!this.check('DEDENT') && !this.isAtEnd()) {
      // Skip newlines within block
      while (this.check('NEWLINE')) {
        this.advance();
      }

      if (this.check('DEDENT') || this.isAtEnd()) break;

      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
    }

    if (this.check('DEDENT')) {
      this.advance();
    }

    return statements;
  }

  parseExpression() {
    return this.parseTernary();
  }

  // Ternary: value if condition else other_value
  // Has lowest precedence among expressions
  parseTernary() {
    let value = this.parseOr();

    // Check for ternary: value if condition else other
    if (this.check('IF')) {
      this.advance();
      const condition = this.parseOr();  // Parse condition (not full expression to avoid recursion)
      this.expect('ELSE');
      const elseValue = this.parseTernary();  // Right-associative
      return {
        type: 'ternary',
        condition,
        thenValue: value,
        elseValue
      };
    }

    return value;
  }

  parseOr() {
    let left = this.parseAnd();

    while (this.check('OR')) {
      this.advance();
      const right = this.parseAnd();
      left = {
        type: 'binOp',
        op: 'or',
        left,
        right
      };
    }

    return left;
  }

  parseAnd() {
    let left = this.parseNot();

    while (this.check('AND')) {
      this.advance();
      const right = this.parseNot();
      left = {
        type: 'binOp',
        op: 'and',
        left,
        right
      };
    }

    return left;
  }

  parseNot() {
    if (this.check('NOT')) {
      this.advance();
      const operand = this.parseNot();
      return {
        type: 'unaryOp',
        op: '!',
        operand
      };
    }

    return this.parseComparison();
  }

  parseComparison() {
    let first = this.parseAdditive();

    const compOps = ['==', '!=', 'LT', 'GT', '<=', '>=', 'IN'];

    // Check if there's a comparison operator
    if (!compOps.some(op => this.check(op)) && !(this.check('NOT') && this.checkAhead('IN', 1))) {
      return first;
    }

    // Collect all operands and operators for potential chaining
    const operands = [first];
    const operators = [];

    while (compOps.some(op => this.check(op)) || (this.check('NOT') && this.checkAhead('IN', 1))) {
      // Handle 'not in' as a special case
      if (this.check('NOT')) {
        this.advance();  // consume NOT
        this.expect('IN');
        operators.push('not in');
        operands.push(this.parseAdditive());
        continue;
      }

      const opToken = this.advance();
      let op = opToken.type;
      // Normalize operator names
      if (op === 'LT') op = '<';
      if (op === 'GT') op = '>';
      if (op === 'IN') op = 'in';

      operators.push(op);
      operands.push(this.parseAdditive());
    }

    // If only one comparison, return simple binOp
    if (operators.length === 1) {
      return {
        type: 'binOp',
        op: operators[0],
        left: operands[0],
        right: operands[1]
      };
    }

    // Multiple comparisons: create a comparison chain
    // 0 < x < 10 means (0 < x) and (x < 10)
    return {
      type: 'comparisonChain',
      operands,
      operators
    };
  }

  parseAdditive() {
    let left = this.parseMultiplicative();

    while (this.check('PLUS') || this.check('MINUS')) {
      const op = this.advance().type === 'PLUS' ? '+' : '-';
      const right = this.parseMultiplicative();
      left = {
        type: 'binOp',
        op,
        left,
        right
      };
    }

    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();

    while (this.check('STAR') || this.check('SLASH') || this.check('//') || this.check('PERCENT')) {
      const token = this.advance();
      let op;
      switch (token.type) {
        case 'STAR': op = '*'; break;
        case 'SLASH': op = '/'; break;
        case '//': op = '//'; break;
        case 'PERCENT': op = '%'; break;
      }
      const right = this.parseUnary();
      left = {
        type: 'binOp',
        op,
        left,
        right
      };
    }

    return left;
  }

  parseUnary() {
    if (this.check('MINUS')) {
      this.advance();
      const operand = this.parseUnary();
      return {
        type: 'unaryOp',
        op: '-',
        operand
      };
    }

    return this.parseExponentiation();
  }

  // Exponentiation is right-associative: 2**3**2 = 2**(3**2) = 512
  parseExponentiation() {
    let left = this.parsePrimary();

    if (this.check('**')) {
      this.advance();
      // Right-associative: parse the right side with the same precedence
      const right = this.parseUnary();  // Goes back through unary to handle -2**2 correctly
      return {
        type: 'binOp',
        op: '**',
        left,
        right
      };
    }

    return left;
  }

  parsePrimary() {
    // Number literal
    if (this.check('NUMBER')) {
      return {
        type: 'literal',
        value: this.advance().value
      };
    }

    // String literal (may have subscript/slice after it)
    if (this.check('STRING')) {
      let expr = {
        type: 'literal',
        value: this.advance().value
      };
      // Handle postfix operations like "hello"[1:3] or "hello".upper()
      return this.parseTernaryOrPostfix(expr);
    }

    // Boolean literal (True/False)
    if (this.check('BOOLEAN')) {
      return {
        type: 'literal',
        value: this.advance().value
      };
    }

    // None literal
    if (this.check('NONE')) {
      this.advance();
      return {
        type: 'literal',
        value: null
      };
    }

    // Lambda expression: lambda x: expr or lambda x, y: expr
    if (this.check('LAMBDA')) {
      return this.parseLambda();
    }

    // Array literal (may be list comprehension)
    if (this.check('LBRACKET')) {
      return this.parseArrayOrComprehension();
    }

    // Dictionary or set literal
    if (this.check('LBRACE')) {
      const dictOrSet = this.parseDictOrSet();
      return this.parseTernaryOrPostfix(dictOrSet);
    }

    // Identifier or function call
    if (this.check('IDENTIFIER')) {
      const token = this.advance();
      const name = token.value;
      const line = token.line;

      // Function call
      if (this.check('LPAREN')) {
        this.advance();
        const args = this.parseArguments();
        this.expect('RPAREN');

        let expr = {
          type: 'call',
          name,
          args,
          line
        };

        // Handle method chains after function call
        return this.parseTernaryOrPostfix(expr);
      }

      // Variable reference
      let expr = {
        type: 'variable',
        name,
        line
      };

      // Handle method calls, subscripts, and ternary
      return this.parseTernaryOrPostfix(expr);
    }

    // Parenthesized expression or tuple
    if (this.check('LPAREN')) {
      this.advance();
      const expr = this.parseExpression();

      // Check if it's a tuple: (a, b, c)
      if (this.check('COMMA')) {
        const elements = [expr];
        while (this.check('COMMA')) {
          this.advance();
          if (this.check('RPAREN')) break;  // Trailing comma
          elements.push(this.parseExpression());
        }
        this.expect('RPAREN');
        return {
          type: 'tuple',
          elements
        };
      }

      this.expect('RPAREN');
      return this.parseTernaryOrPostfix(expr);
    }

    throw this.error(`Unexpected token: ${this.current().type}`);
  }

  /**
   * Parse lambda expression: lambda x: expr or lambda x, y: expr
   */
  parseLambda() {
    this.expect('LAMBDA');
    const params = [];

    // Parse parameters (before the colon)
    if (!this.check('COLON')) {
      params.push(this.expect('IDENTIFIER').value);
      while (this.check('COMMA')) {
        this.advance();
        params.push(this.expect('IDENTIFIER').value);
      }
    }

    this.expect('COLON');
    const body = this.parseExpression();

    return {
      type: 'lambda',
      params,
      body
    };
  }

  /**
   * Parse ternary expression (x if condition else y) or postfix operations
   * Called after parsing a primary expression to check for ternary
   */
  parseTernaryOrPostfix(expr) {
    // First apply any postfix operations
    expr = this.parsePostfix(expr);

    // Then check for ternary: value if condition else other
    // Note: In Python, ternary is right after the value, so "x + 1 if cond else y"
    // means "(x + 1) if cond else y". But we're parsing at primary level, so
    // this will be handled differently. Actually, ternary in Python binds very loosely,
    // so we should handle it at a higher level (in parseExpression).
    // For now, let's leave it to be handled in parseOr.

    return expr;
  }

  /**
   * Parse array literal or list comprehension
   */
  parseArrayOrComprehension() {
    this.expect('LBRACKET');

    // Empty array
    if (this.check('RBRACKET')) {
      this.advance();
      return {
        type: 'array',
        elements: []
      };
    }

    // Parse first expression
    const firstExpr = this.parseExpression();

    // Check for list comprehension: [expr for x in iterable]
    if (this.check('FOR')) {
      return this.parseListComprehension(firstExpr);
    }

    // Regular array literal
    const elements = [firstExpr];
    while (this.check('COMMA')) {
      this.advance();
      if (this.check('RBRACKET')) break;  // Trailing comma
      elements.push(this.parseExpression());
    }

    this.expect('RBRACKET');

    return {
      type: 'array',
      elements
    };
  }

  /**
   * Parse list comprehension after the first expression
   * [expr for x in iterable] or [expr for x in iterable if condition]
   */
  parseListComprehension(expr) {
    this.expect('FOR');

    // Parse loop variable(s)
    const loopVar = this.expect('IDENTIFIER').value;
    // TODO: support tuple unpacking in loop var

    this.expect('IN');
    // Use parseOr instead of parseExpression to avoid consuming 'if' as ternary
    const iterable = this.parseOr();

    // Optional filter: if condition
    let filter = null;
    if (this.check('IF')) {
      this.advance();
      // Use parseOr for filter condition as well
      filter = this.parseOr();
    }

    this.expect('RBRACKET');

    return {
      type: 'listComprehension',
      expr,
      loopVar,
      iterable,
      filter
    };
  }

  /**
   * Parse postfix operations: method calls (.method()), subscripts ([idx])
   */
  parsePostfix(expr) {
    while (true) {
      // Method call: expr.method(args)
      if (this.check('DOT')) {
        this.advance();
        const methodName = this.expect('IDENTIFIER').value;
        this.expect('LPAREN');
        const args = this.parseArguments();
        this.expect('RPAREN');
        expr = {
          type: 'method_call',
          object: expr,
          method: methodName,
          args
        };
      }
      // Array subscript or slice: expr[index] or expr[start:stop:step]
      else if (this.check('LBRACKET')) {
        this.advance();

        // Check if this is a slice (contains colon)
        // Parse: [start:stop:step] where each part is optional
        let start = null, stop = null, step = null;
        let isSlice = false;

        // Parse start (if not starting with colon)
        if (!this.check('COLON') && !this.check('RBRACKET')) {
          start = this.parseExpression();
        }

        // Check for first colon (makes it a slice)
        if (this.check('COLON')) {
          isSlice = true;
          this.advance();

          // Parse stop (if not followed by colon or rbracket)
          if (!this.check('COLON') && !this.check('RBRACKET')) {
            stop = this.parseExpression();
          }

          // Check for second colon (step)
          if (this.check('COLON')) {
            this.advance();

            // Parse step (if not rbracket)
            if (!this.check('RBRACKET')) {
              step = this.parseExpression();
            }
          }
        }

        this.expect('RBRACKET');

        if (isSlice) {
          expr = {
            type: 'slice',
            object: expr,
            start,
            stop,
            step
          };
        } else {
          expr = {
            type: 'subscript',
            object: expr,
            index: start
          };
        }
      }
      else {
        break;
      }
    }
    return expr;
  }

  parseArray() {
    this.expect('LBRACKET');

    const elements = [];
    if (!this.check('RBRACKET')) {
      elements.push(this.parseExpression());

      while (this.check('COMMA')) {
        this.advance();
        if (this.check('RBRACKET')) break;  // Trailing comma
        elements.push(this.parseExpression());
      }
    }

    this.expect('RBRACKET');

    return {
      type: 'array',
      elements
    };
  }

  parseArguments() {
    const args = [];

    if (!this.check('RPAREN')) {
      args.push(this.parseExpression());

      while (this.check('COMMA')) {
        this.advance();
        if (this.check('RPAREN')) break;  // Trailing comma
        args.push(this.parseExpression());
      }
    }

    return args;
  }

  expectNewlineAndIndent() {
    // Skip newlines
    while (this.check('NEWLINE')) {
      this.advance();
    }
  }

  // ========== Helper Methods ==========

  current() {
    return this.tokens[this.pos] || { type: 'EOF', line: 0, col: 0 };
  }

  check(type) {
    return this.current().type === type;
  }

  checkAhead(type, offset) {
    const token = this.tokens[this.pos + offset];
    return token && token.type === type;
  }

  advance() {
    if (!this.isAtEnd()) {
      this.pos++;
    }
    return this.tokens[this.pos - 1];
  }

  expect(type) {
    if (!this.check(type)) {
      throw this.error(`Expected ${type}, got ${this.current().type}`);
    }
    return this.advance();
  }

  isAtEnd() {
    return this.check('EOF');
  }

  error(message) {
    const token = this.current();
    const err = new Error(`Line ${token.line}: ${message}`);
    err.line = token.line;
    err.col = token.col;
    return err;
  }

  /**
   * Parse dictionary or set literal
   * {} = empty dict
   * {key: value, ...} = dict
   * {value, ...} = set
   */
  parseDictOrSet() {
    this.expect('LBRACE');

    // Empty braces = empty dict
    if (this.check('RBRACE')) {
      this.advance();
      return {
        type: 'dict',
        entries: []
      };
    }

    // Parse first element
    const firstKey = this.parseExpression();

    // Check if it's a dict (has colon) or set (no colon)
    if (this.check('COLON')) {
      // It's a dictionary
      this.advance();
      const firstValue = this.parseExpression();
      const entries = [{ key: firstKey, value: firstValue }];

      while (this.check('COMMA')) {
        this.advance();
        if (this.check('RBRACE')) break;  // Trailing comma

        const key = this.parseExpression();
        this.expect('COLON');
        const value = this.parseExpression();
        entries.push({ key, value });
      }

      this.expect('RBRACE');
      return {
        type: 'dict',
        entries
      };
    } else {
      // It's a set
      const elements = [firstKey];

      while (this.check('COMMA')) {
        this.advance();
        if (this.check('RBRACE')) break;  // Trailing comma
        elements.push(this.parseExpression());
      }

      this.expect('RBRACE');
      return {
        type: 'set',
        elements
      };
    }
  }
}

/**
 * Main parsing function
 */
function parseDSL(source) {
  const tokenizer = new DSLTokenizer(source);
  const tokens = tokenizer.tokenize();

  const parser = new DSLParser(tokens);
  return parser.parse();
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DSLTokenizer, DSLParser, parseDSL };
}
