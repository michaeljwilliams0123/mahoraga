const MAX_INPUT_LENGTH = 120;
const MAX_TOKENS = 128;
const MAX_ABSOLUTE_RESULT = 1e15;

export function recognizeSimpleArithmetic(value) {
  if (typeof value !== "string") return null;
  let expression = value.trim();
  if (expression.length === 0 || expression.length > MAX_INPUT_LENGTH) return null;
  expression = expression
    .replace(/^\/?(?:calculate|compute)\s*:?\s*/i, "")
    .replace(/^(?:what\s+is|what's)\s+/i, "")
    .replace(/\?$/, "")
    .trim();
  if (expression.length === 0 || !/^[\d\s.+\-*/()]+$/.test(expression)) return null;
  try {
    return Object.freeze({ expression, answer: formatNumber(evaluate(expression)) });
  } catch {
    return null;
  }
}

export function executeSimpleArithmetic({ requestedOutcome = "" } = {}) {
  const calculation = recognizeSimpleArithmetic(requestedOutcome);
  if (!calculation) throw new Error("simple-arithmetic-invalid");
  return Object.freeze({
    verified: true,
    outcome: "succeeded",
    summary: calculation.answer,
    answer: calculation.answer,
    expression: calculation.expression,
    modelInvocations: 0,
    providerHealth: Object.freeze({ route: "deterministic-simple-answer", costClass: "deterministic" }),
  });
}

function evaluate(expression) {
  const tokens = tokenize(expression);
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const primary = () => {
    if (peek() === "(") {
      take();
      const value = sum();
      if (take() !== ")") throw new Error("parenthesis-mismatch");
      return value;
    }
    const token = take();
    if (typeof token !== "number") throw new Error("number-expected");
    return token;
  };
  const unary = () => peek() === "+" ? (take(), unary()) : peek() === "-" ? (take(), -unary()) : primary();
  const product = () => {
    let value = unary();
    while (peek() === "*" || peek() === "/") {
      const operator = take();
      const right = unary();
      if (operator === "/" && right === 0) throw new Error("division-by-zero");
      value = operator === "*" ? value * right : value / right;
      assertBounded(value);
    }
    return value;
  };
  const sum = () => {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const operator = take();
      const right = product();
      value = operator === "+" ? value + right : value - right;
      assertBounded(value);
    }
    return value;
  };
  const result = sum();
  if (index !== tokens.length) throw new Error("unexpected-token");
  assertBounded(result);
  return result;
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    const rest = expression.slice(index);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) { index += whitespace[0].length; continue; }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(rest);
    if (number) {
      tokens.push(Number(number[0]));
      index += number[0].length;
    } else {
      tokens.push(expression[index++]);
    }
    if (tokens.length > MAX_TOKENS) throw new Error("expression-too-complex");
  }
  return tokens;
}

function assertBounded(value) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_ABSOLUTE_RESULT) throw new Error("result-out-of-range");
}

function formatNumber(value) {
  return Object.is(value, -0) ? "0" : String(value);
}
