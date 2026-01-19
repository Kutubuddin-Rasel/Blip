import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private isConnected = false;
  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
      this.redis = new Redis({
        host: this.configService.getOrThrow('REDIS_HOST'),
        port: this.configService.getOrThrow('REDIS_PORT'),
        password: this.configService.getOrThrow('REDIS_PASSWORD'),
        db: this.configService.getOrThrow('REDIS_DB'),
      });

      this.redis.on('error', (error) => {
        console.warn('Redis connection error: ', error.message);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
      });

      this.redis.on('ready', () => {
        console.log('Redis ready for operations');
        this.isConnected = true;
      });

      this.redis.on('reconnecting', () => {
        console.log('Redis reconnecting ....');
      });

      this.redis.on('end', () => {
        console.log('Redis connection ended');
        this.isConnected = false;
      });
    } catch (error: unknown) {
      console.warn('Redis error:', error);
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      console.log('Redis disconnected');
    }
  }
}
