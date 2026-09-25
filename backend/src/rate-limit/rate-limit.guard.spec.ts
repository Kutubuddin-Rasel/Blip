import { RATE_POLICIES, RateLimitService } from './rate-limit.guard';

describe('controlled beta rate windows', () => {
  it.each(
    Object.entries(RATE_POLICIES) as Array<
      [keyof typeof RATE_POLICIES, { limit: number; windowMs: number }]
    >,
  )(
    '%s allows its quota, separates identities, and resets after its window',
    (policy, { limit, windowMs }) => {
      const service = new RateLimitService();
      for (let attempt = 0; attempt < limit; attempt++)
        expect(service.consume(policy, 'first', 1000)).toBe(0);
      expect(service.consume(policy, 'first', 1000)).toBe(
        Math.ceil(windowMs / 1000),
      );
      expect(service.consume(policy, 'second', 1000)).toBe(0);
      expect(service.consume(policy, 'first', 1000 + windowMs)).toBe(0);
    },
  );
});
