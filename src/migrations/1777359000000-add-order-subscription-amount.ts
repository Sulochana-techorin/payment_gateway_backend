import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderSubscriptionAmount1777359000000 implements MigrationInterface {
  name = "AddOrderSubscriptionAmount1777359000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "subscription_amount" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE "orders" SET "subscription_amount" = GREATEST("total_amount" - "base_price", 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "subscription_amount" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "subscription_amount"`);
  }
}
