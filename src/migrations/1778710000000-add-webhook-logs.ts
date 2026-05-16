import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWebhookLogs1778710000000 implements MigrationInterface {
    name = 'AddWebhookLogs1778710000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "webhook_logs" (
                "id" SERIAL NOT NULL,
                "order_id" character varying,
                "payment_id" character varying,
                "status_code" character varying,
                "payload" jsonb NOT NULL,
                "error_message" text,
                "stack_trace" text,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_webhook_logs" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_webhook_logs_order_id" ON "webhook_logs" ("order_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_webhook_logs_order_id"`);
        await queryRunner.query(`DROP TABLE "webhook_logs"`);
    }
}
