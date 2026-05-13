import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderInvoicePath1777291000000 implements MigrationInterface {
  name = "AddOrderInvoicePath1777291000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "invoice_path" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "invoice_path"`);
  }
}
