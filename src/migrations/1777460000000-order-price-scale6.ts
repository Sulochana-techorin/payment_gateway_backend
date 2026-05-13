import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Increase price column precision from numeric(10,2) to numeric(14,6)
 * so values like 0.0001 are stored correctly.
 */
export class OrderPriceScale61777460000000 implements MigrationInterface {
  name = "OrderPriceScale61777460000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "base_price" TYPE numeric(14,6) USING "base_price"::numeric(14,6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "price_per_user" TYPE numeric(14,6) USING "price_per_user"::numeric(14,6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "subscription_amount" TYPE numeric(14,6) USING "subscription_amount"::numeric(14,6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "total_amount" TYPE numeric(14,6) USING "total_amount"::numeric(14,6)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "total_amount" TYPE numeric(10,2) USING "total_amount"::numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "subscription_amount" TYPE numeric(10,2) USING "subscription_amount"::numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "price_per_user" TYPE numeric(10,2) USING "price_per_user"::numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "base_price" TYPE numeric(10,2) USING "base_price"::numeric(10,2)`,
    );
  }
}
