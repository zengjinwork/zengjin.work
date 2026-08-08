import admin from 'firebase-admin'

/**
 * Firebase Admin SDK 单例初始化与代理工具
 */
function get_firebase_admin() {
	if (!admin.apps.length) {
		const projectId = process.env.FIREBASE_PROJECT_ID
		const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
		let privateKey = process.env.FIREBASE_PRIVATE_KEY

		if (privateKey) {
			// 处理环境变量转义换行符
			privateKey = privateKey.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1')
		}

		if (projectId && clientEmail && privateKey) {
			admin.initializeApp({
				credential: admin.credential.cert({
					projectId,
					clientEmail,
					privateKey,
				}),
			})
		} else {
			console.warn('[Firebase Admin] 缺少必要环境变量，无法初始化 Firebase Admin SDK')
		}
	}
	return admin
}

export default get_firebase_admin
