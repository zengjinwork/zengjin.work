-- ============================================================
-- FC 游戏站数据库建表脚本 (Supabase / PostgreSQL)
-- 执行前请确认已连接到正确的数据库
-- ============================================================

-- 游戏主表
CREATE TABLE IF NOT EXISTS fc (
    id              VARCHAR(20) PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS fc_alias (
    id              VARCHAR(20) PRIMARY KEY,
    "fcId"          VARCHAR(20) NOT NULL REFERENCES fc(id),
    alias           VARCHAR(100) NOT NULL
);

-- 分类表
CREATE TABLE IF NOT EXISTS fc_category (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(50) NOT NULL,
    sort            INT DEFAULT 0
);

-- 游戏 ↔ 分类 关联表
CREATE TABLE IF NOT EXISTS fc_category_link (
    "fcId"          VARCHAR(20) NOT NULL REFERENCES fc(id),
    "categoryId"    VARCHAR(20) NOT NULL REFERENCES fc_category(id),
    PRIMARY KEY ("fcId", "categoryId")
);

-- 标签表
CREATE TABLE IF NOT EXISTS fc_tag (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(50) NOT NULL
);

-- 游戏 ↔ 标签 关联表
CREATE TABLE IF NOT EXISTS fc_tag_link (
    "fcId"          VARCHAR(20) NOT NULL REFERENCES fc(id),
    "tagId"         VARCHAR(20) NOT NULL REFERENCES fc_tag(id),
    PRIMARY KEY ("fcId", "tagId")
);

-- 图片表
CREATE TABLE IF NOT EXISTS fc_img (
    id              VARCHAR(20) PRIMARY KEY,
    "fcId"          VARCHAR(20) NOT NULL REFERENCES fc(id),
    url             VARCHAR(255) NOT NULL,
    sort            INT DEFAULT 0
);

-- Banner 轮播表
CREATE TABLE IF NOT EXISTS fc_banner (
    id              VARCHAR(20) PRIMARY KEY,
    "fcId"          VARCHAR(20) REFERENCES fc(id),
    image           VARCHAR(255) DEFAULT '',
    link            VARCHAR(255) DEFAULT '',
    sort            INT DEFAULT 0,
    "insertTime"    TIMESTAMPTZ DEFAULT NOW(),
    "deleteTime"    TIMESTAMPTZ
);

-- 厂商表
CREATE TABLE IF NOT EXISTS fc_maker (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    sort            INT DEFAULT 0
);

-- ============================================================
-- 可选：常用查询索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_fc_deleteTime ON fc ("deleteTime");
CREATE INDEX IF NOT EXISTS idx_fc_alias_fcId ON fc_alias ("fcId");
CREATE INDEX IF NOT EXISTS idx_fc_category_link_fcId ON fc_category_link ("fcId");
CREATE INDEX IF NOT EXISTS idx_fc_tag_link_fcId ON fc_tag_link ("fcId");
CREATE INDEX IF NOT EXISTS idx_fc_img_fcId ON fc_img ("fcId");
CREATE INDEX IF NOT EXISTS idx_fc_banner_deleteTime ON fc_banner ("deleteTime");
