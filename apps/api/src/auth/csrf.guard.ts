import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { AuthService } from './auth.service.js';

function cookieValue(header: string | undefined): string | undefined {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith('devdeploy_session='))?.slice('devdeploy_session='.length);
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    try {
      await this.auth.requireCsrf(cookieValue(request.headers.cookie), request.headers['x-csrf-token']);
      return true;
    } catch {
      return false;
    }
  }
}

export { cookieValue };
