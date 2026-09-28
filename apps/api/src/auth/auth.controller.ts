import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';

import { AdminGuard } from './admin.guard.js';
import { AuthService } from './auth.service.js';
import { cookieValue, CsrfGuard } from './csrf.guard.js';

const COOKIE_OPTIONS = 'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800';

type RequestLike = { headers: Record<string, string | undefined> };
type ResponseLike = { setHeader(name: string, value: string): void };

@Controller('/api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('csrf')
  async csrf(@Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike) {
    const issued = await this.auth.issueCsrf(cookieValue(request.headers.cookie));
    response.setHeader('Set-Cookie', `devdeploy_session=${issued.token}; ${COOKIE_OPTIONS}`);
    return { csrfToken: issued.csrfToken };
  }

  @Post('login')
  @UseGuards(CsrfGuard)
  async login(@Req() request: RequestLike, @Body() body: { email?: unknown; password?: unknown }, @Res({ passthrough: true }) response: ResponseLike) {
    const result = await this.auth.login(cookieValue(request.headers.cookie), request.headers['x-csrf-token'], body.email, body.password);
    if (result === 'limited') {
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!result) throw new UnauthorizedException();
    response.setHeader('Set-Cookie', `devdeploy_session=${result.token}; ${COOKIE_OPTIONS}`);
    return { id: result.user.id, email: result.user.email };
  }

  @Get('me')
  async me(@Req() request: RequestLike) {
    const user = await this.auth.authenticatedUser(cookieValue(request.headers.cookie));
    if (!user) throw new UnauthorizedException();
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  async logout(@Req() request: RequestLike) {
    await this.auth.logout(cookieValue(request.headers.cookie), request.headers['x-csrf-token']);
  }
}
