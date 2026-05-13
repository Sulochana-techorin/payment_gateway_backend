import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCardUpdatedAtToOrder1778610853462 implements MigrationInterface {
    name = 'AddCardUpdatedAtToOrder1778610853462'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "card_updated_at" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "card_updated_at"`);
    }

}
