import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderCurrency1777526565119 implements MigrationInterface {
    name = 'AddOrderCurrency1777526565119'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "currency" character varying(10) NOT NULL DEFAULT 'USD'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "currency"`);
    }

}
