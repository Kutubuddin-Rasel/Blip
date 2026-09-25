import { ConfigService } from '@nestjs/config';
import ms, { StringValue } from 'ms';

export function sessionDuration(
  config: ConfigService,
  key: string,
  maximumMs: number,
): { value: StringValue; milliseconds: number } {
  const value = config.getOrThrow<string>(key);
  if (!/^[1-9]\d*(?:s|m|h|d)$/.test(value)) throw new Error(`Invalid ${key}`);
  const milliseconds = ms(value as StringValue);
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 1000 ||
    milliseconds > maximumMs
  ) {
    throw new Error(`Invalid ${key}`);
  }
  return { value: value as StringValue, milliseconds };
}
