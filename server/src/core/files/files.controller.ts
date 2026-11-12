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
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { OrganizationFileKind } from '../../database/schema';
import { t, type Translatable } from '../../i18n/translate';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestContext } from '../auth/request-context';
import { limit } from '../auth/throttle-limits';
import { PERMISSIONS } from '../authorization/permissions';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import type { UploadedFileEnvelope } from './dto/file-response.dto';
import { ReadFileDto } from './dto/read-file.dto';
import { KIND_RULES } from './file-kinds';
import {
  FilesService,
  type FileView,
  type UploadedBinary,
} from './files.service';
import { receiveFile } from './receive-file';

/** Each kind's refusal past its limit, given in MB (#249). */
const TOO_LARGE: Record<OrganizationFileKind, (limit: number) => Translatable> =
  {
    logo: (limit) =>
      t(
        {
          id: 'files.logo.tooLarge',
          defaultMessage:
            'A logo can be up to {limit}\u00a0MB. Choose a smaller file, or save it smaller first.',
        },
        { limit },
      ),
    square_logo: (limit) =>
      t(
        {
          id: 'files.squareLogo.tooLarge',
          defaultMessage:
            'A square logo can be up to {limit}\u00a0MB. Choose a smaller file, or save it smaller first.',
        },
        { limit },
      ),
    product_image: (limit) =>
      t(
        {
          id: 'files.photo.tooLarge',
          defaultMessage:
            'A photo can be up to {limit}\u00a0MB. Choose a smaller file, or save it smaller first.',
        },
        { limit },
      ),
  };

/**
 * The kind's size limit, enforced by multer while the upload arrives: past
 * it nothing more is kept, and the request is refused with 413 in the
 * kind's own words. One route per kind, so the limit and the permission
 * are both known before a byte is.
 */
function receive(kind: OrganizationFileKind) {
  return receiveFile(KIND_RULES[kind].maxBytes, TOO_LARGE[kind]);
}

/**
 * Files (ADR-059): uploaded here, one route per kind, and read back through
 * the app's own domain, never a provider's URL.
 */
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('logo')
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @UseInterceptors(receive('logo'))
  uploadLogo(
    @CurrentUser() user: RequestContext,
    @UploadedFile() file: UploadedBinary | undefined,
  ): Promise<UploadedFileEnvelope> {
    return this.keep('logo', user, file);
  }

  @Post('square-logo')
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @UseInterceptors(receive('square_logo'))
  uploadSquareLogo(
    @CurrentUser() user: RequestContext,
    @UploadedFile() file: UploadedBinary | undefined,
  ): Promise<UploadedFileEnvelope> {
    return this.keep('square_logo', user, file);
  }

  @Post('product-image')
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @UseInterceptors(receive('product_image'))
  uploadProductImage(
    @CurrentUser() user: RequestContext,
    @UploadedFile() file: UploadedBinary | undefined,
  ): Promise<UploadedFileEnvelope> {
    return this.keep('product_image', user, file);
  }

  /**
   * One size of a file. The kind's view permission is checked in the
   * service, since the file's kind is known only once it is read. A file
   * never changes, so a browser keeps it until it is gone.
   *
   * Its own allowance, counted per person on this route as on every other
   * (ADR-011): the first scroll through a long list asks for each new
   * picture at once.
   */
  @Get(':id')
  @Throttle({ default: { limit: limit(1000), ttl: 60_000 } })
  async read(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ReadFileDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | undefined> {
    const file = await this.files.find(id, query.size ?? 'full', user);

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
    kind: OrganizationFileKind,
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
