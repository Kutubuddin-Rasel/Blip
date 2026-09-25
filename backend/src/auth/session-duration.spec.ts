import { ConfigService } from '@nestjs/config';
import { sessionDuration } from './session-duration';

describe('session duration configuration', () => {
  const parse = (value: string) =>
    sessionDuration(
      new ConfigService({ ACCESSTOKEN_EXPIRY: value }),
      'ACCESSTOKEN_EXPIRY',
      60 * 60 * 1000,
    );

  it('accepts a finite short access lifetime', () => {
    expect(parse('15m')).toEqual({ value: '15m', milliseconds: 900_000 });
  });

  it.each(['0s', '60', '2h', '999999999999d', '-1m', '15ms'])(
    'rejects unsafe duration %s',
    (value) => {
      expect(() => parse(value)).toThrow('Invalid ACCESSTOKEN_EXPIRY');
    },
  );
});
