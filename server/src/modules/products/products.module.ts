import { Module } from '@nestjs/common';

import { FilesModule } from '../../core/files/files.module';
import { ProductImagesService } from './product-images.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  // FilesService attaches and releases the gallery's images (ADR-062).
  imports: [FilesModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductImagesService],
  exports: [ProductsService],
})
export class ProductsModule {}
