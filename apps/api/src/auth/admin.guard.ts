import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { cookieValue } from './csrf.guard.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    if ((await this.auth.authenticatedUser(cookieValue(request.headers.cookie))) === null) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
