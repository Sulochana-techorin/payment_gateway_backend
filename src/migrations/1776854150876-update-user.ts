/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 * @typedef {import('typeorm').QueryRunner} QueryRunner
 */

import { QueryRunner } from "typeorm/query-runner/QueryRunner.js";

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class UpdateUser1776854150876 {
    name = 'UpdateUser1776854150876'

    
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "password" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD "userCount" integer NOT NULL`);
    }
 
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "userCount"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password"`);
    }
}
