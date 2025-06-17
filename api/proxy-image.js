// api/proxy-image.js
// 这是一个兼容性文件，用于在Vercel环境中将代理图片请求转发到server.js
// 在本地环境中，请求直接由server.js处理

// 导入server.js中导出的Express应用
const app = require('../server');

// 导出处理函数，使用app处理请求
module.exports = (req, res) => {
  console.log('API路由 /api/proxy-image 被调用，转发到server.js');
  return app(req, res);
}; 