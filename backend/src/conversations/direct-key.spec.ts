import { randomUUID } from 'node:crypto';
import { directKey } from './direct-key';

describe('directKey', () => {
  it('is deterministic and symmetric for distinct users', () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    expect(directKey(a, b)).toBe(directKey(b, a));
    expect(directKey(a, b)).toBe(directKey(a, b));
    expect(directKey(a, b)).not.toBe(directKey(a, c));
  });

  it('rejects a self pair', () => {
    const id = randomUUID();
    expect(() => directKey(id, id)).toThrow();
  });
});
