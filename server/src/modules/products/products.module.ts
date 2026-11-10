import { Module } from '@nestjs/common';

import { FilesModule } from '../../core/files/files.module';
import { ProductCategoriesController } from './product-categories.controller';
import { ProductCategoriesService } from './product-categories.service';
import { ProductImagesService } from './product-images.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  // FilesService attaches and releases the gallery's images (ADR-062).
  imports: [FilesModule],
  // Categories first: their routes sit under /products, where the
  // products' `:id` would otherwise match `categories`.
  controllers: [ProductCategoriesController, ProductsController],
  providers: [ProductsService, ProductImagesService, ProductCategoriesService],
  exports: [ProductsService],
})
export class ProductsModule {}
