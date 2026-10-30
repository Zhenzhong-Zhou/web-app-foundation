import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../core/auth/public.decorator';
import { ErrorsService } from './errors.service';
import { readReport } from './report-body';

/**
 * The browser's error reports (ADR-084), posted to the site's /api/errors.
 * Version-neutral, as /health is (ADR-013), so a tab older than the API
 * still reports; public, so a fault before sign-in does too. It keeps
 * X-Requested-With, which the SDK's transport sends, and the rate limit,
 * as every route does.
 */
@Public()
@Controller({ path: 'errors', version: VERSION_NEUTRAL })
export class ErrorsController {
  constructor(private readonly errors: ErrorsService) {}

  /**
   * One report, as the tracker's SDK sends it: read after the guards, so a
   * request they refuse is never read. 204 whether it was relayed or not.
   */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async report(@Req() request: Request): Promise<void> {
    await this.errors.relay(await readReport(request));
  }
}
