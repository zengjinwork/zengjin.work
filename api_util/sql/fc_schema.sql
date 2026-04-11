-- ============================================================
-- FC 游戏站数据库建表脚本 (Supabase / PostgreSQL)
-- 执行前请确认已连接到正确的数据库
-- ============================================================

-- 游戏主表
CREATE TABLE IF NOT EXISTS game (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    cover           VARCHAR(255) DEFAULT '',
    "keymapConfig"  JSONB,
    "keymapDesc"    JSONB,
    maker           VARCHAR(100) DEFAULT '',
    "playerCount"   VARCHAR(20) DEFAULT '',
    "releaseDate"   DATE,
    summary         TEXT DEFAULT '',
    "playCount"     INT DEFAULT 0,
    "romPath"       VARCHAR(255) DEFAULT '',
    sort            INT DEFAULT 0,
    "insertTime"    TIMESTAMPTZ DEFAULT NOW(),
    "updateTime"    TIMESTAMPTZ,
    "deleteTime"    TIMESTAMPTZ
);

-- 游戏别称表
CREATE TABLE IF NOT EXISTS game_alias (
    id              SERIAL PRIMARY KEY,
    "gameId"        INT NOT NULL REFERENCES game(id),
    alias           VARCHAR(100) NOT NULL
);

-- 分类表
CREATE TABLE IF NOT EXISTS game_category (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL,
    sort            INT DEFAULT 0
);

-- 游戏 ↔ 分类 关联表
CREATE TABLE IF NOT EXISTS game_category_link (
    "gameId"        INT NOT NULL REFERENCES game(id),
    "categoryId"    INT NOT NULL REFERENCES game_category(id),
    PRIMARY KEY ("gameId", "categoryId")
);

-- 标签表
CREATE TABLE IF NOT EXISTS game_tag (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL
);

-- 游戏 ↔ 标签 关联表
CREATE TABLE IF NOT EXISTS game_tag_link (
    "gameId"        INT NOT NULL REFERENCES game(id),
    "tagId"         INT NOT NULL REFERENCES game_tag(id),
    PRIMARY KEY ("gameId", "tagId")
);

-- 图片表
CREATE TABLE IF NOT EXISTS game_img (
    id              SERIAL PRIMARY KEY,
    "gameId"        INT NOT NULL REFERENCES game(id),
    url             VARCHAR(255) NOT NULL,
    sort            INT DEFAULT 0
);

-- Banner 轮播表
CREATE TABLE IF NOT EXISTS game_banner (
    id              SERIAL PRIMARY KEY,
    "gameId"        INT REFERENCES game(id),
    image           VARCHAR(255) DEFAULT '',
    link            VARCHAR(255) DEFAULT '',
    sort            INT DEFAULT 0,
    "insertTime"    TIMESTAMPTZ DEFAULT NOW(),
    "deleteTime"    TIMESTAMPTZ
);

-- ============================================================
-- 可选：常用查询索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_game_deleteTime ON game ("deleteTime");
CREATE INDEX IF NOT EXISTS idx_game_alias_gameId ON game_alias ("gameId");
CREATE INDEX IF NOT EXISTS idx_game_category_link_gameId ON game_category_link ("gameId");
CREATE INDEX IF NOT EXISTS idx_game_tag_link_gameId ON game_tag_link ("gameId");
CREATE INDEX IF NOT EXISTS idx_game_img_gameId ON game_img ("gameId");
CREATE INDEX IF NOT EXISTS idx_game_banner_deleteTime ON game_banner ("deleteTime");
