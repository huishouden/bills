import { describe, expect, test } from 'bun:test';
import { seesMoney } from './access';

const household = { members: ['a@example.com', 'b@example.com', 'h@example.com', 'k@example.com'], roles: { 'h@example.com': 'helper', 'k@example.com': 'kid' } as const };

describe('who sees the bills', () => {
  test('the creator and members do; helpers, kids and strangers don’t', () => {
    expect(seesMoney(household, 'a@example.com')).toBe(true);
    expect(seesMoney(household, 'B@Example.com')).toBe(true);
    expect(seesMoney(household, 'h@example.com')).toBe(false);
    expect(seesMoney(household, 'k@example.com')).toBe(false);
    expect(seesMoney(household, 'x@example.com')).toBe(false);
  });
});
