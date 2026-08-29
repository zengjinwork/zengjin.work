-- 网站首页应用清单表 base_app (系统级基础表)
-- 说明：表结构与种子数据由 api/_base/app.js 在首次请求时自动创建/注入，
--       本脚本仅作为 DDL 文档与手动初始化参考（对齐 api_util/sql/fc_schema.sql 惯例）。

CREATE TABLE IF NOT EXISTS base_app (
    id         VARCHAR(20) PRIMARY KEY,
    name       VARCHAR(50)  NOT NULL UNIQUE,
    title      VARCHAR(100) NOT NULL,
    alias      VARCHAR(100) DEFAULT '',
    desc       VARCHAR(255) DEFAULT '',
    icon       VARCHAR(100) DEFAULT '',
    icon_color VARCHAR(20)  DEFAULT '',
    category   VARCHAR(20)  DEFAULT 'tool',
    url        VARCHAR(150) DEFAULT '',
    featured   SMALLINT     DEFAULT 0,
    tag        VARCHAR(20)  DEFAULT '',
    visibility VARCHAR(20)  DEFAULT 'public',
    status     INT          DEFAULT 1,
    show       BOOLEAN      DEFAULT true,
    sort       INT          DEFAULT 0,
    createtime TIMESTAMPTZ  DEFAULT NOW(),
    updatetime TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_base_app_show_status_sort ON base_app (show, status, sort);
