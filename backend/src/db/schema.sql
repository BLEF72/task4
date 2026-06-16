CREATE TABLE IF NOT EXISTS users (
    id                   SERIAL PRIMARY KEY,
    name                 VARCHAR(255) NOT NULL,
    email                VARCHAR(255) NOT NULL,
    password_hash        VARCHAR(255) NOT NULL,
    status               VARCHAR(20)  NOT NULL DEFAULT 'unverified'
                         CHECK (status IN ('unverified', 'active', 'blocked')),
    verification_token   VARCHAR(255),
    registration_time    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login           TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (email);
CREATE INDEX IF NOT EXISTS users_last_login_idx ON users (last_login DESC NULLS LAST);
