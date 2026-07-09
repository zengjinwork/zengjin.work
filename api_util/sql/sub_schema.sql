-- ============================================================
-- 订阅周期管家数据库建表脚本 (Supabase / PostgreSQL)
-- 执行前请确认已连接到正确的数据库
-- ============================================================

-- 订阅服务主表
CREATE TABLE IF NOT EXISTS sub (
    id              VARCHAR(20) PRIMARY KEY,
    user_id         VARCHAR(20) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    period_type     VARCHAR(20) NOT NULL,
    period_value    INT NOT NULL,
    start_time      DATE NOT NULL,
    end_time        DATE NOT NULL,
    remind_time     DATE NOT NULL,
    warn_time       DATE NOT NULL,
    category        VARCHAR(50) DEFAULT '',
    tags            VARCHAR(200) DEFAULT '',
    price           NUMERIC(10, 2) DEFAULT 0,
    currency        VARCHAR(10) DEFAULT 'CNY',
    url             VARCHAR(255) DEFAULT '',
    remark          TEXT DEFAULT '',
    "insertTime"    TIMESTAMPTZ DEFAULT NOW(),
    "updateTime"    TIMESTAMPTZ,
    "deleteTime"    TIMESTAMPTZ
);

-- 变更历史附属表
CREATE TABLE IF NOT EXISTS sub_history (
    id              VARCHAR(20) PRIMARY KEY,
    sub_id          VARCHAR(20) NOT NULL REFERENCES sub(id),
    user_id         VARCHAR(20) NOT NULL,
    action_type     VARCHAR(20) NOT NULL,
    change_desc     TEXT DEFAULT '',
    "insertTime"    TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_sub_user_deleteTime ON sub (user_id, "deleteTime");
CREATE INDEX IF NOT EXISTS idx_sub_history_subId ON sub_history (sub_id);
