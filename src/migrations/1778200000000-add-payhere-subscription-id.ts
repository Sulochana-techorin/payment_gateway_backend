import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPayhereSubscriptionId1778200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "payhere_subscription_id" varchar NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "payhere_subscription_id"`
    );
  }
}
