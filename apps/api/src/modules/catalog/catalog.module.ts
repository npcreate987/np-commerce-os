import { Module } from '@nestjs/common';
import { MerchantModule } from '../merchant/merchant.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [MerchantModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class CatalogModule {}
