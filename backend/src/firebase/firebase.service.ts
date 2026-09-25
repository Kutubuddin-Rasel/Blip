import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
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

  async verifyPhoneIdentity(
    idToken: string,
  ): Promise<{ firebaseUid: string; phoneNumber: string }> {
    try {
      const verified = await this.getAuth().verifyIdToken(idToken);
      if (
        !verified.uid ||
        !verified.phone_number ||
        !/^\+[1-9]\d{6,14}$/.test(verified.phone_number)
      ) {
        throw new Error('Missing verified phone identity');
      }
      return { firebaseUid: verified.uid, phoneNumber: verified.phone_number };
    } catch {
      throw new UnauthorizedException('Phone verification failed');
    }
  }
}
