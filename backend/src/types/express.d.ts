import { AuthUser } from 'src/auth/interfaces/AuthUser.interface';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
