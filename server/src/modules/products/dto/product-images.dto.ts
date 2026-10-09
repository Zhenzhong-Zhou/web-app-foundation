import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

import { MAX_PRODUCT_IMAGES } from '../product-images';

/** An uploaded product image to add to the gallery (ADR-062). */
export class AddProductImageDto {
  @IsUUID()
  fileId!: string;
}

/** The gallery's new order, the cover first. */
export class OrderProductImagesDto {
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_IMAGES)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  fileIds!: string[];
}
