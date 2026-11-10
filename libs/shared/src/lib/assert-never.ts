/**
 * Exhaustiveness helper for discriminated unions and literal types.
 * Prefer `switch` + `assertNever` over `if` chains when handling
 * event phases, team progress states, or API error codes.
 */
export function assertNever(value: never, context = 'value'): never {
  throw new Error(`Unexpected ${context}: ${JSON.stringify(value)}`);
}
