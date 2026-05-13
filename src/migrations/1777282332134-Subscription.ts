import { MigrationInterface, QueryRunner } from "typeorm";

export class Subscription1777282332134 implements MigrationInterface {
    name = 'Subscription1777282332134'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" integer NOT NULL, "order_id" uuid NOT NULL, "start_date" TIMESTAMP NOT NULL DEFAULT now(), "end_date" TIMESTAMP NOT NULL, "status" character varying NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "status" character varying(20) NOT NULL DEFAULT 'PENDING'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "status" character varying NOT NULL`);
        await queryRunner.query(`DROP TABLE "subscriptions"`);
    }

}
