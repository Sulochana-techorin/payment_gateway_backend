import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderPriceDecimal1777002500000 implements MigrationInterface {
  name = "OrderPriceDecimal1777002500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "base_price" TYPE numeric(10,2) USING "base_price"::numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "price_per_user" TYPE numeric(10,2) USING "price_per_user"::numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "total_amount" TYPE numeric(10,2) USING "total_amount"::numeric(10,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "total_amount" TYPE integer USING TRUNC("total_amount")::integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "price_per_user" TYPE integer USING TRUNC("price_per_user")::integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "base_price" TYPE integer USING TRUNC("base_price")::integer`,
    );
  }
}
