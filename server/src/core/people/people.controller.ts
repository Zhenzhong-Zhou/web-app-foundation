import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../authorization/permissions';
import { PermissionsService } from '../authorization/permissions.service';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { PhotoSizeDto } from './dto/work-details.dto';
import { PeopleService } from './people.service';

/**
 * The People page and a person's page (ADR-063), for every member: users
 * .view, which every role holds. What the history shows, exact times and
 * recent work, the service gives only to those with audit.view.
 */
@Controller({ path: 'people', version: '1' })
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  async list(@CurrentUser() user: RequestContext) {
    return this.people.list(await this.held(user));
  }

  @Get(':userId')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  async find(
    @CurrentUser() user: RequestContext,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const person = await this.people.find(userId, await this.held(user));
    // Your own page shows no activity: your work is on your Account page.
    if (userId === user.userId) delete person.recentActivity;
    return person;
  }

  /**
   * A colleague's photo. The address carries the photo's id, so a new photo
   * is a new address, and each is kept a year as files are (ADR-059).
   */
  @Get(':userId/photo')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  async photo(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: PhotoSizeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | undefined> {
    const photo = await this.people.photo(userId, query.size ?? 'thumb');

    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    response.setHeader('ETag', photo.etag);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.headers['if-none-match'] === photo.etag) {
      response.status(304);
      return undefined;
    }

    return new StreamableFile(await this.people.stream(photo.key), {
      type: 'image/webp',
      length: photo.bytes,
    });
  }

  private async held(user: RequestContext) {
    return new Set(
      user.roleId ? await this.permissions.listForRole(user.roleId) : [],
    );
  }
}
