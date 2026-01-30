import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.configService.getOrThrow<string>(
            'FIREBASE_PROJECT_ID',
          ),
          clientEmail: this.configService.getOrThrow<string>(
            'FIREBASE_CLIENT_EMAIL',
          ),
          privateKey: this.configService
            .getOrThrow<string>('FIREBASE_PRIVATE_KEY')
            ?.replace(/\\n/g, '\n'),
        }),
      });
    }
  }

  getAuth() {
    return admin.auth();
  }
}
