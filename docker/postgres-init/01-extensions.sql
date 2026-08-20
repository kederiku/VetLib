-- gen_random_uuid() est natif depuis PG13 ; pgcrypto reste nécessaire pour digest() (chaînage hash côté audit).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
