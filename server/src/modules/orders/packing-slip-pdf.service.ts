import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { documentText } from '../../core/documents/document-text';
import {
  DocumentsService,
  paperFor,
} from '../../core/documents/documents.service';
import {
  packingSlipDocument,
  packingSlipFileName,
} from './packing-slip-document';
import { ShipmentsService } from './shipments.service';

/** A shipment's packing slip as a PDF (ADR-071), read as its page reads it. */
@Injectable()
export class PackingSlipPdfService {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly documents: DocumentsService,
  ) {}

  async send(
    orderId: string,
    shipmentId: string,
    res: Response,
    download: boolean,
  ): Promise<void> {
    const slip = await this.shipments.slip(orderId, shipmentId);
    const letterhead = await this.documents.letterhead();

    await this.documents.send(
      res,
      packingSlipDocument(
        slip,
        documentText(slip.language, slip.secondLanguage, letterhead.country),
        letterhead.logo,
      ),
      paperFor(letterhead.country),
      packingSlipFileName(slip),
      download,
    );
  }
}
