import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProcessedWebhooks1778700000000 implements MigrationInterface {
    name = 'AddProcessedWebhooks1778700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "processed_webhooks" (
                "id" SERIAL NOT NULL,
                "payment_id" character varying NOT NULL,
                "order_id" uuid NOT NULL,
                "status_code" character varying(10) NOT NULL,
                "charge_type" character varying(20) NOT NULL DEFAULT 'UNKNOWN',
                "processed_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_processed_webhooks_payment_id" UNIQUE ("payment_id"),
                CONSTRAINT "PK_processed_webhooks" PRIMARY KEY ("id")
            )
        `);

        // Index for fast lookups by payment_id
        await queryRunner.query(`
            CREATE INDEX "IDX_processed_webhooks_payment_id" ON "processed_webhooks" ("payment_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_processed_webhooks_payment_id"`);
        await queryRunner.query(`DROP TABLE "processed_webhooks"`);
    }
}
