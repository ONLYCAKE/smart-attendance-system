# Skill: Database Engineering

## Required context
Read database design, PRD, database rules, and database plan.

## Procedure
1. Inspect current Prisma schema and migration history.
2. Confirm relationships, uniqueness, deletion behavior, and query patterns.
3. Make the smallest necessary schema change.
4. Generate a migration; do not rewrite applied migrations.
5. Test on a clean database and relevant fixtures.
6. Check rollback/transaction behavior and indexes.
7. Update database documentation.

## Constraints
Preserve historical attendance; never remove constraints to make a test pass without a documented decision.
