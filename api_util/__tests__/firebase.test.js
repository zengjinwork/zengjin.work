import { describe, expect, it } from 'vitest'

describe('Firebase recaptchaParams Test', () => {
	it('should fetch recaptchaSiteKey from Google Identity Toolkit', async () => {
		const apiKey = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyAltJyHFfhU0XjUr6ux7xkA6XIdGlVSLGE'
		const response = await fetch(`https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=${apiKey}`)
		const data = await response.json()
		console.log('Firebase recaptchaParams response:', data)
		expect(data).toHaveProperty('recaptchaSiteKey')
		expect(data.recaptchaSiteKey).toBeTruthy()
	})
})
