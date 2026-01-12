import { AuthUser } from 'src/interfaces/AuthUser.interface';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
