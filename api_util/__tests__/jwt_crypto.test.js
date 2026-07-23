/**
 * api_util/jwt.js + api_util/crypto.js 单元测试
 *
 * 测试覆盖：
 *  - jwt:  generateAccessToken()  生成有效JWT
 *  - jwt:  verifyAccessToken()   验证/拒绝Token
 *  - jwt:  generateRefreshToken() 生成随机刷新令牌
 *  - crypto: encryptPassword / decryptPassword  加解密往返
 *  - crypto: hashToken()          SHA256哈希
 *  - crypto: generateRandomToken() 随机令牌生成
 */
import { describe, it, expect } from 'vitest'
import { generateAccessToken, verifyAccessToken, generateRefreshToken } from '../jwt.js'
import { encryptPassword, decryptPassword, hashToken, generateRandomToken } from '../crypto.js'

// ============================================================
// JWT — Access Token 生成与验证
// ============================================================
describe('generateAccessToken()', () => {
    it('应返回一个非空字符串', () => {
        const token = generateAccessToken({ userId: 'test001', username: 'admin' })
        expect(token).toBeTruthy()
        expect(typeof token).toBe('string')
        expect(token.split('.').length).toBe(3) // JWT 三段式: header.payload.signature
    })
})

describe('verifyAccessToken()', () => {
    it('应能验证合法 token 并返回原始载荷', () => {
        const payload = { userId: 'user123', username: 'testuser' }
        const token = generateAccessToken(payload)
        const decoded = verifyAccessToken(token)

        expect(decoded.userId).toBe('user123')
        expect(decoded.username).toBe('testuser')
    })

    it('篡改过的 token 应抛出 "Token无效"', () => {
        const token = generateAccessToken({ userId: 'test' })
        // 修改最后一位字符来伪造
        const tampered = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a')

        expect(() => verifyAccessToken(tampered)).toThrow('Token无效')
    })

    it('空字符串应抛出异常', () => {
        expect(() => verifyAccessToken('')).toThrow()
    })

    it('完全随机的字符串应抛出 "Token无效"', () => {
        expect(() => verifyAccessToken('not.a.valid.jwt.token.at.all')).toThrow('Token无效')
    })
})

describe('generateRefreshToken()', () => {
    it('应返回64位十六进制字符串（32字节）', () => {
        const token = generateRefreshToken()
        expect(token).toHaveLength(64)
        expect(/^[0-9a-f]{64}$/.test(token)).toBe(true)
    })

    it('连续生成1000次不应重复', () => {
        const tokens = new Set(Array.from({ length: 1000 }, () => generateRefreshToken()))
        expect(tokens.size).toBe(1000)
    })
})

// ============================================================
// Crypto — AES 密码加解密
// ============================================================
describe('encryptPassword + decryptPassword', () => {
    it('加密后再解密应还原原始密码', () => {
        const plain = 'mySecretPassword123'
        const encrypted = encryptPassword(plain)
        expect(encrypted).not.toBe(plain)
        expect(encrypted).toContain(':') // 格式: iv:data

        const decrypted = decryptPassword(encrypted)
        expect(decrypted).toBe(plain)
    })

    it('相同的密码两次加密应得到不同的密文（随机IV）', () => {
        const plain = 'samePassword'
        const enc1 = encryptPassword(plain)
        const enc2 = encryptPassword(plain)
        expect(enc1).not.toBe(enc2)
        // 但解密结果应相同
        expect(decryptPassword(enc1)).toBe(plain)
        expect(decryptPassword(enc2)).toBe(plain)
    })

    it('包含特殊字符的密码应正确加解密', () => {
        const plain = 'P@ssw0rd!@#$%^&*()_+-=[]{}|;:,.<>?/~`中文密码'
        const encrypted = encryptPassword(plain)
        expect(decryptPassword(encrypted)).toBe(plain)
    })

    it('空密码应能正确加解密', () => {
        const plain = ''
        const encrypted = encryptPassword(plain)
        expect(decryptPassword(encrypted)).toBe(plain)
    })

    it('密文格式错误应抛出异常', () => {
        expect(() => decryptPassword('invalid_ciphertext_without_colon')).toThrow('密文格式错误')
    })

    it('篡改过的密文应无法解密', () => {
        const encrypted = encryptPassword('test')
        const parts = encrypted.split(':')
        // 修改加密数据部分的一个字符
        const tamperedData = parts[1].slice(0, -1) + (parts[1].slice(-1) === 'a' ? 'b' : 'a')
        const tampered = parts[0] + ':' + tamperedData

        expect(() => decryptPassword(tampered)).toThrow()
    })
})

describe('hashToken()', () => {
    it('应返回64位十六进制字符串（SHA256）', () => {
        const hash = hashToken('some-random-token')
        expect(hash).toHaveLength(64)
        expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true)
    })

    it('相同输入应产生相同哈希（确定性）', () => {
        const input = 'test-token-123'
        expect(hashToken(input)).toBe(hashToken(input))
    })

    it('不同输入应产生不同哈希', () => {
        expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
    })
})

describe('generateRandomToken()', () => {
    it('默认32字节 → 64位十六进制字符串', () => {
        const token = generateRandomToken()
        expect(token).toHaveLength(64)
    })

    it('自定义字节长度', () => {
        expect(generateRandomToken(16)).toHaveLength(32)
        expect(generateRandomToken(8)).toHaveLength(16)
    })
})
