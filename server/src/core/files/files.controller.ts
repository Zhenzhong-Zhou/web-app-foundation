import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import type { FileKind } from '../../database/schema';
import { t } from '../../i18n/translate';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../authorization/permissions';
import { PermissionsService } from '../authorization/permissions.service';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { ReadFileDto } from './dto/read-file.dto';
import { KIND_RULES } from './file-kinds';
import {
  FilesService,
  type FileView,
  type UploadedBinary,
} from './files.service';

/**
 * The kind's size limit, enforced by multer while the upload arrives: past
 * it the request is cut off with 413, not read to the end. One route per
 * kind, so the limit and the permission are both known before a byte is.
 */
function receive(kind: FileKind) {
  return FileInterceptor('file', {
    limits: { fileSize: KIND_RULES[kind].maxBytes, files: 1 },
  });
}

/**
 * Files (ADR-059): uploaded here, one route per kind, and read back through
 * the app's own domain, never a provider's URL.
 */
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly permissions: PermissionsService,
  ) {}

  @Post('logo')
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @UseInterceptors(receive('logo'))
  uploadLogo(
    @CurrentUser() user: RequestContext,
    @UploadedFile() file: UploadedBinary | undefined,
  ) {
    return this.keep('logo', user, file);
  }

  @Post('product-image')
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @UseInterceptors(receive('product_image'))
  uploadProductImage(
    @CurrentUser() user: RequestContext,
    @UploadedFile() file: UploadedBinary | undefined,
  ) {
    return this.keep('product_image', user, file);
  }

  /**
   * One size of a file. The kind's view permission is checked in the
   * service, since the file's kind is known only once it is read. A file
   * never changes, so a browser keeps it until it is gone.
   */
  @Get(':id')
  async read(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ReadFileDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | undefined> {
    const held = new Set(
      user.roleId ? await this.permissions.listForRole(user.roleId) : [],
    );
    const file = await this.files.find(id, query.size ?? 'full', held);

    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    response.setHeader('ETag', file.etag);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.headers['if-none-match'] === file.etag) {
      response.status(304);
      return undefined;
    }

    return new StreamableFile(await this.files.stream(file), {
      type: file.contentType,
      length: file.bytes,
      disposition: file.disposition,
    });
  }

  private async keep(
    kind: FileKind,
    user: RequestContext,
    file: UploadedBinary | undefined,
  ): Promise<{ file: FileView }> {
    if (!file) {
      throw new BadRequestException(
        t({
          id: 'files.upload.missing',
          defaultMessage: 'Choose a file to upload',
        }),
      );
    }
    return { file: await this.files.upload(kind, file, user.userId) };
  }
}
