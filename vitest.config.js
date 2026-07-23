import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        // 服务端测试使用 Node.js 环境
        environment: 'node',
        globals: true,
        include: ['api_util/__tests__/**/*.test.js'],
        // 设置环境变量供 crypto.js 和 jwt.js 使用
        env: {
            JWT_SECRET: 'test-jwt-secret-for-unit-tests-only',
            CRYPTO_SECRET: 'test-crypto-secret-for-unit-tests-only',
        },
    },
})
