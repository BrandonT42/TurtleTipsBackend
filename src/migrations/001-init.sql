-- Up
CREATE TABLE IF NOT EXISTS `block_heights` (
    `block_hash`	VARCHAR(64) NOT NULL UNIQUE,
    `height`	BIGINT NOT NULL UNIQUE,
    PRIMARY KEY(`block_hash`)
);

CREATE TABLE IF NOT EXISTS `transactions` (
    `transaction_hash`	VARCHAR(64) NOT NULL UNIQUE,
    `block_hash`	VARCHAR(64) NOT NULL,
    `payment_id`	VARCHAR NOT NULL,
    `unlock_time`	BIGINT NOT NULL,
    PRIMARY KEY(`transaction_hash`,`unlock_time`),
    FOREIGN KEY(`block_hash`) REFERENCES `block_heights`(`block_hash`)
);

CREATE TABLE IF NOT EXISTS `sync` (
    `height`	BIGINT NOT NULL,
    `last_checkpoint`	BIGINT NOT NULL,
    `checkpoints`	BLOB,
    `last_known_block_hashes`	BLOB
);

CREATE TABLE IF NOT EXISTS `pubkeys` (
    `pubkey`	VARCHAR(64) NOT NULL UNIQUE,
    `creation_height`	BIGINT NOT NULL,
    PRIMARY KEY(`pubkey`)
);

CREATE TABLE IF NOT EXISTS `inputs` (
    `transaction_hash`	VARCHAR(64) NOT NULL,
    `block_height`  BIGINT NOT NULL,
    `key_image`	VARCHAR(64) NOT NULL UNIQUE,
    `amount`	BIGINT NOT NULL,
    PRIMARY KEY(`key_image`,`transaction_hash`),
    FOREIGN KEY(`transaction_hash`) REFERENCES `transactions`(`transaction_hash`),
    FOREIGN KEY(`block_height`) REFERENCES `block_heights`(`height`)
);

CREATE TABLE IF NOT EXISTS `outputs` (
    `pubkey` VARCHAR(64) NOT NULL,
    `transaction_hash`	VARCHAR(64) NOT NULL,
    `transaction_index`	INTEGER NOT NULL,
    `global_index`	BIGINT NOT NULL UNIQUE,
    `amount`	BIGINT NOT NULL,
    `public_ephemeral`	VARCHAR(64) NOT NULL,
    `derivation`	VARCHAR(64) NOT NULL,
    `unlock_time`	BIGINT,
    PRIMARY KEY(`transaction_hash`,`transaction_index`),
    FOREIGN KEY(`transaction_hash`,`unlock_time`) REFERENCES `transactions`(`transaction_hash`,`unlock_time`),
    FOREIGN KEY(`pubkey`) REFERENCES `pubkeys`(`pubkey`)
);

CREATE TABLE IF NOT EXISTS `hosts` (
    `host`	VARCHAR NOT NULL UNIQUE,
    `pubkey`	VARCHAR(64) NOT NULL,
    PRIMARY KEY(`host`),
    FOREIGN KEY(`pubkey`) REFERENCES `pubkeys`(`pubkey`)
);

-- Down
DROP TABLE IF EXISTS `block_heights`;
DROP TABLE IF EXISTS `transactions`;
DROP TABLE IF EXISTS `sync`;
DROP TABLE IF EXISTS `pubkeys`;
DROP TABLE IF EXISTS `inputs`;
DROP TABLE IF EXISTS `outputs`;
DROP TABLE IF EXISTS `hosts`;