/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 * @typedef {import('typeorm').QueryRunner} QueryRunner
 */

import { QueryRunner } from "typeorm/query-runner/QueryRunner.js";

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class OrderInit1776881543067 {
    name = 'OrderInit1776881543067'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" integer NOT NULL, "user_count" integer NOT NULL, "base_price" integer NOT NULL, "price_per_user" integer NOT NULL, "total_amount" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "orders"`);
    }
}
