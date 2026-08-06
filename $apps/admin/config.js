window.$config = {
	...window.$config,
	app: 'admin', // 应用唯一标识
	title: '增进工坊后台', // 浏览器标题
	keepAlive: true, // 是否开启组件缓存
	multiTabs: true, // 是否开启多标签页
	loginStrict: true, // 是否强制登录
	publicLayout: false, // 是否公开可见完整框架布局 (false 时仅 admin 可见, 未登录或其他用户仅能看见具体页面内容)
}
